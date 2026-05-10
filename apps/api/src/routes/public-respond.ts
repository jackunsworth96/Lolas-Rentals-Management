import { Router } from 'express';
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

/**
 * GET /api/public/respond/booking?ref=LR-XXXX-XXXX
 * GET /api/public/respond/booking?phone=+63912345678
 *
 * Looks up a booking in orders_raw by booking reference or customer phone.
 * Returns only active, confirmed, or completed bookings (not cancelled).
 * When multiple results match a phone number the most recently created
 * active booking is returned first.
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

    // ── Step 1: fetch booking row ─────────────────────────────────────────────

    let bookingQuery = sb
      .from('orders_raw')
      .select(BOOKING_COLUMNS)
      .in('status', RETURNABLE_STATUSES);

    if (ref) {
      bookingQuery = bookingQuery.ilike('order_reference', ref);
    } else {
      bookingQuery = bookingQuery
        .eq('customer_mobile', phone!)
        .order('created_at', { ascending: false });
    }

    const { data: bookingData, error: bookingError } = await bookingQuery;

    if (bookingError) {
      console.error('[respond/booking] orders_raw query failed:', bookingError);
      throw bookingError;
    }

    const rows = (bookingData ?? []) as BookingRow[];

    if (rows.length === 0) {
      res.status(404).json({ error: 'No booking found' });
      return;
    }

    // When multiple rows (phone search), prioritise active → confirmed → completed.
    const STATUS_PRIORITY: Record<string, number> = { active: 0, confirmed: 1, completed: 2 };
    const row = rows.length === 1
      ? rows[0]
      : [...rows].sort(
          (a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99),
        )[0];

    // ── Step 2: resolve store name (graceful fallback) ───────────────────────

    let storeName = 'Unknown';
    if (row.store_id) {
      const { data: storeData, error: storeError } = await sb
        .from('stores')
        .select('name')
        .eq('id', row.store_id)
        .maybeSingle();
      if (storeError) {
        console.error('[respond/booking] stores query failed:', storeError);
      } else {
        storeName = storeData?.name ?? 'Unknown';
      }
    }

    // ── Step 3: resolve vehicle model name (graceful fallback) ───────────────

    let vehicleName = 'Unknown';
    if (row.vehicle_model_id) {
      const { data: modelData, error: modelError } = await sb
        .from('vehicle_models')
        .select('name')
        .eq('id', row.vehicle_model_id)
        .maybeSingle();
      if (modelError) {
        console.error('[respond/booking] vehicle_models query failed:', modelError);
      } else {
        vehicleName = modelData?.name ?? 'Unknown';
      }
    }

    res.json({
      found: true,
      booking: {
        reference:        row.order_reference,
        status:           row.status,
        customer_name:    row.customer_name   ?? null,
        vehicle:          vehicleName,
        pickup_datetime:  row.pickup_datetime  ?? null,
        dropoff_datetime: row.dropoff_datetime ?? null,
        store:            storeName,
      },
    });
  } catch (err) {
    console.error('[respond/booking] unhandled error:', err);
    next(err);
  }
});

export default router;
