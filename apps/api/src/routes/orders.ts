import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { calculateBalanceDue, Permission } from '@lolas/shared';
import { z } from 'zod';
import { supabase } from '../adapters/supabase/client.js';
import { sendTelegramAlert, sendTelegramAlertPaidOrdersStaggered, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';
import { deriveTransportService } from '../lib/transport-service.js';

const router = Router();
router.use(authenticate);

const StoreQuerySchema = z.object({
  storeId: z.string(),
  status: z.string().optional(),
});

router.get('/', requirePermission(Permission.ViewInbox), validateQuery(StoreQuerySchema), async (req, res, next) => {
  try {
    const { storeId, status } = req.query as { storeId: string; status?: string };
    const { orderRepo } = req.app.locals.deps;
    const orders = await orderRepo.findByStore(storeId, { status });
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
});

router.get('/enriched', requirePermission(Permission.ViewInbox), validateQuery(StoreQuerySchema), async (req, res, next) => {
  try {
    const { storeId, status } = req.query as { storeId: string; status?: string };
    const sb = supabase;

    const statuses = status ? status.split(',').map((s) => s.trim()).filter(Boolean) : null;

    type EnrichedOrderItem = {
      id: string;
      vehicle_id: string;
      vehicle_name: string;
      pickup_datetime: string | null;
      dropoff_datetime: string;
      pickup_location_id: string | number | null;
      dropoff_location_id: string | number | null;
      pickup_location: string | null;
      dropoff_location: string | null;
      pickup_fee: number | string | null;
      dropoff_fee: number | string | null;
      discount: number;
    };
    type EnrichedOrderRow = {
      id: string;
      store_id: string;
      order_date: string;
      customer_id: string | null;
      booking_customer_name: string | null;
      status: string;
      final_total: number | string | null;
      web_notes: string | null;
      payment_method_id: string | null;
      deposit_method_id: string | null;
      security_deposit: number | string | null;
      card_fee_surcharge: number | string | null;
      woo_order_id: string | null;
      booking_token: string | null;
      partner_ref: string | null;
      customer_name: string | null;
      customer_mobile: string | null;
      customer_email: string | null;
      items: EnrichedOrderItem[] | null;
      total_paid: number | string | null;
      pending_extensions_total: number | string | null;
      has_extension: boolean;
      has_nine_pm_addon: boolean;
      waiver_status: string;
      waiver_signed_at: string | null;
      inspection_status: 'pending' | 'completed';
    };

    // A single server-side aggregation (see migration
    // 20261002000000_get_enriched_orders_rpc.sql) replaces the old
    // fetch-then-`.in('order_id', orderIds)` follow-up queries, whose request
    // URLs grew with the number of matching orders and blew past the ~16KB
    // HTTP header limit once a store accumulated a few hundred completed
    // orders — which silently emptied this list.
    const { data: rows, error } = await sb.rpc('get_enriched_orders', {
      p_store_id: storeId,
      p_statuses: statuses,
    });
    if (error) throw new Error(`enriched orders query failed: ${error.message}`);

    const orderRows = (rows ?? []) as EnrichedOrderRow[];

    // Load location names as well as IDs. Older activated partner bookings lost
    // their location IDs while keeping the names and zero (waived) fees.
    const { data: transportLocations, error: locationsErr } = orderRows.length > 0
      ? await sb
          .from('locations')
          .select('id, name, location_type, delivery_cost, collection_cost')
          .or(`store_id.eq.${storeId},store_id.is.null`)
      : { data: [], error: null };
    if (locationsErr) throw new Error(`enriched locations query failed: ${locationsErr.message}`);

    const enriched = orderRows.map((o) => {
      const items = o.items ?? [];
      const vehicleNames = items.map((i) => i.vehicle_name).filter(Boolean).join(', ');
      const primaryItem = items[0] ?? null;
      const returnDatetime = items.reduce<string | null>((latest, i) => {
        if (!i.dropoff_datetime) return latest;
        return !latest || i.dropoff_datetime > latest ? i.dropoff_datetime : latest;
      }, null);

      const totalDiscount = items.reduce((sum, i) => sum + Number(i.discount ?? 0), 0);

      const finalTotalNum = Number(o.final_total ?? 0);
      const totalPaidNum = Number(o.total_paid ?? 0);
      // Pending extension charges already increase final_total. Adding them
      // again here overstates the balance when earlier payments cover part of
      // the extension.
      const balanceDueComputed = calculateBalanceDue(finalTotalNum, totalPaidNum);

      const transportService = deriveTransportService(items, transportLocations ?? [], {
        // Free partner delivery/collection is saved using the establishment
        // name (for example, "Bravo Beach Resort"). It is intentionally not a
        // configured pricing-zone name, and its fee is zero because it was
        // waived, but the operational transport job still exists.
        unknownNamedLocationsRequireTransport: Boolean(o.partner_ref),
      });

      const pickupDatetime = primaryItem?.pickup_datetime ?? null;

      return {
        id: o.id,
        storeId: o.store_id,
        orderDate: o.order_date,
        customerName: (o.booking_customer_name?.trim() || o.customer_name) ?? '—',
        customerMobile: o.customer_mobile ?? null,
        customerEmail: o.customer_email?.trim() || null,
        vehicleNames: vehicleNames || '—',
        returnDatetime,
        pickupDatetime,
        wooOrderId: o.woo_order_id ?? null,
        bookingToken: o.booking_token,
        finalTotal: finalTotalNum,
        balanceDue: balanceDueComputed,
        totalPaid: totalPaidNum,
        pendingExtensionsTotal: Number(o.pending_extensions_total ?? 0),
        securityDeposit: Number(o.security_deposit ?? 0),
        cardFeeSurcharge: Number(o.card_fee_surcharge ?? 0),
        status: o.status,
        webNotes: o.web_notes,
        paymentMethodId: o.payment_method_id,
        depositMethodId: o.deposit_method_id,
        waiverStatus: (o.waiver_status as 'pending' | 'signed' | 'expired' | undefined) ?? 'pending',
        waiverSignedAt: o.waiver_signed_at ?? null,
        inspectionStatus: o.inspection_status,
        hasExtension: o.has_extension,
        hasNinePmAddon: o.has_nine_pm_addon,
        transportService,
        partnerRef: o.partner_ref ?? null,
        primaryVehicleId: primaryItem?.vehicle_id ?? null,
        primaryVehicleName: primaryItem?.vehicle_name ?? null,
        primaryOrderItemId: primaryItem?.id ?? null,
        totalDiscount,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
});

router.get('/:id', requirePermission(Permission.ViewInbox), async (req, res, next) => {
  try {
    const order = await req.app.locals.deps.orderRepo.findById(req.params.id);
    if (!order) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } }); return; }
    const base = order.toJSON() as Record<string, unknown>;
    let customerEmail: string | null = null;
    if (order.customerId) {
      const { data: c } = await supabase.from('customers').select('email').eq('id', order.customerId).maybeSingle();
      const em = (c as { email?: string } | null)?.email?.trim();
      customerEmail = em || null;
    }
    const { data: noteRow } = await supabase
      .from('orders')
      .select('dropoff_location_note')
      .eq('id', req.params.id)
      .maybeSingle();
    const dropoffLocationNote = (noteRow as { dropoff_location_note?: string | null } | null)?.dropoff_location_note ?? null;

    // Look up pickup/dropoff addresses from orders_raw using the booking_token link
    let pickupLocationAddress: string | null = null;
    let dropoffLocationAddress: string | null = null;
    const bookingToken = base.bookingToken as string | null ?? null;
    if (bookingToken) {
      const { data: rawRow } = await supabase
        .from('orders_raw')
        .select('pickup_location_address, dropoff_location_address')
        .eq('order_reference', bookingToken)
        .maybeSingle();
      const typed = rawRow as { pickup_location_address?: string | null; dropoff_location_address?: string | null } | null;
      pickupLocationAddress = typed?.pickup_location_address ?? null;
      dropoffLocationAddress = typed?.dropoff_location_address ?? null;
    }

    res.json({ success: true, data: { ...base, customerEmail, dropoffLocationNote, pickupLocationAddress, dropoffLocationAddress } });
  } catch (err) { next(err); }
});

router.patch('/:id/deposit-method', requirePermission(Permission.EditOrders), validateBody(z.object({
  paymentMethodId: z.string().min(1),
  accountId: z.string().min(1),
})), async (req, res, next) => {
  try {
    const { paymentMethodId, accountId } = req.body as { paymentMethodId: string; accountId: string };
    const [{ data: order, error: orderError }, { data: method, error: methodError }, { data: account, error: accountError }] = await Promise.all([
      supabase.from('orders').select('store_id, status, security_deposit').eq('id', req.params.id).maybeSingle(),
      supabase.from('payment_methods').select('id, name, is_active, is_deposit_eligible').eq('id', paymentMethodId).maybeSingle(),
      supabase.from('chart_of_accounts').select('id, name, store_id, account_type, is_active').eq('id', accountId).maybeSingle(),
    ]);
    if (orderError) throw new Error(orderError.message);
    if (methodError) throw new Error(methodError.message);
    if (accountError) throw new Error(accountError.message);
    if (!order) {
      throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    }
    if (order.status !== 'active' || Number(order.security_deposit ?? 0) <= 0) {
      throw Object.assign(new Error('Only active orders with a held deposit can be changed'), { statusCode: 409 });
    }

    const methodIdKey = String(method?.id ?? '').toLowerCase().replace(/[\s_-]/g, '');
    const methodNameKey = String(method?.name ?? '').toLowerCase().replace(/[\s_-]/g, '');
    const isCashOrGcash = [methodIdKey, methodNameKey].some((key) => key === 'cash' || key === 'gcash');
    if (!method || !method.is_active || !method.is_deposit_eligible || !isCashOrGcash) {
      throw Object.assign(new Error('Select Cash or GCash for the deposit'), { statusCode: 400 });
    }
    if (
      !account ||
      !account.is_active ||
      String(account.account_type).toLowerCase() !== 'asset' ||
      ![order.store_id, 'company'].includes(String(account.store_id))
    ) {
      throw Object.assign(new Error('Select an active cash or GCash account for this store'), { statusCode: 400 });
    }

    const accountKey = String(account.name).toLowerCase().replace(/[\s_-]/g, '');
    const selectedGcash = methodIdKey === 'gcash' || methodNameKey === 'gcash';
    const accountMatchesMethod = selectedGcash
      ? accountKey.includes('gcash')
      : accountKey.includes('cash') && !accountKey.includes('gcash');
    if (!accountMatchesMethod) {
      throw Object.assign(new Error(`Select a ${selectedGcash ? 'GCash' : 'cash'} account for this deposit`), { statusCode: 400 });
    }

    const { data, error } = await supabase.rpc('correct_order_deposit_method', {
      p_order_id: req.params.id,
      p_payment_method_id: paymentMethodId,
      p_account_id: accountId,
    });
    if (error) throw new Error(`Failed to update deposit method: ${error.message}`);
    res.json({ success: true, data: { paymentMethodId, updatedPayments: Number(data ?? 0) } });
  } catch (err) { next(err); }
});

router.patch('/:id/dropoff-note', requirePermission(Permission.EditOrders), validateBody(z.object({ note: z.string().max(500).nullable() })), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ dropoff_location_note: (req.body as { note: string | null }).note })
      .eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/:id/items', requirePermission(Permission.ViewInbox), async (req, res, next) => {
  try {
    const items = await req.app.locals.deps.orderItemRepo.findByOrderId(req.params.id);
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

router.get('/:id/payments', requirePermission(Permission.ViewInbox), async (req, res, next) => {
  try {
    const payments = await req.app.locals.deps.paymentRepo.findByOrderId(req.params.id);
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
});

router.get('/:id/history', requirePermission(Permission.ViewInbox), async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const sb = supabase;

    const [orderRes, paymentsRes, swapsRes, addonsRes, accidentsRes] = await Promise.all([
      sb.from('orders').select('id, status, order_date, created_at, employee_id, cancelled_at, cancelled_reason').eq('id', orderId).maybeSingle(),
      sb.from('payments').select('id, payment_type, amount, payment_method_id, transaction_date, settlement_status, settlement_ref, created_at').eq('order_id', orderId).order('created_at', { ascending: true }),
      sb.from('vehicle_swaps').select('id, old_vehicle_name, new_vehicle_name, reason, swap_date, swap_time, employee_id, created_at').eq('order_id', orderId).order('created_at', { ascending: true }),
      sb.from('order_addons').select('id, addon_name, addon_price, addon_type, total_amount, added_at').eq('order_id', orderId).order('added_at', { ascending: true }),
      sb.from('accident_reports').select('id, accident_at, description, customer_injured, police_report_filed, created_at').eq('order_id', orderId).order('accident_at', { ascending: true }),
    ]);

    interface TimelineEvent { timestamp: string; type: string; description: string; detail?: string; amount?: number }
    const events: TimelineEvent[] = [];

    if (orderRes.data) {
      const o = orderRes.data as Record<string, unknown>;
      events.push({
        timestamp: (o.created_at ?? o.order_date) as string,
        type: 'created',
        description: 'Order created',
      });
      if (String(o.status) !== 'unprocessed') {
        events.push({
          timestamp: (o.created_at) as string,
          type: 'activated',
          description: 'Order activated',
        });
      }
    }

    for (const p of (paymentsRes.data ?? []) as Array<Record<string, unknown>>) {
      const pType = p.payment_type as string;
      const isExtension = pType === 'extension';
      events.push({
        timestamp: (p.created_at ?? p.transaction_date) as string,
        type: isExtension ? 'extension' : 'payment',
        description: isExtension
          ? `Rental extended (+${p.settlement_ref ?? ''})`
          : `Payment received (${pType})`,
        amount: p.amount as number,
        detail: isExtension
          ? `${
              p.settlement_status === 'pending'
                ? 'Unpaid'
                : p.settlement_status === 'absorbed'
                  ? 'Paid via settlement'
                  : 'Paid'
            } — ${p.settlement_ref ?? ''}`
          : (p.settlement_ref ? `Ref: ${p.settlement_ref}` : undefined),
      });
    }

    for (const s of (swapsRes.data ?? []) as Array<Record<string, unknown>>) {
      events.push({
        timestamp: (s.created_at ?? s.swap_date) as string,
        type: 'swap',
        description: `Vehicle swap: ${s.old_vehicle_name} → ${s.new_vehicle_name}`,
        detail: s.reason as string | undefined,
      });
    }

    for (const a of (addonsRes.data ?? []) as Array<Record<string, unknown>>) {
      events.push({
        timestamp: (a.added_at ?? '') as string,
        type: 'addon',
        description: `Add-on: ${a.addon_name}`,
        amount: a.total_amount as number,
      });
    }

    for (const acc of (accidentsRes.data ?? []) as Array<Record<string, unknown>>) {
      const injured = acc.customer_injured as boolean;
      const police = acc.police_report_filed as boolean;
      const flags = [injured ? 'customer injured' : null, police ? 'police report filed' : null].filter(Boolean).join(', ');
      events.push({
        timestamp: (acc.accident_at ?? acc.created_at) as string,
        type: 'accident',
        description: '🚨 Accident reported',
        detail: flags || (acc.description as string | undefined),
      });
    }

    if (orderRes.data && String((orderRes.data as Record<string, unknown>).status) === 'completed') {
      events.push({
        timestamp: new Date().toISOString(),
        type: 'settled',
        description: 'Order settled',
      });
    }

    if (orderRes.data && String((orderRes.data as Record<string, unknown>).status) === 'cancelled') {
      const cancelledOrder = orderRes.data as Record<string, unknown>;
      events.push({
        timestamp: (cancelledOrder.cancelled_at ?? new Date().toISOString()) as string,
        type: 'cancelled',
        description: 'Booking cancelled',
        detail: (cancelledOrder.cancelled_reason as string | null) ?? undefined,
      });
    }

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({ success: true, data: events });
  } catch (err) { next(err); }
});

router.get('/:id/addons', requirePermission(Permission.ViewInbox), async (req, res, next) => {
  try {
    const addons = await req.app.locals.deps.orderAddonRepo.findByOrderId(req.params.id);
    res.json({ success: true, data: addons });
  } catch (err) { next(err); }
});

router.get('/:id/swaps', requirePermission(Permission.ViewInbox), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('vehicle_swaps')
      .select('*')
      .eq('order_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch swaps: ${error.message}`);
    const swaps = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      orderId: r.order_id,
      orderItemId: r.order_item_id,
      storeId: r.store_id,
      oldVehicleId: r.old_vehicle_id,
      oldVehicleName: r.old_vehicle_name,
      newVehicleId: r.new_vehicle_id,
      newVehicleName: r.new_vehicle_name,
      swapDate: r.swap_date,
      swapTime: r.swap_time,
      reason: r.reason,
      employeeId: r.employee_id,
      createdAt: r.created_at,
    }));
    res.json({ success: true, data: swaps });
  } catch (err) { next(err); }
});

