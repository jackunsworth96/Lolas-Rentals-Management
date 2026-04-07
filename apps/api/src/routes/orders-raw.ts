import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { Permission, resolveStoreFromSource, resolveSourceFromStore } from '@lolas/shared';
import { supabase } from '../adapters/supabase/client.js';
import { processRawOrder, type ProcessRawOrderDeps } from '../use-cases/orders/process-raw-order.js';

function generateWalkInReference(source: string): string {
  const prefix = source === 'bass' ? 'BB' : 'LR';
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `${prefix}-${m}${d}-${hex}`;
}

async function uniqueWalkInReference(source: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const ref = generateWalkInReference(source);
    const { data } = await supabase.from('orders_raw').select('id').eq('order_reference', ref).maybeSingle();
    if (!data) return ref;
  }
  return generateWalkInReference(source);
}

const router = Router();
router.use(authenticate);

const walkInBodySchema = z.object({
  customerName: z.string().min(1),
  customerMobile: z.string().min(1),
  customerEmail: z.string().email().optional(),
  vehicleModelId: z.string().min(1),
  storeId: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
  pickupLocationId: z.number().int().positive().optional(),
  dropoffLocationId: z.number().int().positive().optional(),
  staffNotes: z.string().optional(),
});

router.post('/walk-in', requirePermission(Permission.EditOrders), async (req, res, next) => {
  try {
    const parsed = walkInBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
      });
      return;
    }

    const body = parsed.data;
    const source = resolveSourceFromStore(body.storeId);
    const orderReference = await uniqueWalkInReference(source);

    const { data, error } = await supabase
      .from('orders_raw')
      .insert({
        source,
        booking_channel: 'walk_in',
        status: 'unprocessed',
        customer_name: body.customerName,
        customer_email: body.customerEmail ?? null,
        customer_mobile: body.customerMobile,
        vehicle_model_id: body.vehicleModelId,
        store_id: body.storeId,
        pickup_datetime: body.pickupDatetime,
        dropoff_datetime: body.dropoffDatetime,
        pickup_location_id: body.pickupLocationId ?? null,
        dropoff_location_id: body.dropoffLocationId ?? null,
        order_reference: orderReference,
        payload: body.staffNotes ? { staff_notes: body.staffNotes } : null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/', requirePermission(Permission.ViewInbox), async (req, res, next) => {
  try {
    const {
      store, status, search,
      page: pageStr, limit: limitStr,
    } = req.query as {
      store?: string;
      status?: string;
      search?: string;
      page?: string;
      limit?: string;
    };

    const limit = Math.min(parseInt(limitStr ?? '50', 10), 200);
    const page = Math.max(parseInt(pageStr ?? '1', 10), 1);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('orders_raw')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (store) query = query.eq('source', store);
    if (status) query = query.eq('status', status);
    else query = query.eq('status', 'unprocessed');

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(
        `order_reference.ilike.${term},customer_name.ilike.${term},customer_email.ilike.${term},customer_mobile.ilike.${term},vehicle_model_id.ilike.${term}`,
      );
    }

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    res.json({
      success: true,
      data: {
        data: data ?? [],
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission(Permission.ViewInbox), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('orders_raw')
      .select('*')
      .eq('id', req.params.id as string)
      .single();

    if (error) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Raw order not found' } });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const vehicleAssignmentSchema = z.object({
  id: z.string().optional(),
  vehicleId: z.string().min(1),
  vehicleName: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
  rentalDaysCount: z.number().min(1),
  pickupLocation: z.string().min(1),
  dropoffLocation: z.string().min(1),
  pickupFee: z.number().min(0),
  dropoffFee: z.number().min(0),
  rentalRate: z.number().min(0),
  helmetNumbers: z.string().nullable().optional(),
  discount: z.number().min(0).default(0),
  opsNotes: z.string().nullable().optional(),
});

const addonSchema = z.object({
  id: z.string().optional(),
  orderId: z.string().optional(),
  addonName: z.string().min(1),
  addonPrice: z.number().min(0),
  addonType: z.enum(['per_day', 'one_time']),
  quantity: z.number().min(1),
  totalAmount: z.number().min(0),
  mutualExclusivityGroup: z.string().nullable().optional(),
});

const processBodySchema = z.object({
  storeId: z.string().min(1),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
  }),
  vehicleAssignments: z.array(vehicleAssignmentSchema).min(1),
  addons: z.array(addonSchema).default([]),
  securityDeposit: z.number().min(0).default(0),
  webQuoteRaw: z.number().nullable().default(null),
  webNotes: z.string().nullable().default(null),
  receivableAccountId: z.string().min(1),
  incomeAccountId: z.string().min(1),
  paymentMethodId: z.string().nullable().default(null),
  depositMethodId: z.string().nullable().default(null),
  cardFeeSurcharge: z.number().min(0).default(0),
  paymentAccountId: z.string().nullable().optional(),
  depositLiabilityAccountId: z.string().nullable().optional(),
  isCardPayment: z.boolean().optional(),
  settlementRef: z.string().nullable().optional(),
});

router.post('/:id/process', requirePermission(Permission.EditOrders), async (req, res, next) => {
  try {
    const parsed = processBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
      });
      return;
    }

    const deps: ProcessRawOrderDeps = {
      orderRepo: req.app.locals.deps.orderRepo,
      orderItemRepo: req.app.locals.deps.orderItemRepo,
      orderAddonRepo: req.app.locals.deps.orderAddonRepo,
      fleetRepo: req.app.locals.deps.fleetRepo,
      customerRepo: req.app.locals.deps.customerRepo,
      paymentRepo: req.app.locals.deps.paymentRepo,
      accountingPort: req.app.locals.deps.accountingPort,
      cardSettlementRepo: req.app.locals.deps.cardSettlementRepo,
    };

    const body = parsed.data;
    const result = await processRawOrder(deps, {
      rawOrderId: req.params.id as string,
      storeId: body.storeId,
      employeeId: req.user!.employeeId,
      customer: body.customer,
      vehicleAssignments: body.vehicleAssignments.map((v) => ({
        id: v.id ?? crypto.randomUUID(),
        vehicleId: v.vehicleId,
        vehicleName: v.vehicleName,
        pickupDatetime: v.pickupDatetime,
        dropoffDatetime: v.dropoffDatetime,
        rentalDaysCount: v.rentalDaysCount,
        pickupLocation: v.pickupLocation,
        dropoffLocation: v.dropoffLocation,
        pickupFee: v.pickupFee,
        dropoffFee: v.dropoffFee,
        rentalRate: v.rentalRate,
        helmetNumbers: v.helmetNumbers ?? null,
        discount: v.discount,
        opsNotes: v.opsNotes ?? null,
      })),
      addons: body.addons.map((a) => ({
        id: a.id ?? crypto.randomUUID(),
        orderId: '',
        addonName: a.addonName,
        addonPrice: a.addonPrice,
        addonType: a.addonType,
        quantity: a.quantity,
        totalAmount: a.totalAmount,
        mutualExclusivityGroup: a.mutualExclusivityGroup ?? null,
      })),
      securityDeposit: body.securityDeposit,
      webQuoteRaw: body.webQuoteRaw,
      webNotes: body.webNotes,
      receivableAccountId: body.receivableAccountId,
      incomeAccountId: body.incomeAccountId,
      paymentMethodId: body.paymentMethodId,
      depositMethodId: body.depositMethodId,
      cardFeeSurcharge: body.cardFeeSurcharge,
      paymentAccountId: body.paymentAccountId ?? null,
      depositLiabilityAccountId: body.depositLiabilityAccountId ?? null,
      isCardPayment: body.isCardPayment ?? false,
      settlementRef: body.settlementRef ?? null,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

const collectPaymentSchema = z.object({
  amount: z.number().min(0),
  paymentMethodId: z.string().min(1),
  note: z.string().optional().default(''),
  isCardPayment: z.boolean().optional().default(false),
  settlementRef: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
});

router.post('/:id/collect-payment', requirePermission(Permission.EditOrders), async (req, res, next) => {
  try {
    const parsed = collectPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
      });
      return;
    }

    const { data: rawOrder, error: findErr } = await supabase
      .from('orders_raw')
      .select('id, source, status')
      .eq('id', req.params.id as string)
      .single();

    if (findErr || !rawOrder) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Raw order not found' } });
      return;
    }

    const storeId = resolveStoreFromSource(rawOrder.source);
    const { paymentRepo, cardSettlementRepo } = req.app.locals.deps;
    const txDate = new Date().toISOString().slice(0, 10);
    const paymentId = crypto.randomUUID();

    const payment = {
      id: paymentId,
      storeId,
      orderId: null,
      rawOrderId: req.params.id as string,
      orderItemId: null,
      orderAddonId: null,
      paymentType: 'pre-activation',
      amount: parsed.data.amount,
      paymentMethodId: parsed.data.paymentMethodId,
      transactionDate: txDate,
      settlementStatus: parsed.data.isCardPayment ? 'pending' : null,
      settlementRef: parsed.data.settlementRef ?? null,
      customerId: null,
      accountId: null,
    };

    await paymentRepo.save(payment);

    if (parsed.data.isCardPayment) {
      const settlement = {
        id: crypto.randomUUID(),
        storeId,
        orderId: null,
        customerId: null,
        paymentId,
        name: parsed.data.customerName ?? null,
        amount: parsed.data.amount,
        refNumber: parsed.data.settlementRef ?? null,
        transactionDate: txDate,
        forecastedDate: null,
        isPaid: false,
        dateSettled: null,
        settlementRef: null,
        netAmount: null,
        feeExpense: null,
        accountId: null,
        batchNo: null,
        createdAt: new Date(),
      };
      await cardSettlementRepo.save(settlement);
    }

    res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
});

const cancelBodySchema = z.object({
  reason: z.string().optional(),
});

router.patch('/:id/cancel', requirePermission(Permission.CancelOrders), async (req, res, next) => {
  try {
    const parsed = cancelBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
      });
      return;
    }

    const id = req.params.id as string;

    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc('cancel_order_raw_atomic', {
        p_order_id:         id,
        p_cancelled_at:     new Date().toISOString(),
        p_cancelled_reason: parsed.data.reason ?? null,
      });

    if (rpcErr) throw new Error(`Cancel RPC failed: ${rpcErr.message}`);

    const result = rpcResult as { success: boolean; error?: string };
    if (!result.success) {
      if (result.error === 'Already cancelled') {
        res.status(409).json({
          success: false,
          error: { code: 'ALREADY_CANCELLED', message: 'Order is already cancelled' },
        });
        return;
      }
      if (result.error === 'Order not found') {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Raw order not found' },
        });
        return;
      }
      throw new Error(result.error ?? 'Cancel failed');
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as ordersRawRoutes };
