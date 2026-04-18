import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { Permission, resolveStoreFromSource, resolveSourceFromStore } from '@lolas/shared';
import { supabase } from '../adapters/supabase/client.js';
import { resolveCharityPayableAccount } from '../adapters/supabase/maintenance-expense-rpc.js';
import { processRawOrder, type ProcessRawOrderDeps } from '../use-cases/orders/process-raw-order.js';
import { sendEmail, bookingConfirmationHtml, bookingCancellationHtml, walkInStaffAlertHtml, NOTIFICATION_EMAIL } from '../services/email.js';
import { formatManilaDate } from '../utils/manila-date.js';

/** GET list / GET :id — explicit columns; excludes payload (V10-11). */
const ORDERS_RAW_INBOX_COLUMNS =
  'id, order_reference, status, customer_name, customer_email, customer_mobile, pickup_datetime, dropoff_datetime, store_id, vehicle_model_id, charity_donation, transfer_type, transfer_route, flight_arrival_time, transfer_pax_count, transfer_amount, cancellation_token_used, created_at, updated_at, source, booking_channel, pickup_location_id, dropoff_location_id, addon_ids, web_payment_method, flight_number';

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

/* ────────────────────────────────────────────────────────────
   POST /walk-in-direct
   Creates AND immediately activates a booking in one step,
   bypassing the orders_raw inbox entirely.
   ──────────────────────────────────────────────────────────── */

const walkInDirectSchema = z.object({
  customerName: z.string().min(1),
  customerMobile: z.string().min(1),
  customerEmail: z.string().email().optional(),
  nationality: z.string().optional(),
  storeId: z.string().min(1),
  vehicleId: z.string().min(1),
  vehicleModelId: z.string().min(1),
  vehicleName: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
  pickupLocationId: z.number().int().positive().optional(),
  dropoffLocationId: z.number().int().positive().optional(),
  addonIds: z.array(z.number()).optional(),
  helmetNumbers: z.string().optional(),
  staffNotes: z.string().optional(),
  paymentMethod: z.enum(['cash', 'gcash', 'card', 'bank_transfer']),
  depositCollected: z.boolean(),
  depositAmount: z.number().min(0),
  depositMethod: z.enum(['cash', 'gcash', 'card', 'bank_transfer']),
  grandTotal: z.number().min(0),
  rentalDays: z.number().int().min(1),
  dailyRate: z.number().min(0),
  pickupFee: z.number().min(0).default(0),
  dropoffFee: z.number().min(0).default(0),
  charityDonation: z.number().min(0).optional(),
  paymentAccountId: z.string().min(1).optional().nullable(),
  depositLiabilityAccountId: z.string().min(1).optional().nullable(),
});