router.get('/:id/helmet-swaps', requirePermission(Permission.ViewInbox), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('helmet_swaps')
      .select('*')
      .eq('order_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch helmet swaps: ${error.message}`);
    const swaps = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      orderId: r.order_id,
      orderItemId: r.order_item_id,
      storeId: r.store_id,
      oldHelmetNumbers: r.old_helmet_numbers,
      newHelmetNumbers: r.new_helmet_numbers,
      reason: r.reason,
      employeeId: r.employee_id,
      createdAt: r.created_at,
    }));
    res.json({ success: true, data: swaps });
  } catch (err) { next(err); }
});

router.post('/:id/items/:itemId/swap-helmet', requirePermission(Permission.EditOrders), validateBody(z.object({
  newHelmetNumbers: z.string().min(1),
  reason: z.string().optional(),
})), async (req, res, next) => {
  try {
    const { orderItemRepo } = req.app.locals.deps;
    const { newHelmetNumbers, reason } = req.body as { newHelmetNumbers: string; reason?: string };
    const orderId = req.params.id;
    const orderItemId = req.params.itemId;

    const items = await orderItemRepo.findByOrderId(orderId);
    const item = items.find((i: { id: string }) => i.id === orderItemId);
    if (!item) throw new Error(`Order item ${orderItemId} not found`);

    const oldHelmetNumbers = item.helmetNumbers ?? '';

    await orderItemRepo.save({ ...item, helmetNumbers: newHelmetNumbers });

    const { error } = await supabase.from('helmet_swaps').insert({
      id: crypto.randomUUID(),
      order_id: orderId,
      order_item_id: orderItemId,
      store_id: item.storeId,
      old_helmet_numbers: oldHelmetNumbers,
      new_helmet_numbers: newHelmetNumbers,
      reason: reason ?? null,
      employee_id: req.user!.employeeId,
    });
    if (error) throw new Error(`Failed to record helmet swap: ${error.message}`);

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/activate', requirePermission(Permission.EditOrders), validateBody(z.object({
  vehicleAssignments: z.array(z.object({
    id: z.string(), vehicleId: z.string(), vehicleName: z.string(),
    pickupDatetime: z.string(), dropoffDatetime: z.string(), rentalDaysCount: z.number(),
    pickupLocation: z.string(), dropoffLocation: z.string(),
    pickupFee: z.number(), dropoffFee: z.number(), rentalRate: z.number(),
    helmetNumbers: z.string().nullable(), discount: z.number(), opsNotes: z.string().nullable(),
  })).min(1),
  addons: z.array(z.object({
    id: z.string().optional(),
    orderId: z.string().optional(),
    addonName: z.string().min(1),
    addonPrice: z.number().min(0),
    addonType: z.enum(['per_day', 'one_time']),
    quantity: z.number().min(1),
    totalAmount: z.number().min(0),
    mutualExclusivityGroup: z.string().nullable().optional(),
  })).optional(),
  receivableAccountId: z.string(), incomeAccountId: z.string(),
})), async (req, res, next) => {
  try {
    const { activateOrder } = await import('../use-cases/orders/activate-order.js');
    const { data: rawOrderRow } = await supabase
      .from('orders_raw')
      .select('customer_name')
      .eq('id', req.params.id)
      .maybeSingle();
    const customerName = (rawOrderRow as { customer_name?: string | null } | null)?.customer_name ?? undefined;
    const result = await activateOrder(req.app.locals.deps, {
      orderId: req.params.id, employeeId: req.user!.employeeId, customerName, ...req.body,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/settle', requirePermission(Permission.EditOrders), validateBody(z.object({
  settlementDate: z.string(),
  depositLiabilityAccountId: z.string(),
  receivableAccountId: z.string(),
  refundAccountId: z.string(),
  finalPaymentMethodId: z.string().nullable().optional(),
  finalPaymentAccountId: z.string().nullable().optional(),
  finalPaymentAmount: z.number().optional(),
  isCardPayment: z.boolean().optional(),
  cardFeeSurchargeDelta: z.number().nonnegative().optional(),
  returnChargesDelta: z.number().nonnegative().optional(),
  returnChargesNote: z.string().max(200).nullable().optional(),
  returnChargesPaymentMethodId: z.string().min(1).nullable().optional(),
  returnChargesAccountId: z.string().min(1).nullable().optional(),
  settlementRef: z.string().nullable().optional(),
  depositRefundMethodId: z.string().nullable().optional(),
})), async (req, res, next) => {
  try {
    const { settleOrder } = await import('../use-cases/orders/settle-order.js');
    const result = await settleOrder(req.app.locals.deps, { orderId: req.params.id, ...req.body });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/payment', requirePermission(Permission.EditOrders), validateBody(z.object({
  amount: z.number().positive(), paymentMethodId: z.string(), accountId: z.string().nullable().optional(),
  paymentType: z.string(), transactionDate: z.string(), receivableAccountId: z.string(),
  isCardPayment: z.boolean().optional(), settlementRef: z.string().nullable().optional(),
})), async (req, res, next) => {
  try {
    const { collectPayment } = await import('../use-cases/orders/collect-payment.js');
    const result = await collectPayment(req.app.locals.deps, { orderId: req.params.id, ...req.body });
    res.json({ success: true, data: result });

    void (async () => {
      try {
        const { data: orderRow } = await supabase
          .from('orders')
          .select('final_total, booking_token, customers!customer_id(name)')
          .eq('id', req.params.id)
          .single();
        const { data: itemRows } = await supabase
          .from('order_items')
          .select('vehicle_name')
          .eq('order_id', req.params.id)
          .limit(1);

        const customerName = (orderRow?.customers as { name?: string } | null)?.name ?? 'Unknown';
        const vehicleName = itemRows?.[0]?.vehicle_name ?? 'Unknown';
        const finalTotal = orderRow?.final_total ?? 0;
        const amountPaid: number = req.body.amount;
        const balanceDue = result.balanceDue.toNumber();

        const paidOrdersMsg =
          `💳 <b>Payment Received</b>\n` +
          `<b>${escapeHtml(customerName)}</b>\n` +
          `${escapeHtml(vehicleName)}\n` +
          `💰 <b>Total: ₱${Number(finalTotal).toLocaleString('en-PH')}</b>`;

        const opsMsg =
          `💳 <b>Payment Recorded (Back Office)</b>\n` +
          `Customer: ${escapeHtml(customerName)}\n` +
          `Vehicle: ${escapeHtml(vehicleName)}\n` +
          `Amount Paid: ₱${amountPaid.toLocaleString('en-PH')}\n` +
          `Balance Due: ₱${balanceDue.toLocaleString('en-PH')}\n` +
          `Order Total: ₱${Number(finalTotal).toLocaleString('en-PH')}`;

        void sendTelegramAlert(opsMsg, getTelegramChatId('ops'));
        sendTelegramAlertPaidOrdersStaggered(paidOrdersMsg, getTelegramChatId('paid_orders'));
      } catch {
        // fire-and-forget — never block the response
      }
    })();
  } catch (err) { next(err); }
});

