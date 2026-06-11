import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { z } from 'zod';
import { supabase } from '../adapters/supabase/client.js';
import { sendTelegramAlert, sendTelegramAlertPaidOrdersStaggered, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';

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

    let query = sb
      .from('orders')
      .select('id, store_id, order_date, customer_id, status, final_total, balance_due, web_notes, payment_method_id, security_deposit, card_fee_surcharge, woo_order_id, booking_token, partner_ref, customers!customer_id(name, mobile, email)')
      .eq('store_id', storeId)
      .order('order_date', { ascending: false });

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) query = query.eq('status', statuses[0]);
      else if (statuses.length > 1) query = query.in('status', statuses);
    }

    const { data: orders, error } = await query;
    if (error) throw new Error(`enriched orders query failed: ${error.message}`);

    const orderIds = (orders ?? []).map((o: Record<string, unknown>) => o.id as string);

    let itemsByOrder = new Map<string, Array<{ id: string; vehicle_id: string; vehicle_name: string; pickup_datetime: string | null; dropoff_datetime: string; discount: number }>>();
    if (orderIds.length > 0) {
      const { data: items, error: itemsErr } = await sb
        .from('order_items')
        .select('id, order_id, vehicle_id, vehicle_name, pickup_datetime, dropoff_datetime, discount')
        .in('order_id', orderIds);
      if (itemsErr) throw new Error(`enriched items query failed: ${itemsErr.message}`);
      for (const item of (items ?? [])) {
        const list = itemsByOrder.get(item.order_id) ?? [];
        list.push(item);
        itemsByOrder.set(item.order_id, list);
      }
    }

    let paymentsByOrder = new Map<string, number>();
    let pendingExtensionsByOrder = new Map<string, number>();
    let extendedOrderIds = new Set<string>();
    if (orderIds.length > 0) {
      const { data: payments, error: payErr } = await sb
        .from('payments')
        .select('order_id, amount, payment_type, settlement_status, payment_method_id')
        .in('order_id', orderIds);
      if (!payErr && payments) {
        for (const p of payments as Array<{ order_id: string; amount: number | string | null; payment_type: string | null; settlement_status: string | null; payment_method_id: string | null }>) {
          if (p.payment_type === 'extension') {
            extendedOrderIds.add(p.order_id);
          }
          // Track pending extension IOUs separately — these are amounts the
          // customer still owes that aren't in orders.balance_due until the
          // extension RPC bumps it (see migration 091).
          const isUnpaidExtension =
            p.payment_type === 'extension' && p.settlement_status === 'pending';
          if (isUnpaidExtension) {
            pendingExtensionsByOrder.set(
              p.order_id,
              (pendingExtensionsByOrder.get(p.order_id) ?? 0) + Number(p.amount ?? 0),
            );
            continue;
          }
          // Absorbed extensions were rolled into a final settlement payment —
          // the cash is captured by the settlement payment row, so skip here
          // (see migration 092).
          if (p.payment_type === 'extension' && p.settlement_status === 'absorbed') {
            continue;
          }
          // Deposits are held against orders.security_deposit, not against
          // final_total — counting them here would mask unpaid rental charges.
          // Pending extension IOUs are excluded because no cash was received yet.
          if (p.payment_type === 'deposit') continue;
          // Addon with payment_method_id='pending' is an unpaid IOU (collect later) — no cash received yet.
          if (p.payment_type === 'addon' && p.payment_method_id === 'pending' && p.settlement_status === 'pending') continue;
          // Refunds represent money returned to the customer — subtract from net received.
          if (p.payment_type === 'refund') {
            paymentsByOrder.set(
              p.order_id,
              (paymentsByOrder.get(p.order_id) ?? 0) - Number(p.amount ?? 0),
            );
            continue;
          }
          paymentsByOrder.set(
            p.order_id,
            (paymentsByOrder.get(p.order_id) ?? 0) + Number(p.amount ?? 0),
          );
        }
      }
    }

    const bookingTokens = [
      ...new Set(
        (orders ?? [])
          .map((o: Record<string, unknown>) => (o.booking_token as string | null) ?? null)
          .filter((t): t is string => typeof t === 'string' && t.length > 0),
      ),
    ];

    type WaiverRow = { order_reference: string; status: string; agreed_at: string | null; created_at: string };
    const waiverByReference = new Map<string, { status: string; agreed_at: string | null }>();
    if (bookingTokens.length > 0) {
      const { data: waiverRows, error: waiverErr } = await sb
        .from('waivers')
        .select('order_reference, status, agreed_at, created_at')
        .in('order_reference', bookingTokens);
      if (waiverErr) throw new Error(`enriched waivers query failed: ${waiverErr.message}`);
      const bestByRef = new Map<string, WaiverRow>();
      for (const row of (waiverRows ?? []) as WaiverRow[]) {
        const cur = bestByRef.get(row.order_reference);
        if (!cur || (row.created_at ?? '') > (cur.created_at ?? '')) {
          bestByRef.set(row.order_reference, row);
        }
      }
      for (const [ref, row] of bestByRef) {
        waiverByReference.set(ref, { status: row.status, agreed_at: row.agreed_at });
      }
    }

    const inspectionByOrderId = new Map<string, { status: string }>();
    if (orderIds.length > 0) {
      const { data: inspectionRows, error: inspErr } = await sb
        .from('inspections')
        .select('order_id, status, created_at')
        .in('order_id', orderIds);
      if (inspErr) throw new Error(`enriched inspections query failed: ${inspErr.message}`);
      type InspRow = { order_id: string; status: string; created_at: string };
      const bestInsp = new Map<string, InspRow>();
      for (const row of (inspectionRows ?? []) as InspRow[]) {
        const cur = bestInsp.get(row.order_id);
        if (!cur || (row.created_at ?? '') > (cur.created_at ?? '')) {
          bestInsp.set(row.order_id, row);
        }
      }
      for (const [oid, row] of bestInsp) {
        inspectionByOrderId.set(oid, { status: row.status });
      }
    }

    const ninePmOrderIds = new Set<string>();
    if (orderIds.length > 0) {
      const { data: ninePmAddons } = await sb
        .from('order_addons')
        .select('order_id, addon_name')
        .in('order_id', orderIds);
      for (const a of (ninePmAddons ?? []) as Array<{ order_id: string; addon_name: string }>) {
        const n = (a.addon_name ?? '').toLowerCase();
        if (n.includes('9pm') || n.includes('21:00') || n.includes('ninepm')) {
          ninePmOrderIds.add(a.order_id);
        }
      }
    }

    const enriched = (orders ?? []).map((o: Record<string, unknown>) => {
      const customer = o.customers as { name: string; mobile: string | null; email: string | null } | null;
      const items = itemsByOrder.get(o.id as string) ?? [];
      const vehicleNames = items.map((i) => i.vehicle_name).filter(Boolean).join(', ');
      const primaryItem = items[0] ?? null;
      const returnDatetime = items.reduce<string | null>((latest, i) => {
        if (!i.dropoff_datetime) return latest;
        return !latest || i.dropoff_datetime > latest ? i.dropoff_datetime : latest;
      }, null);
      const totalPaid = paymentsByOrder.get(o.id as string) ?? 0;
      const pendingExtensionsTotal = pendingExtensionsByOrder.get(o.id as string) ?? 0;

      const totalDiscount = items.reduce((sum, i) => sum + Number(i.discount ?? 0), 0);

      const finalTotalNum = Number(o.final_total ?? 0);
      const totalPaidNum = totalPaid;
      // Balance = rental/addon charges not yet paid. Use max of:
      //   (a) final_total - totalPaid (works when migration 091 applied and
      //       extension RPC bumped final_total)
      //   (b) pendingExtensionsTotal (fallback when final_total is stale —
      //       the IOU rows authoritatively show outstanding extension debt)
      const balanceFromFinalTotal = Math.max(0, finalTotalNum - totalPaidNum);
      const balanceDueComputed = Math.max(balanceFromFinalTotal, pendingExtensionsTotal);

      const token = (o.booking_token as string) ?? null;
      const waiverData = token ? waiverByReference.get(token) : undefined;

      const insp = inspectionByOrderId.get(o.id as string);
      const inspectionStatus = insp?.status === 'completed' ? 'completed' : 'pending';
      const hasExtension = extendedOrderIds.has(o.id as string);
      const hasNinePmAddon = ninePmOrderIds.has(o.id as string);

      const pickupDatetime = primaryItem?.pickup_datetime ?? null;

      return {
        id: o.id,
        storeId: o.store_id,
        orderDate: o.order_date,
        customerName: customer?.name ?? '—',
        customerMobile: customer?.mobile ?? null,
        customerEmail: customer?.email?.trim() || null,
        vehicleNames: vehicleNames || '—',
        returnDatetime,
        pickupDatetime,
        wooOrderId: (o.woo_order_id as string) ?? null,
        bookingToken: token,
        finalTotal: finalTotalNum,
        balanceDue: balanceDueComputed,
        totalPaid: totalPaidNum,
        pendingExtensionsTotal,
        securityDeposit: Number(o.security_deposit ?? 0),
        cardFeeSurcharge: Number(o.card_fee_surcharge ?? 0),
        status: o.status as string,
        webNotes: o.web_notes as string | null,
        paymentMethodId: o.payment_method_id as string | null,
        waiverStatus: (waiverData?.status as 'pending' | 'signed' | 'expired' | undefined) ?? 'pending',
        waiverSignedAt: waiverData?.agreed_at ?? null,
        inspectionStatus,
        hasExtension,
        hasNinePmAddon,
        partnerRef: (o.partner_ref as string) ?? null,
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
      sb.from('orders').select('id, status, order_date, created_at, employee_id').eq('id', orderId).maybeSingle(),
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

export { router as orderRoutes };