router.post('/walk-in-direct', requirePermission(Permission.EditOrders), async (req, res, next) => {
  try {
    const parsed = walkInDirectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
      });
      return;
    }

    const body = parsed.data;
    const employeeId = req.user!.employeeId;

    // 1. Upsert customer
    const { data: existingCust } = await supabase
      .from('customers')
      .select('id')
      .eq('mobile', body.customerMobile)
      .limit(1)
      .maybeSingle();

    let customerId: string;
    if (existingCust) {
      customerId = (existingCust as { id: string }).id;
    } else {
      customerId = crypto.randomUUID();
      const { error: custErr } = await supabase.from('customers').insert({
        id: customerId,
        store_id: body.storeId,
        name: body.customerName,
        mobile: body.customerMobile,
        email: body.customerEmail?.toLowerCase() ?? null,
        notes: body.nationality ? `Nationality: ${body.nationality}` : null,
      });
      if (custErr) throw new Error(`Customer insert failed: ${custErr.message}`);
    }

    // 2. Generate order reference
    const source = resolveSourceFromStore(body.storeId);
    const orderReference = await uniqueWalkInReference(source);

    // 3. Build IDs
    const orderId = crypto.randomUUID();
    const orderItemId = crypto.randomUUID();

    // 4. Compute rental days
    const ms = new Date(body.dropoffDatetime).getTime() - new Date(body.pickupDatetime).getTime();
    const rentalDaysCount = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));

    // 5. Resolve location names
    let pickupLocation = 'Store';
    let dropoffLocation = 'Store';
    if (body.pickupLocationId || body.dropoffLocationId) {
      const { data: locRows } = await supabase
        .from('locations')
        .select('id, name')
        .eq('is_active', true)
        .or(`store_id.eq.${body.storeId},store_id.is.null`);
      const locMap = new Map(
        ((locRows ?? []) as Array<{ id: number; name: string }>).map((l) => [l.id, l.name]),
      );
      if (body.pickupLocationId) pickupLocation = locMap.get(body.pickupLocationId) ?? 'Store';
      if (body.dropoffLocationId) dropoffLocation = locMap.get(body.dropoffLocationId) ?? 'Store';
    }

    // 6. Build order_items
    const orderItems = [{
      id: orderItemId,
      store_id: body.storeId,
      order_id: orderId,
      vehicle_id: body.vehicleId,
      vehicle_name: body.vehicleName,
      pickup_datetime: body.pickupDatetime,
      dropoff_datetime: body.dropoffDatetime,
      rental_days_count: rentalDaysCount,
      pickup_location: pickupLocation,
      dropoff_location: dropoffLocation,
      pickup_fee: body.pickupFee,
      dropoff_fee: body.dropoffFee,
      rental_rate: body.dailyRate,
      helmet_numbers: body.helmetNumbers ?? null,
      discount: 0,
      ops_notes: body.staffNotes ?? null,
      return_condition: null,
    }];

    // 7. Build order_addons
    let orderAddons: Array<Record<string, unknown>> = [];
    if (body.addonIds && body.addonIds.length > 0) {
      const { data: addonRows, error: addonErr } = await supabase
        .from('addons')
        .select('id, name, addon_type, price_per_day, price_one_time')
        .in('id', body.addonIds)
        .eq('is_active', true);
      if (addonErr) throw new Error(`Addon lookup failed: ${addonErr.message}`);

      orderAddons = ((addonRows ?? []) as Array<{
        id: number; name: string; addon_type: string;
        price_per_day: number; price_one_time: number;
      }>).map((addon) => {
        const isPerDay = addon.addon_type === 'per_day';
        const price = isPerDay ? addon.price_per_day : addon.price_one_time;
        const total = isPerDay ? price * rentalDaysCount : price;
        return {
          id: crypto.randomUUID(),
          order_id: orderId,
          addon_name: addon.name,
          addon_price: price,
          addon_type: addon.addon_type,
          quantity: 1,
          total_amount: total,
          store_id: body.storeId,
        };
      });
    }

    // 8. Fleet updates
    const fleetUpdates = [{
      id: body.vehicleId,
      status: 'Active',
      updated_at: new Date().toISOString(),
    }];

    // 9. Accounting accounts
    const { data: acctData, error: acctErr } = await supabase
      .from('chart_of_accounts')
      .select('id, name, account_type')
      .in('store_id', [body.storeId, 'company'])
      .eq('is_active', true);
    if (acctErr) throw new Error(`Account lookup failed: ${acctErr.message}`);

    const accounts = (acctData ?? []) as Array<{ id: string; name: string; account_type: string }>;
    const receivableAccount = accounts.find(
      (a) => a.account_type === 'Asset' && a.name.toLowerCase().includes('receivable'),
    );
    const incomeAccount = accounts.find(
      (a) => a.account_type === 'Income' && a.name.toLowerCase().includes('rental'),
    ) ?? accounts.find(
      (a) => a.account_type === 'Income',
    );
    const receivableAccountId = receivableAccount?.id ?? '';
    const incomeAccountId = incomeAccount?.id ?? '';

    // 10. Journal legs (rental + charity folded into a single balanced posting — AC-05)
    const now = new Date();
    const journalDate = formatManilaDate(now);
    const journalPeriod = journalDate.slice(0, 7);
    const charityAmount = body.charityDonation ?? 0;
    let journalTransactionId = '';
    let journalLegs: Array<Record<string, unknown>> = [];

    if (body.grandTotal > 0 && receivableAccountId && incomeAccountId) {
      journalTransactionId = crypto.randomUUID();
      journalLegs = [
        {
          id: crypto.randomUUID(),
          account_id: receivableAccountId,
          debit: body.grandTotal,
          credit: 0,
          description: 'Walk-in order activation',
          reference_type: 'order',
          reference_id: orderId,
        },
        {
          id: crypto.randomUUID(),
          account_id: incomeAccountId,
          debit: 0,
          credit: body.grandTotal,
          description: 'Walk-in rental income',
          reference_type: 'order',
          reference_id: orderId,
        },
      ];

      // Fold charity legs into the same activate_order_atomic call so
      // assert_balanced_legs can verify the full posting atomically.
      // Let resolveCharityPayableAccount throw on misconfiguration in non-prod.
      if (charityAmount > 0) {
        const charityPayableAccountId = await resolveCharityPayableAccount(body.storeId);
        if (charityPayableAccountId) {
          journalLegs.push(
            {
              id: crypto.randomUUID(),
              account_id: receivableAccountId,
              debit: charityAmount,
              credit: 0,
              description: `Order ${orderId} charity donation receivable (Be Pawsitive)`,
              reference_type: 'order_charity',
              reference_id: orderId,
            },
            {
              id: crypto.randomUUID(),
              account_id: charityPayableAccountId,
              debit: 0,
              credit: charityAmount,
              description: `Order ${orderId} charity donation payable (Be Pawsitive)`,
              reference_type: 'order_charity',
              reference_id: orderId,
            },
          );
        }
      }
    }

    // 11. Order date (Manila timezone)
    const orderDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

    // 12. Payment ids & transaction date for the atomic RPC
    const rentalPaymentId = crypto.randomUUID();
    const depositPaymentId =
      body.depositCollected && body.depositAmount > 0 ? crypto.randomUUID() : null;
    const transactionDate = formatManilaDate();

    // 13. Call activate_order_atomic RPC (order + journal + payments in one tx)
    const { error: rpcErr } = await supabase.rpc('activate_order_atomic', {
      p_order_id: orderId,
      p_store_id: body.storeId,
      p_woo_order_id: null,
      p_customer_id: customerId,
      p_employee_id: employeeId,
      p_order_date: orderDate,
      p_status: 'active',
      p_web_notes: body.staffNotes ?? null,
      p_quantity: 1,
      p_web_quote_raw: body.grandTotal,
      p_security_deposit: body.depositAmount,
      p_deposit_status: body.depositCollected ? 'paid' : 'pending',
      p_card_fee_surcharge: 0,
      p_return_charges: 0,
      p_final_total: body.grandTotal,
      p_balance_due: body.depositCollected ? 0 : body.grandTotal,
      p_payment_method_id: body.paymentMethod,
      p_deposit_method_id: body.depositMethod,
      p_booking_token: orderReference,
      p_tips: 0,
      p_charity_donation: charityAmount,
      p_updated_at: now.toISOString(),
      p_order_items: orderItems,
      p_order_addons: orderAddons,
      p_fleet_updates: fleetUpdates,
      p_journal_transaction_id: journalTransactionId,
      p_journal_period: journalPeriod,
      p_journal_date: journalDate,
      p_journal_store_id: body.storeId,
      p_journal_legs: journalLegs,
      p_rental_payment_id: rentalPaymentId,
      p_rental_amount: body.grandTotal,
      p_transaction_date: transactionDate,
      p_deposit_payment_id: depositPaymentId,
      p_deposit_amount: body.depositCollected ? body.depositAmount : 0,
      p_deposit_collected: body.depositCollected,
    });
    if (rpcErr) {
      console.error('RPC error:', rpcErr.message, { code: rpcErr.code });
      throw new Error(`activate_order_atomic RPC failed: ${rpcErr.message}`);
    }

    // 16. Return result
    res.status(201).json({
      success: true,
      data: { orderId, orderReference, customerId },
    });

    // 17. Fire-and-forget booking confirmation email
    void (async () => {
      try {
        const formatManila = (iso: string) =>
          new Date(iso).toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            dateStyle: 'medium',
            timeStyle: 'short',
          });

        const waiverUrl = `${process.env.WEB_URL ?? 'https://lolasrentals.com'}/waiver/${orderReference}`;
        const whatsappNumber = process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX';

        // Customer confirmation
        if (body.customerEmail) {
          void sendEmail({
            to: body.customerEmail,
            subject: `Booking Confirmed — ${orderReference} | Lola's Rentals`,
            html: bookingConfirmationHtml({
              customerName: body.customerName,
              orderReference,
              vehicleName: body.vehicleName,
              vehicleCount: 1,
              pickupDatetime: formatManila(body.pickupDatetime),
              dropoffDatetime: formatManila(body.dropoffDatetime),
              pickupLocation,
              dropoffLocation,
              totalAmount: body.grandTotal,
              paymentMethod: body.paymentMethod,
              addons: [],
              charityDonation: body.charityDonation ?? 0,
              hasTransfer: false,
              transferAmount: 0,
              waiverUrl,
              whatsappNumber,
            }),
          });
        }

        // Staff alert
        void sendEmail({
          to: NOTIFICATION_EMAIL,
          subject: `🐾 New Walk-in — ${orderReference} — ${body.customerName}`,
          html: walkInStaffAlertHtml({
            customerName: body.customerName,
            customerEmail: body.customerEmail,
            customerMobile: body.customerMobile,
            orderReference,
            vehicleName: body.vehicleName,
            pickupDatetime: formatManila(body.pickupDatetime),
            dropoffDatetime: formatManila(body.dropoffDatetime),
            grandTotal: body.grandTotal,
          }),
        });
      } catch (err) {
        console.error('[walk-in-email] Error:', err);
      }
    })();
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
      .select(ORDERS_RAW_INBOX_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (store) query = query.eq('source', store);
    if (status) query = query.eq('status', status);
    else query = query.eq('status', 'unprocessed');

    if (search && search.trim()) {
      const safe = search.trim().replace(/[%_\\,()]/g, '\\$&');
      const term = `%${safe}%`;
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
      .select(ORDERS_RAW_INBOX_COLUMNS)
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
      transferRepo: req.app.locals.deps.transferRepo,
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
        orderId: undefined,
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
  amount: z.number().positive(),
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
    const txDate = formatManilaDate();
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

    void (async () => {
      try {
        const formatManila = (iso: string) =>
          new Date(iso).toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            dateStyle: 'medium',
            timeStyle: 'short',
          });

        const { data: order } = await supabase
          .from('orders_raw')
          .select(`
            customer_email,
            customer_name,
            vehicle_model_id,
            pickup_datetime,
            dropoff_datetime,
            order_reference
          `)
          .eq('id', id)
          .single();

        if (!order?.customer_email) return;

        let vehicleName = order.vehicle_model_id;
        try {
          const { data: vm } = await supabase
            .from('vehicle_models')
            .select('name')
            .eq('id', order.vehicle_model_id)
            .single();
          if (vm?.name) vehicleName = vm.name;
        } catch { /* non-critical */ }

        void sendEmail({
          to: order.customer_email,
          subject: `Booking Cancelled — ${order.order_reference} | Lola's Rentals`,
          html: bookingCancellationHtml({
            orderReference: order.order_reference ?? id,
            vehicleName,
            pickupDatetime: order.pickup_datetime
              ? formatManila(order.pickup_datetime)
              : undefined,
            dropoffDatetime: order.dropoff_datetime
              ? formatManila(order.dropoff_datetime)
              : undefined,
            whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX',
          }),
        });
      } catch (err) {
        console.error('[cancel-email] Error:', err);
      }
    })();
  } catch (err) {
    next(err);
  }
});

export { router as ordersRawRoutes };
