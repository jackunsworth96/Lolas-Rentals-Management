import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { createHold } from '../use-cases/booking/create-hold.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { logger } from '../lib/logger.js';
import { publicWebOriginFromEnv } from '../lib/public-web-url.js';
import {
  extDayCount,
  orderReferenceLookupVariants,
  resolveExtensionForActive,
  resolveExtensionForRaw,
} from './public-extend-helpers.js';

/**
 * Routes consumed by respond.io (or any authenticated third-party caller).
 * All routes in this file are mounted behind the authenticateApiKey middleware
 * in server.ts, so no individual route needs its own auth check.
 */

const STORE_ID = 'store-lolas';
const BOOKING_HANDOFF_CART_ORIGIN = publicWebOriginFromEnv(
  process.env.BOOKING_HANDOFF_CART_ORIGIN,
  'http://localhost:3002',
);
const EXTENSION_PAYMENT_ORIGIN = publicWebOriginFromEnv(
  process.env.WEB_URL,
  'http://localhost:3002',
);

/**
 * Hardcoded until a callout_charges config table is added.
 * minimum: fixed call-out fee (PHP); per_km: incremental rate (PHP).
 */
const CALLOUT_CHARGE = { minimum: 200, per_km: 20 } as const;

/** 5-minute in-memory cache — same TTL used by chat.ts for live pricing. */
let fleetCache: { data: FleetPayload; fetchedAt: number } | null = null;
let transfersCache: { data: TransfersPayload; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Response shape ────────────────────────────────────────────────────────────

interface PricingBrackets {
  '1_2_days': number | null;
  '3_6_days': number | null;
  '7_plus_days': number | null;
}

interface VehicleEntry {
  model_id: string;
  model: string;
  type: string | null;
  cc: number | null;
  max_pax: number | null;
  pricing: PricingBrackets;
  deposit: number;
  peace_of_mind_per_day: number | null;
}

interface AddonEntry {
  id: number;
  name: string;
  price: number;
  price_type: 'per_day' | 'one_time';
}

interface RespondAddonEntry extends AddonEntry {
  key: string;
  aliases: string[];
  compatible_vehicle_model_id: string | null;
}

interface FleetPayload {
  vehicles: VehicleEntry[];
  addons: AddonEntry[];
  callout_charge: typeof CALLOUT_CHARGE;
}

// ── Transfer route pricing ────────────────────────────────────────────────────

interface TransferRouteEntry {
  route:        string;
  van_type:     string | null;
  pricing_type: 'fixed' | 'per_head';
  price:        number;
}

interface TransfersPayload {
  transfers: TransferRouteEntry[];
}

// ── Booking lookup ────────────────────────────────────────────────────────────

interface BookingRow {
  order_reference:  string;
  status:           string;
  customer_name:    string | null;
  vehicle_model_id: string | null;
  pickup_datetime:  string | null;
  dropoff_datetime: string | null;
  store_id:         string;
  web_quote_raw:    number | null;
}

const BOOKING_COLUMNS =
  'order_reference, status, customer_name, vehicle_model_id, pickup_datetime, dropoff_datetime, store_id, web_quote_raw';

/**
 * Statuses for orders_raw that represent a live (non-cancelled, non-skipped)
 * booking. orders_raw never holds 'active'/'confirmed'/'completed' — those
 * belong to the orders table. Using the wrong status set here caused every
 * orders_raw lookup to silently return 0 rows, making unactivated direct/walk-in
 * bookings invisible to this endpoint.
 */
const RAW_RETURNABLE_STATUSES = ['unprocessed', 'processed'] as const;

/** Statuses on the canonical orders table that represent a live booking. */
const RETURNABLE_STATUSES = ['active', 'confirmed', 'completed'] as const;

// ── Raw DB row shapes ─────────────────────────────────────────────────────────

interface PricingRow {
  model_id: string;
  daily_rate: number;
  min_days: number;
  max_days: number;
  vehicle_models: {
    id: string;
    name: string;
    security_deposit: number;
    type: string | null;
    cc: number | null;
    max_pax: number | null;
  };
}

interface AddonRow {
  id: number;
  name: string;
  addon_type: 'per_day' | 'one_time';
  price_per_day: number;
  price_one_time: number;
}

interface ConfigAddonLike {
  id: number | string;
  name: string;
  addonType: 'per_day' | 'one_time';
  pricePerDay: number;
  priceOneTime: number;
  applicableModelIds?: string[] | null;
  isActive?: boolean;
}

interface ConfigVehicleModelLike {
  id?: string;
  name?: string;
}

interface LocationEntry {
  id: number;
  name: string;
  delivery_cost: number;
  collection_cost: number;
  location_type: string | null;
}

interface RespondExtensionTarget {
  orderReference: string;
  email: string;
  customerName: string | null;
  status: string;
  source: 'active' | 'raw';
  orderItemId: string | null;
  currentDropoffDatetime: string;
  pickupDatetime: string | null;
  vehicleModelId: string | null;
  vehicle: string;
  storeId: string;
  currentDailyRate: number | null;
  message?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Maps sorted pricing brackets to the three fixed response keys.
 * Brackets are sorted by min_days ascending before being slotted in:
 *   index 0 → 1_2_days, index 1 → 3_6_days, index 2 → 7_plus_days
 */
function mapToPricingBrackets(
  brackets: Array<{ min_days: number; daily_rate: number }>,
): PricingBrackets {
  const sorted = [...brackets].sort((a, b) => a.min_days - b.min_days);
  return {
    '1_2_days':    sorted[0]?.daily_rate ?? null,
    '3_6_days':    sorted[1]?.daily_rate ?? null,
    '7_plus_days': sorted[2]?.daily_rate ?? null,
  };
}

/**
 * All plausible Philippine mobile variants for `.in('mobile', …)` / customer_mobile
 * so lookups succeed whether rows are normalised to E.164 or not yet.
 */
function philippinePhoneVariants(raw: string): string[] {
  const d = raw.replace(/[\s\-().]/g, '');

  let local: string | null = null;

  if (/^\+639\d{9}$/.test(d))  local = d.slice(3);
  else if (/^639\d{9}$/.test(d)) local = d.slice(2);
  else if (/^09\d{9}$/.test(d))  local = d.slice(1);
  else if (/^9\d{9}$/.test(d))   local = d;

  if (!local) return [raw];

  return [`+63${local}`, `0${local}`, `63${local}`, local];
}

function manilaDateKey(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function buildExtensionPaymentUrl(orderReference: string): string {
  return `${EXTENSION_PAYMENT_ORIGIN}/book/extend/pay?ref=${encodeURIComponent(orderReference)}`;
}

function getLookupParams(req: Request): {
  ref: string | null;
  phone: string | null;
} {
  let ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : null;
  let phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : null;
  const lookup = typeof req.query.lookup === 'string' ? req.query.lookup.trim() : null;

  if (!ref && !phone && lookup) {
    if (/^(LR|BB)[-\s]?\d{4}/i.test(lookup)) {
      ref = lookup;
    } else {
      phone = lookup;
    }
  }

  return { ref, phone };
}

function loggableLookup(params: { ref: string | null; phone: string | null }) {
  const digits = params.phone?.replace(/\D/g, '') ?? '';
  return {
    ref: params.ref ?? undefined,
    phone_last4: digits ? digits.slice(-4) : undefined,
  };
}

function summariseExtensionResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object') return payload;
  const body = payload as Record<string, unknown>;
  return {
    success: body.success,
    found: body.found,
    code: body.code,
    message: body.message ?? body.error,
    order_reference: body.order_reference,
    can_extend: body.can_extend,
    current_dropoff_datetime: body.current_dropoff_datetime,
    new_dropoff_datetime: body.new_dropoff_datetime,
    extension_days: body.extension_days,
    extension_total: body.extension_total,
    extension_cost: body.extension_cost,
  };
}

function sendRespondExtensionJson(
  res: Response,
  action: 'lookup' | 'preview' | 'confirm',
  params: { ref: string | null; phone: string | null },
  payload: unknown,
  status = 200,
) {
  logger.info(
    {
      action,
      status,
      lookup: loggableLookup(params),
      response: summariseExtensionResponse(payload),
    },
    'respond.io extension response',
  );
  return res.status(status).json(payload);
}

function addonKeyForName(name: string): { key: string; aliases: string[] } {
  const lower = name.toLowerCase();
  if (lower.includes('peace')) {
    return { key: 'peace_of_mind', aliases: ['peace of mind', 'peace', 'pom', 'cover'] };
  }
  if (lower.includes('surf')) {
    return { key: 'surf_rack', aliases: ['surf rack', 'rack', 'board rack'] };
  }
  if (lower.includes('bungee')) {
    return { key: 'bungee_cord', aliases: ['bungee cord', 'bungee'] };
  }
  if (lower.includes('9pm') || lower.includes('9 pm') || lower.includes('late')) {
    return { key: 'late_return', aliases: ['late return', '9pm return', '9 pm return'] };
  }
  return {
    key: lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    aliases: [lower],
  };
}

function isTuktukName(value: string | null | undefined): boolean {
  const lower = value?.toLowerCase() ?? '';
  return lower.includes('tuktuk') || lower.includes('tuk tuk') || lower.includes('tuk');
}

function normaliseLookupText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function resolveVehicleModelForRespondAddons(
  configRepo: {
    getVehicleModelById: (id: string) => Promise<ConfigVehicleModelLike | null>;
    getVehicleModels?: () => Promise<ConfigVehicleModelLike[]>;
  },
  vehicleModelLookup: string | undefined,
): Promise<{ id: string; model: ConfigVehicleModelLike } | null> {
  const lookup = vehicleModelLookup?.trim();
  if (!lookup) return null;

  const byId = await configRepo.getVehicleModelById(lookup);
  if (byId) return { id: byId.id ?? lookup, model: byId };

  const models = configRepo.getVehicleModels ? await configRepo.getVehicleModels() : [];
  const normalisedLookup = normaliseLookupText(lookup);
  const byName = models.find((model) => {
    const id = model.id ? normaliseLookupText(model.id) : '';
    const name = model.name ? normaliseLookupText(model.name) : '';
    return id === normalisedLookup || name === normalisedLookup;
  });

  return byName?.id ? { id: byName.id, model: byName } : null;
}

function isAddonCompatibleWithVehicle(
  addon: ConfigAddonLike,
  vehicleModelId: string | null,
  vehicleModel: ConfigVehicleModelLike | null,
): boolean {
  const applicableIds = addon.applicableModelIds;
  if (vehicleModelId && applicableIds && applicableIds.length > 0) {
    return applicableIds.includes(vehicleModelId);
  }

  if (!vehicleModelId) return true;

  const addonName = addon.name.toLowerCase();
  const isTuktukVehicle = isTuktukName(vehicleModelId) || isTuktukName(vehicleModel?.name);
  const isTuktukAddon = isTuktukName(addon.name);

  if (addonName.includes('peace')) {
    return isTuktukVehicle ? isTuktukAddon : !isTuktukAddon;
  }

  if (addonName.includes('surf') || addonName.includes('bungee')) {
    return !isTuktukVehicle;
  }

  return true;
}

function respondExtensionPublicTarget(target: RespondExtensionTarget) {
  return {
    found: true,
    order_reference: target.orderReference,
    customer_name: target.customerName,
    status: target.status,
    source: target.source,
    vehicle: target.vehicle,
    current_dropoff_datetime: target.currentDropoffDatetime,
    pickup_datetime: target.pickupDatetime,
    store_id: target.storeId,
    can_extend: target.source === 'active',
    extension_url: 'https://www.lolasrentals.com/book/extend',
    guidance: target.source === 'active'
      ? 'Use preview first, then confirm only after the customer agrees to the quoted extension balance.'
      : 'Extensions are only available once the rental is active. Hand off to the team for booking changes before pickup.',
    ...(target.message ? { message: target.message } : {}),
  };
}

async function resolveRespondExtensionTarget(
  sb: ReturnType<typeof getSupabaseClient>,
  params: { ref: string | null; phone: string | null },
): Promise<RespondExtensionTarget | null> {
  const { ref, phone } = params;
  const refVariants = ref ? orderReferenceLookupVariants(ref) : [];

  type CustomerRow = { id: string; name: string | null; email: string | null; mobile: string | null };
  const customerById = new Map<string, CustomerRow>();
  let customerIds: string[] = [];

  if (phone) {
    const { data: customers, error } = await sb
      .from('customers')
      .select('id, name, email, mobile')
      .in('mobile', philippinePhoneVariants(phone))
      .limit(10);
    if (error) throw error;
    for (const customer of (customers ?? []) as CustomerRow[]) {
      customerById.set(customer.id, customer);
    }
    customerIds = [...customerById.keys()];
  }

  let ordersQuery = sb
    .from('orders')
    .select('id, booking_token, status, store_id, customer_id, created_at')
    .eq('status', 'active');

  if (refVariants.length > 0) {
    ordersQuery = ordersQuery.in('booking_token', refVariants);
  } else if (customerIds.length > 0) {
    ordersQuery = ordersQuery.in('customer_id', customerIds).order('created_at', { ascending: false });
  } else {
    ordersQuery = ordersQuery.limit(0);
  }

  const { data: activeOrders, error: activeOrdersError } = await ordersQuery;
  if (activeOrdersError) throw activeOrdersError;

  type ActiveOrderRow = {
    id: string;
    booking_token: string | null;
    status: string;
    store_id: string;
    customer_id: string | null;
    created_at: string;
  };
  const activeOrder = ((activeOrders ?? []) as ActiveOrderRow[])[0];

  if (activeOrder) {
    let customer = activeOrder.customer_id ? customerById.get(activeOrder.customer_id) ?? null : null;
    if (!customer && activeOrder.customer_id) {
      const { data, error } = await sb
        .from('customers')
        .select('id, name, email, mobile')
        .eq('id', activeOrder.customer_id)
        .maybeSingle();
      if (error) throw error;
      customer = data as CustomerRow | null;
    }

    const { data: item, error: itemError } = await sb
      .from('order_items')
      .select('id, vehicle_id, pickup_datetime, dropoff_datetime, store_id, rental_rate, vehicle_name, vehicle_model_id')
      .eq('order_id', activeOrder.id)
      .not('pickup_datetime', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (itemError) throw itemError;

    if (item?.dropoff_datetime) {
      let vehicleModelId = (item.vehicle_model_id as string | null) ?? null;
      let vehicle = (item.vehicle_name as string | null) ?? 'Unknown';

      if (item.vehicle_id && (!vehicleModelId || vehicle === 'Unknown')) {
        const { data: fleetRow } = await sb
          .from('fleet')
          .select('model_id, name')
          .eq('id', item.vehicle_id as string)
          .maybeSingle();
        vehicleModelId = vehicleModelId ?? ((fleetRow?.model_id as string | null) ?? null);
        vehicle = vehicle !== 'Unknown' ? vehicle : ((fleetRow?.name as string | null) ?? 'Unknown');
      }

      if (vehicle === 'Unknown' && vehicleModelId) {
        vehicle = await resolveVehicleModelName(sb, vehicleModelId);
      }

      return {
        orderReference: activeOrder.booking_token ?? activeOrder.id,
        email: customer?.email?.trim().toLowerCase() ?? '',
        customerName: customer?.name ?? null,
        status: activeOrder.status,
        source: 'active',
        orderItemId: item.id as string,
        currentDropoffDatetime: item.dropoff_datetime as string,
        pickupDatetime: (item.pickup_datetime as string | null) ?? null,
        vehicleModelId,
        vehicle,
        storeId: (item.store_id as string | null) ?? activeOrder.store_id,
        currentDailyRate: item.rental_rate != null ? Number(item.rental_rate) : null,
      };
    }
  }

  let rawQuery = sb
    .from('orders_raw')
    .select('order_reference, status, customer_name, customer_email, customer_mobile, pickup_datetime, dropoff_datetime, store_id, vehicle_model_id')
    .in('status', ['unprocessed', 'processed'])
    .order('created_at', { ascending: false });

  if (refVariants.length > 0) {
    rawQuery = rawQuery.in('order_reference', refVariants);
  } else if (phone) {
    rawQuery = rawQuery.in('customer_mobile', philippinePhoneVariants(phone));
  } else {
    rawQuery = rawQuery.limit(0);
  }

  const { data: rawRows, error: rawError } = await rawQuery;
  if (rawError) throw rawError;
  const raw = ((rawRows ?? []) as Array<{
    order_reference: string;
    status: string;
    customer_name: string | null;
    customer_email: string | null;
    pickup_datetime: string | null;
    dropoff_datetime: string | null;
    store_id: string;
    vehicle_model_id: string | null;
  }>)[0];

  if (!raw?.dropoff_datetime) return null;

  return {
    orderReference: raw.order_reference,
    email: raw.customer_email?.trim().toLowerCase() ?? '',
    customerName: raw.customer_name ?? null,
    status: raw.status,
    source: 'raw',
    orderItemId: null,
    currentDropoffDatetime: raw.dropoff_datetime,
    pickupDatetime: raw.pickup_datetime,
    vehicleModelId: raw.vehicle_model_id,
    vehicle: raw.vehicle_model_id ? await resolveVehicleModelName(sb, raw.vehicle_model_id) : 'Unknown',
    storeId: raw.store_id,
    currentDailyRate: null,
    message: raw.status === 'unprocessed'
      ? 'This booking is not active yet, so respond.io should hand off instead of confirming an extension.'
      : undefined,
  };
}

async function previewRespondExtension(
  req: Request,
  target: RespondExtensionTarget,
  newDropoffDatetime: string,
) {
  if (!target.email) {
    return {
      ok: false as const,
      status: 409,
      payload: {
        success: false,
        code: 'EMAIL_REQUIRED',
        message: 'This booking has no customer email on file. Hand off to the team to process the extension.',
      },
    };
  }

  const currentDropoff = new Date(target.currentDropoffDatetime);
  const newDropoff = new Date(newDropoffDatetime);
  if (Number.isNaN(newDropoff.getTime())) {
    return {
      ok: false as const,
      status: 400,
      payload: { success: false, code: 'INVALID_DATE', message: 'newDropoffDatetime must be a valid ISO datetime.' },
    };
  }
  if (newDropoff <= currentDropoff) {
    return {
      ok: false as const,
      status: 400,
      payload: { success: false, code: 'INVALID_DATE', message: 'New return date must be after the current return date.' },
    };
  }
  if (manilaDateKey(newDropoff) === manilaDateKey(currentDropoff)) {
    return {
      ok: false as const,
      status: 409,
      payload: {
        success: false,
        code: 'SAME_DAY_LATE_RETURN_HANDOFF',
        message: 'Same-day late returns need team confirmation. Offer the 9pm return option: PHP 100 per vehicle, store only, arranged before 4pm.',
      },
    };
  }
  if (target.source !== 'active') {
    return {
      ok: false as const,
      status: 409,
      payload: {
        success: false,
        code: 'ORDER_NOT_ACTIVE',
        message: 'Extensions are only available once the rental is active. Hand off to the team for booking changes before pickup.',
      },
    };
  }

  const extDays = extDayCount(currentDropoff.getTime(), newDropoff.getTime());
  let dailyRate = target.currentDailyRate ?? 0;

  if (target.vehicleModelId) {
    const availability = await checkAvailability(
      { bookingPort: req.app.locals.deps.bookingPort },
      {
        storeId: target.storeId,
        pickupDatetime: target.currentDropoffDatetime,
        dropoffDatetime: newDropoffDatetime,
        excludeOrderItemId: target.orderItemId ?? undefined,
      },
    );
    const modelAvailability = availability.find((entry) => entry.modelId === target.vehicleModelId);
    if (!modelAvailability || modelAvailability.availableCount === 0) {
      logger.info(
        {
          orderReference: target.orderReference,
          vehicleModelId: target.vehicleModelId,
          vehicle: target.vehicle,
          excludedOrderItemId: target.orderItemId ?? undefined,
          pickupDatetime: target.currentDropoffDatetime,
          dropoffDatetime: newDropoffDatetime,
          modelAvailability: modelAvailability
            ? {
                modelId: modelAvailability.modelId,
                modelName: modelAvailability.modelName,
                availableCount: modelAvailability.availableCount,
                nextAvailablePickup: modelAvailability.nextAvailablePickup,
                holdExpiresAt: modelAvailability.holdExpiresAt,
              }
            : null,
        },
        'respond.io extension availability unavailable',
      );
      return {
        ok: false as const,
        status: 409,
        payload: {
          success: false,
          code: 'NOT_AVAILABLE',
          message: 'Sorry, this vehicle is not available for the extended dates. Hand off to the team.',
        },
      };
    }

    const locRows = await req.app.locals.deps.configRepo.getLocations(target.storeId);
    const storeLoc = locRows.find((l: { deliveryCost: number; collectionCost: number }) =>
      Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0,
    );
    const locId = storeLoc ? Number(storeLoc.id) : (locRows[0] ? Number(locRows[0].id) : 1);
    const quote = await computeQuote(
      { configRepo: req.app.locals.deps.configRepo },
      {
        storeId: target.storeId,
        vehicleModelId: target.vehicleModelId,
        pickupDatetime: target.currentDropoffDatetime,
        dropoffDatetime: newDropoffDatetime,
        pickupLocationId: locId,
        dropoffLocationId: locId,
      },
    );
    const computedDailyRate = extDays > 0 ? quote.rentalSubtotal / extDays : quote.rentalSubtotal;
    dailyRate = target.currentDailyRate && target.currentDailyRate > 0
      ? Math.min(computedDailyRate, target.currentDailyRate)
      : computedDailyRate;
  }

  const extensionTotal = Math.round(dailyRate * extDays * 100) / 100;
  return {
    ok: true as const,
    payload: {
      success: true,
      order_reference: target.orderReference,
      customer_name: target.customerName,
      vehicle: target.vehicle,
      current_dropoff_datetime: target.currentDropoffDatetime,
      new_dropoff_datetime: newDropoffDatetime,
      extension_days: extDays,
      daily_rate: Math.round(dailyRate * 100) / 100,
      extension_total: extensionTotal,
      balance_note: 'Add this amount to the booking balance. Confirm only after the customer agrees.',
      customer_message: `Yes, we can extend your rental to ${newDropoff.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}. The extension balance is PHP ${extensionTotal.toLocaleString('en-PH')}. Shall I confirm that for you?`,
    },
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

const RespondAddonsQuerySchema = z.object({
  storeId: z.string().trim().min(1).optional().default(STORE_ID),
  vehicleModelId: z.string().trim().min(1).optional(),
});

/**
 * GET /api/public/respond/fleet
 *
 * Returns live vehicle models with pricing brackets, active add-ons, and
 * callout charge config. Inventory counts are intentionally not disclosed.
 */
router.get('/fleet', async (_req, res, next) => {
  try {
    const now = Date.now();

    if (fleetCache && now - fleetCache.fetchedAt < CACHE_TTL_MS) {
      res.json(fleetCache.data);
      return;
    }

    const sb = getSupabaseClient();

    const [pricingResult, addonsResult] = await Promise.all([
      sb
        .from('vehicle_model_pricing')
        .select('model_id, daily_rate, min_days, max_days, vehicle_models!inner(id, name, security_deposit, type, cc, max_pax)')
        .eq('store_id', STORE_ID)
        .order('min_days'),

      sb
        .from('addons')
        .select('id, name, addon_type, price_per_day, price_one_time')
        .eq('is_active', true)
        .or(`store_id.eq.${STORE_ID},store_id.is.null`)
        .order('name'),
    ]);

    if (pricingResult.error) throw pricingResult.error;
    if (addonsResult.error)  throw addonsResult.error;

    const pricingRows  = (pricingResult.data ?? []) as unknown as PricingRow[];
    const addonRows    = (addonsResult.data  ?? []) as AddonRow[];

    // ── Peace-of-mind rate — matched per vehicle type ─────────────────────────
    //
    // The addons table has two separate rows:
    //   "Peace of Mind Cover"          → scooters (95/day)
    //   "Peace of Mind Cover (TukTuk)" → tuktuk   (200/day)
    //
    // We identify which rate applies to each model by checking whether the
    // addon name contains "tuktuk" and whether the model is a tuktuk (via
    // type column if available, or model name as fallback).

    const pomAddons = addonRows.filter((a) => a.name.toLowerCase().includes('peace'));

    function pomRateForModel(modelType: string | null, modelName: string): number | null {
      const isTuktuk =
        modelType === 'tuktuk' ||
        modelName.toLowerCase().includes('tuk');

      const match = isTuktuk
        ? pomAddons.find((a) => a.name.toLowerCase().includes('tuktuk') || a.name.toLowerCase().includes('tuk tuk'))
        : pomAddons.find((a) => !a.name.toLowerCase().includes('tuktuk') && !a.name.toLowerCase().includes('tuk tuk'));

      return match != null ? Number(match.price_per_day) : null;
    }

    // ── Group pricing brackets by model ──────────────────────────────────────

    const byModel = new Map<
      string,
      {
        name:                  string;
        type:                  string | null;
        cc:                    number | null;
        max_pax:               number | null;
        security_deposit:      number;
        peace_of_mind_per_day: number | null;
        brackets:              Array<{ min_days: number; daily_rate: number }>;
      }
    >();

    for (const row of pricingRows) {
      const model = row.vehicle_models;
      if (!byModel.has(row.model_id)) {
        byModel.set(row.model_id, {
          name:                  model.name,
          type:                  model.type ?? null,
          cc:                    model.cc != null ? Number(model.cc) : null,
          max_pax:               model.max_pax != null ? Number(model.max_pax) : null,
          security_deposit:      Number(model.security_deposit ?? 0),
          peace_of_mind_per_day: pomRateForModel(model.type ?? null, model.name),
          brackets:              [],
        });
      }
      byModel.get(row.model_id)!.brackets.push({
        min_days:   Number(row.min_days),
        daily_rate: Number(row.daily_rate),
      });
    }

    // ── Build vehicle entries ─────────────────────────────────────────────────

    const vehicles: VehicleEntry[] = [];
    for (const [modelId, entry] of byModel) {
      vehicles.push({
        model_id:              modelId,
        model:                 entry.name,
        type:                  entry.type,
        cc:                    entry.cc,
        max_pax:               entry.max_pax,
        pricing:               mapToPricingBrackets(entry.brackets),
        deposit:               entry.security_deposit,
        peace_of_mind_per_day: entry.peace_of_mind_per_day,
      });
    }

    // Sort alphabetically so the response is deterministic.
    vehicles.sort((a, b) => a.model.localeCompare(b.model));

    // ── Build addon entries ───────────────────────────────────────────────────

    // Exclude the peace-of-mind addon — it is already surfaced per vehicle above.
    const addons: AddonEntry[] = addonRows
      .filter((a) => !a.name.toLowerCase().includes('peace'))
      .map((a) => ({
        id:         Number(a.id),
        name:       a.name,
        price:      a.addon_type === 'per_day' ? Number(a.price_per_day) : Number(a.price_one_time),
        price_type: a.addon_type,
      }));

    // ── Assemble and cache ────────────────────────────────────────────────────

    const payload: FleetPayload = {
      vehicles,
      addons,
      callout_charge: CALLOUT_CHARGE,
    };

    fleetCache = { data: payload, fetchedAt: now };
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/public/respond/addons
 *
 * Returns add-on IDs and prices in a Respond.io-friendly shape. When
 * vehicleModelId is supplied, scooter/TukTuk-specific add-ons are filtered so
 * the agent can map a customer choice like "peace_of_mind" to the exact ID.
 */
router.get('/addons', async (req, res, next) => {
  try {
    const parsed = RespondAddonsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error:   'Invalid add-ons lookup query',
        details: parsed.error.flatten(),
      });
      return;
    }

    const { storeId, vehicleModelId } = parsed.data;
    const resolvedVehicle = await resolveVehicleModelForRespondAddons(
      req.app.locals.deps.configRepo,
      vehicleModelId,
    );

    if (vehicleModelId && !resolvedVehicle) {
      res.status(404).json({ error: 'Vehicle model not found' });
      return;
    }

    const resolvedVehicleModelId = resolvedVehicle?.id ?? null;
    const vehicleModel = resolvedVehicle?.model ?? null;
    const allAddons = (await req.app.locals.deps.configRepo.getAddons(storeId)) as ConfigAddonLike[];
    const addons: RespondAddonEntry[] = allAddons
      .filter((addon) => addon.isActive !== false)
      .filter((addon) => isAddonCompatibleWithVehicle(addon, resolvedVehicleModelId, vehicleModel))
      .map((addon) => {
        const { key, aliases } = addonKeyForName(addon.name);
        return {
          id: Number(addon.id),
          key,
          aliases,
          name: addon.name,
          price: addon.addonType === 'per_day' ? Number(addon.pricePerDay) : Number(addon.priceOneTime),
          price_type: addon.addonType,
          compatible_vehicle_model_id: resolvedVehicleModelId,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      resolved_vehicle_model_id: resolvedVehicleModelId,
      resolved_vehicle_model_name: vehicleModel?.name ?? null,
      addons,
      guidance: {
        addonIds: 'Pass selected add-on IDs as addonIds in booking-handoff, e.g. [] or [11].',
        match_by: 'Use key first, then aliases/name if needed.',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/public/respond/locations
 *
 * Returns active booking locations with the IDs required by the public
 * booking cart/submit flow.
 */
router.get('/locations', async (_req, res, next) => {
  try {
    const sb = getSupabaseClient();

    const { data, error } = await sb
      .from('locations')
      .select('id, name, delivery_cost, collection_cost, location_type')
      .eq('is_active', true)
      .or(`store_id.eq.${STORE_ID},store_id.is.null`)
      .order('location_type', { ascending: false })
      .order('name');

    if (error) {
      console.error('[respond/locations] locations query failed:', error);
      throw error;
    }

    const locations: LocationEntry[] = (data ?? []).map((row) => ({
      id:              Number(row.id),
      name:            row.name as string,
      delivery_cost:   Number(row.delivery_cost ?? 0),
      collection_cost: Number(row.collection_cost ?? 0),
      location_type:   (row.location_type as string | null) ?? null,
    }));

    res.json({ locations });
  } catch (err) {
    next(err);
  }
});

const RespondBookingHandoffSchema = z.object({
  vehicleModelId: z.string().min(1),
  pickupDatetime: z.string().min(1),
  dropoffDatetime: z.string().min(1),
  pickupLocationId: z.coerce.number().int().positive(),
  dropoffLocationId: z.coerce.number().int().positive(),
  storeId: z.string().min(1).optional().default(STORE_ID),
  sessionToken: z.string().min(20).optional(),
  customer: z
    .object({
      fullName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      nationality: z.string().optional(),
      accommodationName: z.string().optional(),
      company: z.string().optional(),
      extraComments: z.string().optional(),
    })
    .optional(),
  addonIds: z.preprocess((value) => {
    if (value === 0 || value === '0' || value === '' || value == null) return undefined;
    if (typeof value === 'number') return [value];
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return [value.trim()];
    return value;
  }, z.array(z.coerce.number().int().positive()).optional()),
  transfer: z
    .object({
      transferType: z.enum(['shared', 'private', 'tuktuk']),
      transferRoute: z.string().min(1),
      flightNumber: z.string().optional(),
      flightArrivalTime: z.string().optional(),
      transferRouteId: z.coerce.number().int().positive().optional(),
      vanType: z.string().optional(),
      pricingType: z.enum(['fixed', 'per_head']).optional(),
      unitPrice: z.coerce.number().min(0).optional(),
      paxCount: z.coerce.number().int().positive().optional(),
      totalPrice: z.coerce.number().min(0).optional(),
    })
    .optional(),
  respond: z.record(z.unknown()).optional(),
});

function isValidDateRange(pickupDatetime: string, dropoffDatetime: string): boolean {
  const pickup = new Date(pickupDatetime);
  const dropoff = new Date(dropoffDatetime);
  return !Number.isNaN(pickup.getTime()) && !Number.isNaN(dropoff.getTime()) && dropoff > pickup;
}

function normaliseRenterDetails(
  customer: z.infer<typeof RespondBookingHandoffSchema>['customer'],
): Record<string, string> | null {
  if (!customer) return null;

  const renter = {
    fullName:          customer.fullName?.trim() ?? '',
    email:             customer.email?.trim() ?? '',
    phone:             customer.phone?.trim() ?? '',
    nationality:       customer.nationality?.trim() ?? '',
    accommodationName: customer.accommodationName?.trim() ?? '',
    company:           customer.company?.trim() ?? '',
    extraComments:     customer.extraComments?.trim() ?? '',
  };

  return Object.values(renter).some((v) => v.length > 0) ? renter : null;
}

function isMissingHandoffContextColumn(error: { message?: string; code?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === 'PGRST204' ||
        error.message?.includes('handoff_context') ||
        error.message?.includes('Could not find the')),
  );
}

router.post('/booking-handoff', async (req, res, next) => {
  try {
    const parsed = RespondBookingHandoffSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:   'Invalid booking handoff payload',
        details: parsed.error.flatten(),
      });
      return;
    }

    const input = parsed.data;
    if (!isValidDateRange(input.pickupDatetime, input.dropoffDatetime)) {
      res.status(400).json({ error: 'dropoffDatetime must be after pickupDatetime' });
      return;
    }

    const sb = getSupabaseClient();

    const [modelResult, pickupLocResult, dropoffLocResult] = await Promise.all([
      sb
        .from('vehicle_models')
        .select('id, name, security_deposit')
        .eq('id', input.vehicleModelId)
        .eq('is_active', true)
        .maybeSingle(),
      sb
        .from('locations')
        .select('id, name, delivery_cost, collection_cost, location_type')
        .eq('id', input.pickupLocationId)
        .eq('is_active', true)
        .or(`store_id.eq.${input.storeId},store_id.is.null`)
        .maybeSingle(),
      sb
        .from('locations')
        .select('id, name, delivery_cost, collection_cost, location_type')
        .eq('id', input.dropoffLocationId)
        .eq('is_active', true)
        .or(`store_id.eq.${input.storeId},store_id.is.null`)
        .maybeSingle(),
    ]);

    if (modelResult.error) throw modelResult.error;
    if (pickupLocResult.error) throw pickupLocResult.error;
    if (dropoffLocResult.error) throw dropoffLocResult.error;

    if (!modelResult.data) {
      res.status(404).json({ error: 'Vehicle model not found' });
      return;
    }
    if (!pickupLocResult.data || !dropoffLocResult.data) {
      res.status(404).json({ error: 'Pickup or dropoff location not found' });
      return;
    }

    const sessionToken = input.sessionToken ?? `respond_${randomUUID()}`;
    const hold = await createHold(
      { bookingPort: req.app.locals.deps.bookingPort },
      {
        vehicleModelId:  input.vehicleModelId,
        storeId:         input.storeId,
        pickupDatetime:  input.pickupDatetime,
        dropoffDatetime: input.dropoffDatetime,
        sessionToken,
      },
    );

    let quote: Awaited<ReturnType<typeof computeQuote>> | null = null;
    try {
      quote = await computeQuote(
        { configRepo: req.app.locals.deps.configRepo },
        {
          storeId:            input.storeId,
          vehicleModelId:     input.vehicleModelId,
          pickupDatetime:     input.pickupDatetime,
          dropoffDatetime:    input.dropoffDatetime,
          pickupLocationId:   input.pickupLocationId,
          dropoffLocationId:  input.dropoffLocationId,
          addonIds:           input.addonIds && input.addonIds.length > 0 ? input.addonIds : undefined,
        },
      );
    } catch (err) {
      if (input.addonIds && input.addonIds.length > 0) {
        throw err;
      }
      console.error('[respond/booking-handoff] quote computation failed:', err);
    }

    const renterDetails = normaliseRenterDetails(input.customer);
    const handoffContext = {
      source: 'respond.io',
      pickupLocationId: input.pickupLocationId,
      dropoffLocationId: input.dropoffLocationId,
      addonIds: input.addonIds ?? [],
      transfer: input.transfer ?? null,
      respond: input.respond ?? null,
      createdAt: new Date().toISOString(),
    };
    const renterDetailsWithFallback = {
      ...(renterDetails ?? {}),
      __handoffContext: handoffContext,
    };

    const baseSessionRow = {
      session_token:     sessionToken,
      store_id:          input.storeId,
      pickup_datetime:   input.pickupDatetime,
      dropoff_datetime:  input.dropoffDatetime,
      basket_items:      [input.vehicleModelId],
      renter_details:    renterDetailsWithFallback,
      device_type:       'mobile',
      basket_viewed_at:  null,
      submitted_at:      null,
    };

    const { error: sessionUpsertError } = await sb.from('booking_sessions').upsert(
      {
        ...baseSessionRow,
        handoff_context: handoffContext,
      },
      { onConflict: 'session_token' },
    );
    if (isMissingHandoffContextColumn(sessionUpsertError)) {
      const { error: fallbackUpsertError } = await sb.from('booking_sessions').upsert(
        baseSessionRow,
        { onConflict: 'session_token' },
      );
      if (fallbackUpsertError) throw fallbackUpsertError;
    } else if (sessionUpsertError) {
      throw sessionUpsertError;
    }
    await sb.rpc('increment_booking_interaction', { p_session_token: sessionToken });

    const webBase = BOOKING_HANDOFF_CART_ORIGIN;
    const cartUrl = `${webBase}/book/basket?sessionToken=${encodeURIComponent(sessionToken)}`;
    const message =
      `Perfect, I reserved that vehicle for 10 minutes. ` +
      `Please review and confirm your booking here: ${cartUrl}`;

    res.status(201).json({
      sessionToken,
      holdId:    hold.id,
      expiresAt: hold.expiresAt,
      cartUrl,
      message,
      vehicle: {
        model_id:         modelResult.data.id,
        model:            modelResult.data.name,
        security_deposit: Number(modelResult.data.security_deposit ?? 0),
      },
      pickup: {
        id:              Number(pickupLocResult.data.id),
        name:            pickupLocResult.data.name,
        delivery_cost:   Number(pickupLocResult.data.delivery_cost ?? 0),
        location_type:   pickupLocResult.data.location_type ?? null,
      },
      dropoff: {
        id:              Number(dropoffLocResult.data.id),
        name:            dropoffLocResult.data.name,
        collection_cost: Number(dropoffLocResult.data.collection_cost ?? 0),
        location_type:   dropoffLocResult.data.location_type ?? null,
      },
      quote: quote
        ? {
            dailyRate:       quote.dailyRate,
            rentalSubtotal:  quote.rentalSubtotal,
            pickupFee:       quote.pickupFee,
            dropoffFee:      quote.dropoffFee,
            addons:          quote.addons,
            addonsTotal:     quote.addonsTotal,
            grandTotal:      quote.grandTotalWithFees,
            securityDeposit: quote.securityDeposit,
          }
        : null,
    });
  } catch (err) {
    if (typeof (err as { statusCode?: unknown }).statusCode !== 'number') {
      console.error('[respond/booking-handoff] unhandled error:', err);
    }
    next(err);
  }
});

/**
 * GET /api/public/respond/transfers
 *
 * Returns all active transfer routes with pricing. Excludes internal-only
 * columns (driver_cut) so the payload is safe to expose to third-party callers.
 * pricing_type values are exactly as stored: 'fixed' or 'per_head'.
 */
router.get('/transfers', async (_req, res, next) => {
  try {
    const now = Date.now();

    if (transfersCache && now - transfersCache.fetchedAt < CACHE_TTL_MS) {
      res.json(transfersCache.data);
      return;
    }

    const sb = getSupabaseClient();

    const { data, error } = await sb
      .from('transfer_routes')
      .select('route, van_type, price, pricing_type')
      .or(`store_id.eq.${STORE_ID},store_id.is.null`)
      .eq('is_active', true)
      .order('route')
      .order('van_type');

    if (error) {
      console.error('[respond/transfers] transfer_routes query failed:', error);
      throw error;
    }

    const transfers: TransferRouteEntry[] = (data ?? []).map((r) => ({
      route:        r.route as string,
      van_type:     (r.van_type as string | null) ?? null,
      pricing_type: (r.pricing_type as 'fixed' | 'per_head') ?? 'fixed',
      price:        Number(r.price),
    }));

    const payload: TransfersPayload = { transfers };
    transfersCache = { data: payload, fetchedAt: now };
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ── Shared booking response builder ──────────────────────────────────────────

interface BookingResponse {
  reference:         string;
  status:            string;
  customer_name:     string | null;
  vehicle:           string;
  pickup_datetime:   string | null;
  dropoff_datetime:  string | null;
  store:             string;
  estimated_total?:  number | null;
  balance_due?:      number | null;
  final_total?:      number | null;
  security_deposit?: number | null;
  deposit_status?:   string | null;
}

const STATUS_PRIORITY: Record<string, number> = { active: 0, confirmed: 1, completed: 2 };

async function resolveStoreName(
  sb: ReturnType<typeof getSupabaseClient>,
  storeId: string,
): Promise<string> {
  const { data, error } = await sb.from('stores').select('name').eq('id', storeId).maybeSingle();
  if (error) console.error('[respond/booking] stores query failed:', error);
  return data?.name ?? 'Unknown';
}

async function resolveVehicleModelName(
  sb: ReturnType<typeof getSupabaseClient>,
  modelId: string,
): Promise<string> {
  const { data, error } = await sb.from('vehicle_models').select('name').eq('id', modelId).maybeSingle();
  if (error) console.error('[respond/booking] vehicle_models query failed:', error);
  return data?.name ?? 'Unknown';
}

/**
 * GET /api/public/respond/extension/lookup?lookup=LR-XXXX-XXXX
 * GET /api/public/respond/extension/lookup?lookup=+63912345678
 */
router.get('/extension/lookup', async (req, res, next) => {
  try {
    const params = getLookupParams(req);
    if (!params.ref && !params.phone) {
      sendRespondExtensionJson(res, 'lookup', params, {
        found: false,
        error: 'Please provide ref, phone, or lookup query parameter.',
      }, 400);
      return;
    }

    const target = await resolveRespondExtensionTarget(getSupabaseClient(), params);
    if (!target) {
      sendRespondExtensionJson(res, 'lookup', params, {
        found: false,
        error: 'No active booking found. Ask for the booking reference or phone number, then hand off if it still cannot be found.',
      });
      return;
    }

    sendRespondExtensionJson(res, 'lookup', params, respondExtensionPublicTarget(target));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/public/respond/extension/preview?lookup=LR-XXXX-XXXX&newDropoffDatetime=2026-06-12T09:00:00%2B08:00
 */
router.get('/extension/preview', async (req, res, next) => {
  try {
    const params = getLookupParams(req);
    const newDropoffDatetime = typeof req.query.newDropoffDatetime === 'string'
      ? req.query.newDropoffDatetime.trim()
      : null;

    if ((!params.ref && !params.phone) || !newDropoffDatetime) {
      sendRespondExtensionJson(res, 'preview', params, {
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Provide ref, phone, or lookup plus newDropoffDatetime.',
      }, 400);
      return;
    }

    const target = await resolveRespondExtensionTarget(getSupabaseClient(), params);
    if (!target) {
      sendRespondExtensionJson(res, 'preview', params, {
        success: false,
        code: 'NOT_FOUND',
        message: 'Booking not found. Ask the customer to confirm their booking reference or phone number.',
      });
      return;
    }

    const preview = await previewRespondExtension(req, target, newDropoffDatetime);
    if (!preview.ok) {
      sendRespondExtensionJson(res, 'preview', params, preview.payload);
      return;
    }

    sendRespondExtensionJson(res, 'preview', params, preview.payload);
  } catch (err) {
    next(err);
  }
});

const RespondExtensionConfirmSchema = z.object({
  lookup: z.string().trim().min(1).optional(),
  ref: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  newDropoffDatetime: z.string().trim().min(1),
  confirmedByCustomer: z.coerce.boolean().optional().default(false),
});

/**
 * POST /api/public/respond/extension/confirm
 *
 * Confirms an extra-days extension after respond.io has quoted preview output
 * and the customer has clearly accepted the balance.
 */
router.post('/extension/confirm', async (req, res, next) => {
  try {
    const parsed = RespondExtensionConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      sendRespondExtensionJson(res, 'confirm', { ref: null, phone: null }, {
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'lookup/ref/phone and newDropoffDatetime are required.',
      }, 400);
      return;
    }

    const { lookup, ref, phone, newDropoffDatetime, confirmedByCustomer } = parsed.data;
    const params = {
      ref: ref ?? (lookup && /^(LR|BB)[-\s]?\d{4}/i.test(lookup) ? lookup : null),
      phone: phone ?? (lookup && !/^(LR|BB)[-\s]?\d{4}/i.test(lookup) ? lookup : null),
    };

    if (!params.ref && !params.phone) {
      sendRespondExtensionJson(res, 'confirm', params, {
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Provide lookup, ref, or phone.',
      }, 400);
      return;
    }

    if (!confirmedByCustomer) {
      sendRespondExtensionJson(res, 'confirm', params, {
        success: false,
        code: 'CUSTOMER_CONFIRMATION_REQUIRED',
        message: 'Run preview, quote the extension balance, and only call confirm after the customer clearly agrees.',
      });
      return;
    }

    const target = await resolveRespondExtensionTarget(getSupabaseClient(), params);
    if (!target) {
      sendRespondExtensionJson(res, 'confirm', params, {
        success: false,
        code: 'NOT_FOUND',
        message: 'Booking not found. Ask the customer to confirm their booking reference or phone number.',
      });
      return;
    }

    const preview = await previewRespondExtension(req, target, newDropoffDatetime);
    if (!preview.ok) {
      sendRespondExtensionJson(res, 'confirm', params, preview.payload);
      return;
    }

    const deps = req.app.locals.deps;
    const activeOutcome = await resolveExtensionForActive({
      orderReference: target.orderReference,
      trimmedEmail: target.email,
      newDropoffDatetime,
      overrideDailyRate: undefined,
      isPaid: false,
      paymentMethodId: 'pending',
      emailErrorLabel: '[respond-extension-email] Active path error:',
      deps,
    });

    if (activeOutcome.kind === 'error') {
      sendRespondExtensionJson(res, 'confirm', params, {
        success: false,
        code: 'EXTENSION_FAILED',
        message: activeOutcome.reason,
      });
      return;
    }

    if (activeOutcome.kind === 'success') {
      sendRespondExtensionJson(res, 'confirm', params, {
        success: true,
        order_reference: target.orderReference,
        customer_name: target.customerName,
        vehicle: target.vehicle,
        previous_dropoff_datetime: target.currentDropoffDatetime,
        new_dropoff_datetime: activeOutcome.newDropoffDatetime,
        extension_days: activeOutcome.extensionDays,
        extension_cost: activeOutcome.extensionCost,
        payment_status: 'pending',
        payment_url: buildExtensionPaymentUrl(target.orderReference),
        customer_message: `All set - your rental is extended to ${new Date(activeOutcome.newDropoffDatetime).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}. The extension balance is PHP ${activeOutcome.extensionCost.toLocaleString('en-PH')} and has been added to your booking. You can pay on return, or use this page once online extension payments are available: ${buildExtensionPaymentUrl(target.orderReference)}`,
      });
      return;
    }

    const rawOutcome = await resolveExtensionForRaw({
      orderReference: target.orderReference,
      trimmedEmail: target.email,
      newDropoffDatetime,
      overrideDailyRate: undefined,
      isPaid: false,
      paymentMethodId: 'pending',
      emailErrorLabel: '[respond-extension-email] Raw path error:',
      deps,
    });

    if (rawOutcome.kind === 'success') {
      sendRespondExtensionJson(res, 'confirm', params, {
        success: true,
        order_reference: target.orderReference,
        customer_name: target.customerName,
        vehicle: target.vehicle,
        previous_dropoff_datetime: target.currentDropoffDatetime,
        new_dropoff_datetime: rawOutcome.newDropoffDatetime,
        extension_days: rawOutcome.extensionDays,
        extension_cost: rawOutcome.extensionCost,
        payment_status: 'pending',
        payment_url: buildExtensionPaymentUrl(target.orderReference),
        customer_message: `All set - your rental is extended to ${new Date(rawOutcome.newDropoffDatetime).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}. The extension balance is PHP ${rawOutcome.extensionCost.toLocaleString('en-PH')} and has been added to your booking. You can pay on return, or use this page once online extension payments are available: ${buildExtensionPaymentUrl(target.orderReference)}`,
      });
      return;
    }

    sendRespondExtensionJson(res, 'confirm', params, {
      success: false,
      code: rawOutcome.kind === 'error' ? 'EXTENSION_FAILED' : 'NOT_FOUND',
      message: rawOutcome.kind === 'error'
        ? rawOutcome.reason
        : 'Booking was found but could not be extended automatically. Hand off to the team.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/public/respond/booking?ref=LR-XXXX-XXXX
 * GET /api/public/respond/booking?phone=+63912345678
 * GET /api/public/respond/booking?lookup=LR-XXXX-XXXX
 * GET /api/public/respond/booking?lookup=+63912345678
 *
 * Searches orders first (activated/staff-created bookings with full financial
 * data), then falls back to orders_raw for unactivated direct/walk-in bookings.
 * Returns only bookings in returnable statuses. When multiple results match a
 * phone number the most recently created active booking is returned first.
 */
router.get('/booking', async (req, res, next) => {
  try {
    let ref   = typeof req.query.ref   === 'string' ? req.query.ref.trim()   : null;
    let phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : null;
    const lookup = typeof req.query.lookup === 'string' ? req.query.lookup.trim() : null;

    if (!ref && !phone && lookup) {
      if (/^LR[-\s]/i.test(lookup)) {
        ref = lookup;
      } else {
        phone = lookup;
      }
    }

    if (!ref && !phone) {
      res.status(400).json({ error: 'Please provide ref, phone, or lookup query parameter' });
      return;
    }

    const sb = getSupabaseClient();

    // ── Path A: orders table (activated / staff-created bookings) ─────────────

    // 1. Find the order(s).
    // For phone lookups: resolve customer_id first. If no customer record exists
    // in the customers table, skip the orders query entirely and fall through to
    // orders_raw (the booking may exist there before activation).
    let skipOrdersQuery = false;

    let ordersQuery = sb
      .from('orders')
      .select(
        'id, booking_token, status, store_id, customer_id, created_at, balance_due, final_total, security_deposit, deposit_status',
      )
      .in('status', RETURNABLE_STATUSES);

    if (ref) {
      ordersQuery = ordersQuery.ilike('booking_token', ref);
    } else {
      const { data: customerRows, error: customerError } = await sb
        .from('customers')
        .select('id')
        .in('mobile', philippinePhoneVariants(phone!))
        .limit(1);

      if (customerError) {
        console.error('[respond/booking] customers query failed:', customerError);
        throw customerError;
      }

      const customerId = customerRows?.[0]?.id ?? null;
      if (!customerId) {
        skipOrdersQuery = true;
      } else {
        ordersQuery = ordersQuery
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });
      }
    }

    const { data: ordersData, error: ordersError } = skipOrdersQuery
      ? { data: [], error: null }
      : await ordersQuery;

    if (ordersError) {
      console.error('[respond/booking] orders query failed:', ordersError);
      throw ordersError;
    }

    type OrderRow = {
      id:               string;
      booking_token:    string | null;
      status:           string;
      store_id:         string;
      customer_id:      string | null;
      created_at:       string;
      balance_due:      number | string | null;
      final_total:      number | string | null;
      security_deposit: number | string | null;
      deposit_status:   string | null;
    };
    const orderRows = (ordersData ?? []) as OrderRow[];

    if (orderRows.length > 0) {
      const order = orderRows.length === 1
        ? orderRows[0]
        : [...orderRows].sort(
            (a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99),
          )[0];

      // 2. Fetch customer name.
      let customerName: string | null = null;
      if (order.customer_id) {
        const { data: custData, error: custError } = await sb
          .from('customers')
          .select('name')
          .eq('id', order.customer_id)
          .maybeSingle();
        if (custError) {
          console.error('[respond/booking] customer name query failed:', custError);
        } else {
          customerName = custData?.name ?? null;
        }
      }

      // 3. Fetch the first order_item for dates and vehicle name.
      //    vehicle_name is stored as text; vehicle_model_id used as fallback for the name.
      let pickupDatetime:  string | null = null;
      let dropoffDatetime: string | null = null;
      let vehicleName = 'Unknown';

      const { data: itemData, error: itemError } = await sb
        .from('order_items')
        .select('pickup_datetime, dropoff_datetime, vehicle_name, vehicle_model_id')
        .eq('order_id', order.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (itemError) {
        console.error('[respond/booking] order_items query failed:', itemError);
      } else if (itemData) {
        pickupDatetime  = (itemData.pickup_datetime  as string | null) ?? null;
        dropoffDatetime = (itemData.dropoff_datetime as string | null) ?? null;

        if (itemData.vehicle_name) {
          vehicleName = itemData.vehicle_name as string;
        } else if (itemData.vehicle_model_id) {
          vehicleName = await resolveVehicleModelName(sb, itemData.vehicle_model_id as string);
        }
      }

      // 4. Resolve store name.
      const storeName = await resolveStoreName(sb, order.store_id);

      const booking: BookingResponse = {
        reference:        order.booking_token ?? order.id,
        status:           order.status,
        customer_name:    customerName,
        vehicle:          vehicleName,
        pickup_datetime:  pickupDatetime,
        dropoff_datetime: dropoffDatetime,
        store:            storeName,
        balance_due:      order.balance_due      != null ? Number(order.balance_due)      : null,
        final_total:      order.final_total      != null ? Number(order.final_total)      : null,
        security_deposit: order.security_deposit != null ? Number(order.security_deposit) : null,
        deposit_status:   order.deposit_status   ?? null,
      };

      res.json({ found: true, booking });
      return;
    }

    // ── Path B: orders_raw fallback (unactivated direct/walk-in bookings) ─────

    let rawQuery = sb
      .from('orders_raw')
      .select(BOOKING_COLUMNS)
      .in('status', RAW_RETURNABLE_STATUSES);

    if (ref) {
      rawQuery = rawQuery.ilike('order_reference', ref);
    } else {
      rawQuery = rawQuery
        .in('customer_mobile', philippinePhoneVariants(phone!))
        .order('created_at', { ascending: false });
    }

    const { data: rawData, error: rawError } = await rawQuery;

    if (rawError) {
      console.error('[respond/booking] orders_raw query failed:', rawError);
      throw rawError;
    }

    const rawRows = (rawData ?? []) as BookingRow[];

    if (rawRows.length === 0) {
      res.status(404).json({ error: 'No booking found' });
      return;
    }

    const row = rawRows.length === 1
      ? rawRows[0]
      : [...rawRows].sort(
          (a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99),
        )[0];

    const [storeName, vehicleName] = await Promise.all([
      row.store_id         ? resolveStoreName(sb, row.store_id)                : Promise.resolve('Unknown'),
      row.vehicle_model_id ? resolveVehicleModelName(sb, row.vehicle_model_id) : Promise.resolve('Unknown'),
    ]);

    const booking: BookingResponse = {
      reference:        row.order_reference,
      status:           row.status,
      customer_name:    row.customer_name ?? null,
      vehicle:          vehicleName,
      pickup_datetime:  row.pickup_datetime  ?? null,
      dropoff_datetime: row.dropoff_datetime ?? null,
      store:            storeName,
      estimated_total:  row.web_quote_raw != null ? Number(row.web_quote_raw) : null,
    };

    res.json({ found: true, booking });
  } catch (err) {
    console.error('[respond/booking] unhandled error:', err);
    next(err);
  }
});

/**
 * GET /api/public/respond/availability
 *
 * Query params:
 *   pickupDatetime  - exact ISO pickup datetime
 *   dropoffDatetime - exact ISO return datetime
 *   type            - optional: "scooter" | "tuktuk"
 *   quantity        - optional integer, default 1
 *
 * Returns real bookable availability using the same engine as the website.
 * Active holds, unprocessed bookings, walk-ins, and confirmed orders all block stock.
 */
router.get('/availability', async (req, res, next) => {
  try {
    const pickupDatetime = typeof req.query.pickupDatetime === 'string' ? req.query.pickupDatetime.trim() : null;
    const dropoffDatetime = typeof req.query.dropoffDatetime === 'string' ? req.query.dropoffDatetime.trim() : null;
    const typeParam = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : null;
    const quantityRaw = typeof req.query.quantity === 'string' ? req.query.quantity.trim() : null;

    if (!pickupDatetime || !dropoffDatetime) {
      res.status(400).json({
        error: 'Exact pickupDatetime and dropoffDatetime are required before confirming availability.',
      });
      return;
    }

    const pickup = new Date(pickupDatetime);
    const dropoff = new Date(dropoffDatetime);
    if (Number.isNaN(pickup.getTime()) || Number.isNaN(dropoff.getTime())) {
      res.status(400).json({ error: 'pickupDatetime and dropoffDatetime must be valid ISO datetimes.' });
      return;
    }
    if (dropoff <= pickup) {
      res.status(400).json({ error: 'dropoffDatetime must be after pickupDatetime.' });
      return;
    }

    if (typeParam !== null && typeParam !== 'scooter' && typeParam !== 'tuktuk') {
      res.status(400).json({ error: 'type must be "scooter" or "tuktuk"' });
      return;
    }

    const quantity = quantityRaw !== null ? parseInt(quantityRaw, 10) : 1;
    if (isNaN(quantity) || quantity < 1) {
      res.status(400).json({ error: 'quantity must be a positive integer' });
      return;
    }

    const availability = await checkAvailability(
      { bookingPort: req.app.locals.deps.bookingPort },
      { storeId: STORE_ID, pickupDatetime, dropoffDatetime },
    );

    let allowedModelTypes = new Map<string, string | null>();
    if (typeParam) {
      const sb = getSupabaseClient();
      const { data: models, error: modelsError } = await sb
        .from('vehicle_models')
        .select('id, type')
        .eq('is_active', true);

      if (modelsError) {
        console.error('[respond/availability] vehicle_models query failed:', modelsError);
        throw modelsError;
      }

      allowedModelTypes = new Map(
        ((models ?? []) as { id: string; type: string | null }[])
          .filter((m) => m.type === typeParam)
          .map((m) => [m.id, m.type]),
      );
    }

    const filtered = typeParam
      ? availability.filter((entry) => allowedModelTypes.has(entry.modelId))
      : availability;

    const available = filtered
      .sort((a, b) => a.modelName.localeCompare(b.modelName))
      .map((entry) => ({
        model_id:                entry.modelId,
        model:                   entry.modelName,
        available_count:         entry.availableCount,
        sufficient_availability: entry.availableCount >= quantity,
        hold_expires_at:         entry.holdExpiresAt ?? null,
        blocking_window_may_clear_after: entry.nextAvailablePickup ?? null,
        note: entry.availableCount >= quantity
          ? 'This model has enough stock for the exact requested pickup and return datetimes.'
          : 'Do not present blocking_window_may_clear_after as confirmed availability. It only means an overlapping booking or hold may clear after this time; the full requested rental window must be checked again before suggesting it.',
      }));

    const totalAvailable = available.reduce((sum, e) => sum + e.available_count, 0);
    const hasAvailability = available.some((e) => e.sufficient_availability);

    res.json({
      pickup_datetime:    pickupDatetime,
      dropoff_datetime:   dropoffDatetime,
      requested_quantity: quantity,
      available,
      total_available:    totalAvailable,
      has_availability:   hasAvailability,
      guidance:           'Only models with sufficient_availability=true are available for the exact requested pickup and return datetimes. Do not suggest alternative pickup dates/times from blocking_window_may_clear_after unless you run a new availability check for the full requested rental window.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/public/respond/delivery-fee?area=General+Luna
 *
 * Returns the delivery fee for a named location.
 * Matches case-insensitively against the locations table used by the booking system.
 */
router.get('/delivery-fee', async (req, res, next) => {
  try {
    const area = typeof req.query.area === 'string' ? req.query.area.trim() : null;

    if (!area) {
      res.status(400).json({ error: 'area query parameter is required' });
      return;
    }

    const sb = getSupabaseClient();

    const { data, error } = await sb
      .from('locations')
      .select('name, delivery_cost, location_type')
      .eq('is_active', true)
      .or(`store_id.eq.${STORE_ID},store_id.is.null`)
      .ilike('name', area)
      .maybeSingle();

    if (error) {
      console.error('[respond/delivery-fee] locations query failed:', error);
      throw error;
    }

    if (!data) {
      res.json({ area, fee: null, available: false });
      return;
    }

    res.json({
      area:      data.name as string,
      fee:       Number(data.delivery_cost),
      available: true,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
