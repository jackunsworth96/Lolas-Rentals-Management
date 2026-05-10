import { Router } from 'express';
import * as chrono from 'chrono-node';
import { getSupabaseClient } from '../adapters/supabase/client.js';

/**
 * Routes consumed by respond.io (or any authenticated third-party caller).
 * All routes in this file are mounted behind the authenticateApiKey middleware
 * in server.ts, so no individual route needs its own auth check.
 */

const STORE_ID = 'store-lolas';

/**
 * Hardcoded until a callout_charges config table is added.
 * minimum: fixed call-out fee (PHP); per_km: incremental rate (PHP).
 */
const CALLOUT_CHARGE = { minimum: 200, per_km: 20 } as const;

/** 5-minute in-memory cache — same TTL used by chat.ts for live pricing. */
let fleetCache: { data: FleetPayload; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Response shape ────────────────────────────────────────────────────────────

interface PricingBrackets {
  '1_2_days': number | null;
  '3_6_days': number | null;
  '7_plus_days': number | null;
}

interface VehicleEntry {
  model: string;
  type: string | null;
  cc: number | null;
  max_pax: number | null;
  pricing: PricingBrackets;
  deposit: number;
  peace_of_mind_per_day: number | null;
  available_count: number;
}

interface AddonEntry {
  name: string;
  price: number;
  price_type: 'per_day' | 'one_time';
}

interface FleetPayload {
  vehicles: VehicleEntry[];
  addons: AddonEntry[];
  callout_charge: typeof CALLOUT_CHARGE;
}

// ── Booking lookup ────────────────────────────────────────────────────────────

interface BookingRow {
  order_reference: string;
  status: string;
  customer_name: string | null;
  vehicle_model_id: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  store_id: string;
}

const BOOKING_COLUMNS =
  'order_reference, status, customer_name, vehicle_model_id, pickup_datetime, dropoff_datetime, store_id';

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

interface FleetRow {
  model_id: string | null;
  status: string;
}

interface AddonRow {
  name: string;
  addon_type: 'per_day' | 'one_time';
  price_per_day: number;
  price_one_time: number;
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

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/public/respond/fleet
 *
 * Returns live vehicle models with pricing brackets, availability counts,
 * active add-ons, and callout charge config.
 */
router.get('/fleet', async (_req, res, next) => {
  try {
    const now = Date.now();

    if (fleetCache && now - fleetCache.fetchedAt < CACHE_TTL_MS) {
      res.json(fleetCache.data);
      return;
    }

    const sb = getSupabaseClient();

    const [pricingResult, fleetResult, addonsResult] = await Promise.all([
      sb
        .from('vehicle_model_pricing')
        .select('model_id, daily_rate, min_days, max_days, vehicle_models!inner(id, name, security_deposit, type, cc, max_pax)')
        .eq('store_id', STORE_ID)
        .order('min_days'),

      sb
        .from('fleet')
        .select('model_id, status')
        .eq('store_id', STORE_ID),

      sb
        .from('addons')
        .select('name, addon_type, price_per_day, price_one_time')
        .eq('is_active', true)
        .or(`store_id.eq.${STORE_ID},store_id.is.null`)
        .order('name'),
    ]);

    if (pricingResult.error) throw pricingResult.error;
    if (fleetResult.error)   throw fleetResult.error;
    if (addonsResult.error)  throw addonsResult.error;

    const pricingRows  = (pricingResult.data ?? []) as unknown as PricingRow[];
    const fleetRows    = (fleetResult.data   ?? []) as FleetRow[];
    const addonRows    = (addonsResult.data  ?? []) as AddonRow[];

    // ── Available-count per model ─────────────────────────────────────────────

    const availableByModel = new Map<string, number>();
    for (const row of fleetRows) {
      if (!row.model_id || row.status !== 'Available') continue;
      availableByModel.set(row.model_id, (availableByModel.get(row.model_id) ?? 0) + 1);
    }

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
        model:                 entry.name,
        type:                  entry.type,
        cc:                    entry.cc,
        max_pax:               entry.max_pax,
        pricing:               mapToPricingBrackets(entry.brackets),
        deposit:               entry.security_deposit,
        peace_of_mind_per_day: entry.peace_of_mind_per_day,
        available_count:       availableByModel.get(modelId) ?? 0,
      });
    }

    // Sort alphabetically so the response is deterministic.
    vehicles.sort((a, b) => a.model.localeCompare(b.model));

    // ── Build addon entries ───────────────────────────────────────────────────

    // Exclude the peace-of-mind addon — it is already surfaced per vehicle above.
    const addons: AddonEntry[] = addonRows
      .filter((a) => !a.name.toLowerCase().includes('peace'))
      .map((a) => ({
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

// ── Shared booking response builder ──────────────────────────────────────────

interface BookingResponse {
  reference:        string;
  status:           string;
  customer_name:    string | null;
  vehicle:          string;
  pickup_datetime:  string | null;
  dropoff_datetime: string | null;
  store:            string;
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
 * GET /api/public/respond/booking?ref=LR-XXXX-XXXX
 * GET /api/public/respond/booking?phone=+63912345678
 *
 * Searches orders_raw first (web/walk-in bookings), then falls back to the
 * orders table (staff-created bookings). Returns only active, confirmed, or
 * completed bookings. When multiple results match a phone number the most
 * recently created active booking is returned first.
 */
router.get('/booking', async (req, res, next) => {
  try {
    const ref   = typeof req.query.ref   === 'string' ? req.query.ref.trim()   : null;
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : null;

    if (!ref && !phone) {
      res.status(400).json({ error: 'Please provide ref or phone query parameter' });
      return;
    }

    const sb = getSupabaseClient();

    // ── Path A: orders_raw ────────────────────────────────────────────────────

    let rawQuery = sb
      .from('orders_raw')
      .select(BOOKING_COLUMNS)
      .in('status', RETURNABLE_STATUSES);

    if (ref) {
      rawQuery = rawQuery.ilike('order_reference', ref);
    } else {
      rawQuery = rawQuery
        .eq('customer_mobile', phone!)
        .order('created_at', { ascending: false });
    }

    const { data: rawData, error: rawError } = await rawQuery;

    if (rawError) {
      console.error('[respond/booking] orders_raw query failed:', rawError);
      throw rawError;
    }

    const rawRows = (rawData ?? []) as BookingRow[];

    if (rawRows.length > 0) {
      const row = rawRows.length === 1
        ? rawRows[0]
        : [...rawRows].sort(
            (a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99),
          )[0];

      const [storeName, vehicleName] = await Promise.all([
        row.store_id        ? resolveStoreName(sb, row.store_id)               : Promise.resolve('Unknown'),
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
      };

      res.json({ found: true, booking });
      return;
    }

    // ── Path B: orders table (staff-created bookings) ─────────────────────────

    // 1. Find the order(s).
    let ordersQuery = sb
      .from('orders')
      .select('id, booking_token, status, store_id, customer_id, created_at')
      .in('status', RETURNABLE_STATUSES);

    if (ref) {
      ordersQuery = ordersQuery.ilike('booking_token', ref);
    } else {
      // Look up customer_id by phone first, then find their orders.
      const { data: customerData, error: customerError } = await sb
        .from('customers')
        .select('id')
        .eq('mobile', phone!)
        .maybeSingle();

      if (customerError) {
        console.error('[respond/booking] customers query failed:', customerError);
        throw customerError;
      }

      if (!customerData) {
        res.status(404).json({ error: 'No booking found' });
        return;
      }

      ordersQuery = ordersQuery
        .eq('customer_id', customerData.id)
        .order('created_at', { ascending: false });
    }

    const { data: ordersData, error: ordersError } = await ordersQuery;

    if (ordersError) {
      console.error('[respond/booking] orders query failed:', ordersError);
      throw ordersError;
    }

    type OrderRow = { id: string; booking_token: string | null; status: string; store_id: string; customer_id: string | null; created_at: string };
    const orderRows = (ordersData ?? []) as OrderRow[];

    if (orderRows.length === 0) {
      res.status(404).json({ error: 'No booking found' });
      return;
    }

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
 *   date      - ISO date YYYY-MM-DD (mutually exclusive with query)
 *   query     - natural language date string e.g. "Friday", "May 15", "next week"
 *   type      - optional: "scooter" | "tuktuk"
 *   quantity  - optional integer, default 1
 *
 * Returns available fleet counts grouped by vehicle model.
 * Availability is based on fleet.status = 'Available' only.
 * A future update will cross-reference active orders for the requested date.
 */
router.get('/availability', async (req, res, next) => {
  try {
    const rawDate     = typeof req.query.date     === 'string' ? req.query.date.trim()             : null;
    const queryParam  = typeof req.query.query    === 'string' ? req.query.query.trim()            : null;
    const typeParam   = typeof req.query.type     === 'string' ? req.query.type.trim().toLowerCase() : null;
    const quantityRaw = typeof req.query.quantity === 'string' ? req.query.quantity.trim()         : null;

    // ── Resolve date string ───────────────────────────────────────────────────

    let dateString: string;

    if (rawDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
        return;
      }
      dateString = rawDate;
    } else if (queryParam) {
      // Parse natural language date relative to now, preferring future dates.
      // Use 'Asia/Manila' locale string for the formatted output so day boundaries
      // are correct regardless of the server's local timezone.
      const parsed = chrono.parseDate(queryParam, new Date(), { forwardDate: true });
      if (!parsed) {
        res.status(400).json({
          error: "I couldn't understand those dates. Could you try sharing them like this: 10 May or Friday 16 May?",
        });
        return;
      }
      dateString = parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // yields YYYY-MM-DD
    } else {
      res.status(400).json({ error: 'Provide either a date (YYYY-MM-DD) or a query parameter' });
      return;
    }

    // ── Validate optional params ──────────────────────────────────────────────

    if (typeParam !== null && typeParam !== 'scooter' && typeParam !== 'tuktuk') {
      res.status(400).json({ error: 'type must be "scooter" or "tuktuk"' });
      return;
    }

    const quantity = quantityRaw !== null ? parseInt(quantityRaw, 10) : 1;
    if (isNaN(quantity) || quantity < 1) {
      res.status(400).json({ error: 'quantity must be a positive integer' });
      return;
    }

    // ── Fleet query ───────────────────────────────────────────────────────────

    const sb = getSupabaseClient();

    let fleetQuery = sb
      .from('fleet')
      .select('model_id, vehicle_models!inner(name, type)')
      .eq('store_id', STORE_ID)
      .eq('status', 'Available');

    if (typeParam) {
      fleetQuery = fleetQuery.eq('vehicle_models.type', typeParam);
    }

    const { data: fleetData, error: fleetError } = await fleetQuery;

    if (fleetError) {
      console.error('[respond/availability] fleet query failed:', fleetError);
      throw fleetError;
    }

    type FleetAvailRow = {
      model_id: string;
      vehicle_models: { name: string; type: string | null } | { name: string; type: string | null }[];
    };

    const rows = (fleetData ?? []) as FleetAvailRow[];

    // ── Group by model ────────────────────────────────────────────────────────

    const byModel = new Map<string, { model: string; type: string | null; count: number }>();

    for (const row of rows) {
      const vm = Array.isArray(row.vehicle_models) ? row.vehicle_models[0] : row.vehicle_models;
      if (!vm) continue;

      if (!byModel.has(row.model_id)) {
        byModel.set(row.model_id, { model: vm.name, type: vm.type ?? null, count: 0 });
      }
      byModel.get(row.model_id)!.count += 1;
    }

    const available = [...byModel.values()]
      .sort((a, b) => a.model.localeCompare(b.model))
      .map((entry) => ({
        model:                   entry.model,
        type:                    entry.type,
        available_count:         entry.count,
        sufficient_availability: entry.count >= quantity,
      }));

    const totalAvailable = available.reduce((sum, e) => sum + e.available_count, 0);
    const hasAvailability = available.some((e) => e.sufficient_availability);

    res.json({
      date:               dateString,
      requested_quantity: quantity,
      available,
      total_available:    totalAvailable,
      has_availability:   hasAvailability,
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
