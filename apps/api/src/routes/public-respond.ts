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

    // ── Peace-of-mind rate ────────────────────────────────────────────────────

    const pomAddon = addonRows.find((a) =>
      a.name.toLowerCase().includes('peace'),
    );
    const peacePricePerDay = pomAddon ? Number(pomAddon.price_per_day) : null;

    // ── Group pricing brackets by model ──────────────────────────────────────

    const byModel = new Map<
      string,
      {
        name:             string;
        type:             string | null;
        cc:               number | null;
        max_pax:          number | null;
        security_deposit: number;
        brackets:         Array<{ min_days: number; daily_rate: number }>;
      }
    >();

    for (const row of pricingRows) {
      const model = row.vehicle_models;
      if (!byModel.has(row.model_id)) {
        byModel.set(row.model_id, {
          name:             model.name,
          type:             model.type ?? null,
          cc:               model.cc != null ? Number(model.cc) : null,
          max_pax:          model.max_pax != null ? Number(model.max_pax) : null,
          security_deposit: Number(model.security_deposit ?? 0),
          brackets:         [],
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
        peace_of_mind_per_day: peacePricePerDay,
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

export default router;