router.post('/:id/modify-addons', requirePermission(Permission.EditOrders), validateBody(z.object({
  addons: z.array(z.object({
    addonName: z.string(), addonPrice: z.number(), addonType: z.enum(['per_day', 'one_time']),
    quantity: z.number().int().positive(), totalAmount: z.number(),
  })).default([]),
  removedAddonIds: z.array(z.string()).default([]),
  paymentMethodId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  receivableAccountId: z.string().optional(),
  isCardPayment: z.boolean().optional(),
  settlementRef: z.string().nullable().optional(),
})), async (req, res, next) => {
  try {
    const { modifyAddons } = await import('../use-cases/orders/modify-addons.js');
    const result = await modifyAddons(req.app.locals.deps, { orderId: req.params.id, ...req.body });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/adjust-dates', requirePermission(Permission.EditOrders), validateBody(z.object({
  orderItemId: z.string(),
  pickupDatetime: z.string(),
  dropoffDatetime: z.string(),
})), async (req, res, next) => {
  try {
    const { adjustDates } = await import('../use-cases/orders/adjust-dates.js');
    const result = await adjustDates(req.app.locals.deps, { orderId: req.params.id, ...req.body });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/swap-vehicle', requirePermission(Permission.EditOrders), validateBody(z.object({
  orderItemId: z.string(), newVehicleId: z.string(), reason: z.string(),
})), async (req, res, next) => {
  try {
    const { swapVehicle } = await import('../use-cases/orders/swap-vehicle.js');
    const result = await swapVehicle(req.app.locals.deps, {
      orderId: req.params.id, employeeId: req.user!.employeeId, ...req.body,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/refund', requirePermission(Permission.EditOrders), validateBody(z.object({
  amount: z.number().positive(),
  refundMethodId: z.string(),
  refundAccountId: z.string(),
  receivableAccountId: z.string(),
  reason: z.string().max(500).nullable().optional(),
  cancelOrder: z.boolean().optional(),
  transactionDate: z.string(),
})), async (req, res, next) => {
  try {
    const { refundOrder } = await import('../use-cases/orders/refund-order.js');
    const result = await refundOrder(req.app.locals.deps, { orderId: req.params.id, ...req.body });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.patch('/:id/cancel', requirePermission(Permission.CancelOrders), validateBody(z.object({
  reason: z.string().trim().min(1, 'Cancellation reason is required').max(500),
})), async (req, res, next) => {
  try {
    const reason = (req.body as { reason: string }).reason;
    const { data, error } = await supabase.rpc('cancel_activated_order_atomic', {
      p_order_id: req.params.id,
      p_cancelled_at: new Date().toISOString(),
      p_cancelled_reason: reason,
      p_cancelled_by: req.user!.employeeId,
    });
    if (error) {
      const missingCancellationRpc =
        error.code === 'PGRST202' || error.message.includes('cancel_activated_order_atomic');
      if (missingCancellationRpc) {
        res.status(503).json({
          success: false,
          error: {
            code: 'DATABASE_MIGRATION_REQUIRED',
            message: 'Activated-booking cancellation is not installed in this environment. Apply migration 20260815000000_cancel_activated_orders.sql, then try again.',
          },
        });
        return;
      }
      throw new Error(`Cancel activated order RPC failed: ${error.message}`);
    }

    const result = data as { success: boolean; error?: string; order_reference?: string; customer_name?: string };
    if (!result.success) {
      if (result.error === 'Order not found') {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
        return;
      }
      if (result.error === 'Already cancelled') {
        res.status(409).json({ success: false, error: { code: 'ALREADY_CANCELLED', message: 'Booking is already cancelled' } });
        return;
      }
      if (result.error === 'Order is not active') {
        res.status(409).json({ success: false, error: { code: 'INVALID_ORDER_STATUS', message: 'Only active or confirmed bookings can be cancelled' } });
        return;
      }
      throw new Error(result.error ?? 'Cancellation failed');
    }

    res.json({ success: true });

    void sendTelegramAlert(
      `❌ <b>Activated Booking Cancelled</b>\n` +
        `Reference: ${escapeHtml(result.order_reference ?? String(req.params.id))}\n` +
        `Customer: ${escapeHtml(result.customer_name ?? '—')}\n` +
        `Reason: ${escapeHtml(reason)}`,
      getTelegramChatId('ops'),
    );
  } catch (err) { next(err); }
});

export { router as orderRoutes };
