import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { z } from 'zod';
import { supabase } from '../adapters/supabase/client.js';

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
      .select('id, store_id, order_date, customer_id, status, final_total, balance_due, web_notes, payment_method_id, security_deposit, card_fee_surcharge, woo_order_id, booking_token, customers!customer_id(name, mobile, email)')
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

    let itemsByOrder = new Map<string, Array<{ vehicle_name: string; dropoff_datetime: string }>>();
    if (orderIds.length > 0) {
      const { data: items, error: itemsErr } = await sb
        .from('order_items')
        .select('order_id, vehicle_name, dropoff_datetime')
        .in('order_id', orderIds);
      if (itemsErr) throw new Error(`enriched items query failed: ${itemsErr.message}`);
      for (const item of (items ?? [])) {
        const list = itemsByOrder.get(item.order_id) ?? [];
        list.push(item);
        itemsByOrder.set(item.order_id, list);
      }
    }

    let paymentsByOrder = new Map<string, number>();
    if (orderIds.length > 0) {
      const { data: payments, error: payErr } = await sb
        .from('payments')
        .select('order_id, amount')
        .in('order_id', orderIds);
      if (!payErr && payments) {
        for (const p of payments) {
          paymentsByOrder.set(p.order_id, (paymentsByOrder.get(p.order_id) ?? 0) + Number(p.amount ?? 0));
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

    const enriched = (orders ?? []).map((o: Record<string, unknown>) => {
      const customer = o.customers as { name: string; mobile: string | null; email: string | null } | null;
      const items = itemsByOrder.get(o.id as string) ?? [];
      const vehicleNames = items.map((i) => i.vehicle_name).filter(Boolean).join(', ');
      const returnDatetime = items.reduce<string | null>((latest, i) => {
        if (!i.dropoff_datetime) return latest;
        return !latest || i.dropoff_datetime > latest ? i.dropoff_datetime : latest;
      }, null);
      const totalPaid = paymentsByOrder.get(o.id as string) ?? 0;

      const finalTotalNum = Number(o.final_total ?? 0);
      const totalPaidNum = totalPaid;
      const balanceDueComputed = Math.max(0, finalTotalNum - totalPaidNum);

      const token = (o.booking_token as string) ?? null;
      const waiverData = token ? waiverByReference.get(token) : undefined;

      const insp = inspectionByOrderId.get(o.id as string);
      const inspectionStatus = insp?.status === 'completed' ? 'completed' : 'pending';

      return {
        id: o.id,
        storeId: o.store_id,
        orderDate: o.order_date,
        customerName: customer?.name ?? '—',
        customerMobile: customer?.mobile ?? null,
        customerEmail: customer?.email?.trim() || null,
        vehicleNames: vehicleNames || '—',
        returnDatetime,
        wooOrderId: (o.woo_order_id as string) ?? null,
        bookingToken: token,
        finalTotal: finalTotalNum,
        balanceDue: balanceDueComputed,
        totalPaid: totalPaidNum,
        securityDeposit: Number(o.security_deposit ?? 0),
        cardFeeSurcharge: Number(o.card_fee_surcharge ?? 0),
        status: o.status as string,
        webNotes: o.web_notes as string | null,
        paymentMethodId: o.payment_method_id as string | null,
        waiverStatus: (waiverData?.status as 'pending' | 'signed' | 'expired' | undefined) ?? 'pending',
        waiverSignedAt: waiverData?.agreed_at ?? null,
        inspectionStatus,
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
    res.json({ success: true, data: { ...base, customerEmail } });
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

    const [orderRes, paymentsRes, swapsRes, addonsRes] = await Promise.all([
      sb.from('orders').select('id, status, order_date, created_at, employee_id').eq('id', orderId).maybeSingle(),
      sb.from('payments').select('id, payment_type, amount, payment_method_id, transaction_date, settlement_ref, created_at').eq('order_id', orderId).order('created_at', { ascending: true }),
      sb.from('vehicle_swaps').select('id, old_vehicle_name, new_vehicle_name, reason, swap_date, swap_time, employee_id, created_at').eq('order_id', orderId).order('created_at', { ascending: true }),
      sb.from('order_addons').select('id, addon_name, addon_price, addon_type, total_amount, added_at').eq('order_id', orderId).order('added_at', { ascending: true }),
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
          ? `${p.settlement_status === 'pending' ? 'Unpaid' : 'Paid'} — ${p.settlement_ref ?? ''}`
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
    const result = await activateOrder(req.app.locals.deps, {
      orderId: req.params.id, employeeId: req.user!.employeeId, ...req.body,
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
  settlementRef: z.string().nullable().optional(),
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

export { router as orderRoutes };
