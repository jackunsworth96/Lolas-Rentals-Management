import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DAY_MS, HANDOVER_MS, effectiveBlocks, heldForUnassigned, searchRacks, searchUnits, vehicleTimeline,
  type FinderVehicle, type VehicleState,
} from '../../lib/availability-finder.js';
import {
  assignProtectionLabels, bookableUnits, manilaDate, manilaMidnight, partnerAllowances, type PartnerAllowance,
} from '../../lib/partner-protection.js';
import { peakRackUsage } from '../../lib/rack-usage.js';
import { loadAvailabilityInputs } from './availability-inputs.js';
import { loadProtectionData } from './protection-inputs.js';
import { getSurfRackAddonIds, loadRackUsageIntervals } from '../surf-racks/get-surf-rack-availability.js';

export const SURF_RACK_PRODUCT = 'surf-rack';
const HORIZON_DAYS = 60;

export interface FinderQuery {
  storeId: string;
  fromMs: number;
  days: number;
  quantity: number;
  /** A vehicle model id, SURF_RACK_PRODUCT, or null for the boards only. */
  product: string | null;
  /** Booking for this partner: their protected units count as available. */
  partnerId: string | null;
  includeRacks?: boolean;
}

export interface FinderVehicleRow {
  vehicleId: string;
  vehicleName: string;
  surfRack: boolean;
  state: VehicleState;
  reference: string | null;
  customerName: string | null;
  orderId: string | null;
  rawOrderId: string | null;
  /** When the current booking is due back (without handover). */
  returnAt: string | null;
  nextFreeAt: string | null;
  freeUntil: string | null;
  heldForBooking: boolean;
  protectedFor: { partnerId: string | null; partnerName: string | null } | null;
}

export interface FinderProduct {
  modelId: string;
  modelName: string;
  vehicleType: string | null;
  hiddenFromWebsite: boolean;
  totalUnits: number;
  freeNow: number;
  protectedNow: number;
  heldNow: number;
  backToday: number;
  vehicles: FinderVehicleRow[];
  unassignedBookings: Array<{ reference: string | null; customerName: string | null; rawOrderId: string | null; pickupAt: string; dropoffAt: string }>;
  basketHolds: number;
}

export interface FinderResult {
  from: string;
  days: number;
  horizonEnd: string;
  allocationsEnabled: boolean;
  partners: Array<{ partnerId: string; partnerName: string; vehicleType: string; allowance: number; inUse: number; unused: number }>;
  products: FinderProduct[];
  notRentable: Array<{ vehicleId: string; vehicleName: string; reason: string; detail: string | null }>;
  search: null | {
    product: string;
    productName: string;
    quantity: number;
    days: number;
    partnerId: string | null;
    answers: Array<{ unit: number; startsAt: string; readyNow: boolean; vehicleId: string | null; vehicleName: string | null; freeUntil: string | null }>;
    allTogetherAt: string | null;
    /** Free bikes the allocation rules keep back from this booking. */
    protectedBy: Array<{ partnerId: string; partnerName: string }>;
  };
  surfRacks: null | {
    tracked: boolean;
    total: number;
    inUseNow: number;
    freeNow: number;
    rackBikesFreeNow: number;
    nextFreeAt: string | null;
  };
}

const iso = (t: number | null | undefined) => (t == null || !Number.isFinite(t) ? null : new Date(t).toISOString());

export async function findAvailability(sb: SupabaseClient, q: FinderQuery): Promise<FinderResult> {
  const lengthMs = Math.max(1, q.days) * DAY_MS;
  const horizonMs = HORIZON_DAYS * DAY_MS;
  const fromMs = q.fromMs;
  const loadUntil = fromMs + horizonMs + lengthMs + HANDOVER_MS;
  const [inputs, protection] = await Promise.all([
    loadAvailabilityInputs(sb, q.storeId, fromMs, loadUntil),
    loadProtectionData(sb, q.storeId, fromMs, loadUntil),
  ]);
  const blocksOf = (id: string) => effectiveBlocks(inputs.blocks.get(id) ?? [], fromMs);
  const boardRequest = { start: fromMs, end: fromMs + lengthMs + HANDOVER_MS };

  type Working = { row: FinderVehicleRow; freeUntilMs: number | null; vehicleType: string | null };
  const working = new Map<string, Working[]>();
  const vehiclesByModel = new Map<string, FinderVehicle[]>();
  for (const v of inputs.vehicles) {
    const list = vehiclesByModel.get(v.modelId!) ?? [];
    list.push(v);
    vehiclesByModel.set(v.modelId!, list);
  }

  for (const [modelId, vehicles] of vehiclesByModel) {
    const floating = inputs.floating.get(modelId) ?? [];
    const held = heldForUnassigned(vehicles.map((v) => v.id), blocksOf, floating, boardRequest);
    const vehicleType = protection.typeOfModel.get(modelId) ?? null;
    working.set(modelId, vehicles.map((v) => {
      const t = vehicleTimeline(blocksOf(v.id), fromMs);
      const booked = t.current
        ? (inputs.blocks.get(v.id) ?? []).find((b) => b.start === t.current!.start && b.kind === t.current!.kind)
        : undefined;
      const returnAt = booked && Number.isFinite(booked.end) ? booked.end - HANDOVER_MS : null;
      return {
        vehicleType,
        freeUntilMs: t.freeUntil,
        row: {
          vehicleId: v.id,
          vehicleName: v.name,
          surfRack: v.surfRack,
          state: t.state,
          reference: t.current?.reference ?? null,
          customerName: t.current?.customerName ?? null,
          orderId: t.current?.orderId ?? null,
          rawOrderId: t.current?.rawOrderId ?? null,
          returnAt: iso(returnAt),
          nextFreeAt: iso(t.nextFreeAt),
          freeUntil: iso(t.freeUntil),
          heldForBooking: t.state === 'free' && held.has(v.id),
          protectedFor: null,
        },
      };
    }));
  }

  // Float the "Protected for <partner>" label onto the free bikes least likely to be needed.
  const allowancesByType = new Map<string, PartnerAllowance[]>();
  const labelled = new Map<string, { partnerId: string | null; partnerName: string | null }>();
  for (const vehicleType of new Set(protection.units.map((u) => u.vehicleType))) {
    const allowances = partnerAllowances(protection, vehicleType, fromMs);
    allowancesByType.set(vehicleType, allowances);
    const free = [...working.values()].flat()
      .filter((w) => w.vehicleType === vehicleType && w.row.state === 'free' && !w.row.heldForBooking)
      .sort((a, b) => (b.freeUntilMs ?? Number.POSITIVE_INFINITY) - (a.freeUntilMs ?? Number.POSITIVE_INFINITY)
        || a.row.vehicleName.localeCompare(b.row.vehicleName))
      .map((w) => ({ id: w.row.vehicleId }));
    for (const [id, label] of assignProtectionLabels(free, allowances)) labelled.set(id, label);
  }

  const today = manilaDate(fromMs);
  const products: FinderProduct[] = [];
  for (const [modelId, rows] of working) {
    const model = inputs.models.get(modelId)!;
    for (const w of rows) w.row.protectedFor = labelled.get(w.row.vehicleId) ?? null;
    const sorted = rows.map((w) => w.row).sort((a, b) =>
      (a.nextFreeAt ? Date.parse(a.nextFreeAt) : Number.POSITIVE_INFINITY) - (b.nextFreeAt ? Date.parse(b.nextFreeAt) : Number.POSITIVE_INFINITY)
      || Number(!!a.protectedFor || a.heldForBooking) - Number(!!b.protectedFor || b.heldForBooking)
      || a.vehicleName.localeCompare(b.vehicleName));
    const floating = inputs.floating.get(modelId) ?? [];
    products.push({
      modelId,
      modelName: model.name,
      vehicleType: rows[0]?.vehicleType ?? null,
      hiddenFromWebsite: !model.showOnWebsite,
      totalUnits: rows.length,
      freeNow: sorted.filter((r) => r.state === 'free' && !r.heldForBooking && !r.protectedFor).length,
      protectedNow: sorted.filter((r) => r.protectedFor).length,
      heldNow: sorted.filter((r) => r.heldForBooking).length,
      backToday: sorted.filter((r) => r.state !== 'free' && r.nextFreeAt && manilaDate(Date.parse(r.nextFreeAt)) === today).length,
      vehicles: sorted,
      unassignedBookings: floating
        .filter((f) => !f.hold && f.end > fromMs && f.start < fromMs + 14 * DAY_MS)
        .sort((a, b) => a.start - b.start)
        .map((f) => ({ reference: f.reference, customerName: f.customerName, rawOrderId: f.rawOrderId, pickupAt: iso(f.start)!, dropoffAt: iso(f.end - HANDOVER_MS)! })),
      basketHolds: floating.filter((f) => f.hold && f.end > fromMs).length,
    });
  }
  products.sort((a, b) => Number(a.hiddenFromWebsite) - Number(b.hiddenFromWebsite) || b.totalUnits - a.totalUnits || a.modelName.localeCompare(b.modelName));

  const partners = [...allowancesByType].flatMap(([vehicleType, list]) => list.map((a) => ({ ...a, vehicleType })));

  let search: FinderResult['search'] = null;
  let surfRacks: FinderResult['surfRacks'] = null;
  const needRacks = q.includeRacks || q.product === SURF_RACK_PRODUCT;
  let rackSearch: ((quantity: number) => Array<{ unit: number; startsAt: number }>) | null = null;

  if (needRacks) {
    const [storeRes, rackAddonIds] = await Promise.all([
      sb.from('stores').select('surf_rack_count').eq('id', q.storeId).maybeSingle(),
      getSurfRackAddonIds(sb, q.storeId),
    ]);
    if (storeRes.error) throw new Error(`Failed to load store rack count: ${storeRes.error.message}`);
    const total = Number((storeRes.data as { surf_rack_count?: number } | null)?.surf_rack_count ?? 0);
    const rackBikes = inputs.vehicles.filter((v) => v.surfRack);
    const rackBikesFree = (start: number, end: number) =>
      rackBikes.filter((v) => !blocksOf(v.id).some((b) => b.start < end && start < b.end)).length;
    if (total <= 0) {
      surfRacks = { tracked: false, total: 0, inUseNow: 0, freeNow: 0, rackBikesFreeNow: rackBikesFree(fromMs, fromMs + HANDOVER_MS), nextFreeAt: null };
    } else {
      const intervals = await loadRackUsageIntervals(sb, q.storeId, iso(fromMs)!, iso(loadUntil)!, rackAddonIds);
      const extra = rackBikes.flatMap((v) => blocksOf(v.id).map((b) => b.end));
      rackSearch = (quantity) => searchRacks({ intervals, total, fromMs, lengthMs, quantity, horizonMs, rackBikesFree, extraCandidates: extra });
      const inUseNow = peakRackUsage(intervals, fromMs, fromMs + 1);
      const first = rackSearch(1)[0];
      surfRacks = {
        tracked: true, total, inUseNow,
        freeNow: Math.max(0, total - inUseNow),
        rackBikesFreeNow: rackBikesFree(fromMs, fromMs + HANDOVER_MS),
        nextFreeAt: iso(first?.startsAt),
      };
    }
  }

  if (q.product === SURF_RACK_PRODUCT) {
    const answers = rackSearch ? rackSearch(q.quantity) : [];
    search = {
      product: SURF_RACK_PRODUCT, productName: 'Surf rack', quantity: q.quantity, days: q.days, partnerId: q.partnerId,
      answers: answers.map((a) => ({ unit: a.unit, startsAt: iso(a.startsAt)!, readyNow: a.startsAt <= fromMs, vehicleId: null, vehicleName: null, freeUntil: null })),
      allTogetherAt: answers.length >= q.quantity ? iso(answers[q.quantity - 1].startsAt) : null,
      protectedBy: [],
    };
  } else if (q.product && vehiclesByModel.has(q.product)) {
    const modelId = q.product;
    const vehicles = vehiclesByModel.get(modelId)!;
    const vehicleType = protection.typeOfModel.get(modelId) ?? null;
    const typeCommitments = protection.commitments.filter((c) => c.vehicleType === vehicleType);
    const extra = [
      ...typeCommitments.map((c) => c.end),
      ...protection.unavailable.map((u) => u.end),
      ...protection.overrides.filter((o) => o.vehicleType === vehicleType).map((o) => manilaMidnight(o.endsBefore)),
    ];
    for (let day = 0; day <= HORIZON_DAYS + 31; day++) {
      const date = manilaDate(fromMs + day * DAY_MS);
      if (date.endsWith('-01')) extra.push(manilaMidnight(date));
    }
    const avoid = new Set(vehicles.filter((v) => {
      const label = labelled.get(v.id);
      return label && label.partnerId !== q.partnerId;
    }).map((v) => v.id));
    const answers = searchUnits({
      vehicles, blocks: inputs.blocks, floating: inputs.floating.get(modelId) ?? [],
      fromMs, lengthMs, quantity: q.quantity, horizonMs, extraCandidates: extra, avoid,
      capacity: (start, end) => bookableUnits(protection, vehicleType, q.partnerId, start, end),
    });
    const protectedBy = vehicleType
      ? (allowancesByType.get(vehicleType) ?? []).filter((a) => a.unused > 0 && a.partnerId !== q.partnerId)
        .map((a) => ({ partnerId: a.partnerId, partnerName: a.partnerName }))
      : [];
    search = {
      product: modelId,
      productName: inputs.models.get(modelId)!.name,
      quantity: q.quantity, days: q.days, partnerId: q.partnerId,
      answers: answers.map((a) => ({
        unit: a.unit, startsAt: iso(a.startsAt)!, readyNow: a.startsAt <= fromMs,
        vehicleId: a.vehicleId, vehicleName: a.vehicleName, freeUntil: iso(a.freeUntil),
      })),
      allTogetherAt: answers.length >= q.quantity ? iso(answers[q.quantity - 1].startsAt) : null,
      protectedBy,
    };
  }

  return {
    from: iso(fromMs)!,
    days: q.days,
    horizonEnd: iso(fromMs + horizonMs)!,
    allocationsEnabled: protection.enabled,
    partners,
    products,
    notRentable: inputs.notRentable.map((n) => ({ vehicleId: n.vehicle.id, vehicleName: n.vehicle.name, reason: n.reason, detail: n.detail })),
    search,
    surfRacks,
  };
}

/** Bikes currently carrying a partner-protection label, for the Fleet page. */
export async function currentPartnerProtection(sb: SupabaseClient, storeId: string) {
  const { data: settings, error } = await sb.from('partner_allocation_settings').select('enabled').eq('store_id', storeId).maybeSingle();
  if (error) throw new Error(`allocation settings query failed: ${error.message}`);
  if (!settings?.enabled) return { storeId, enabled: false, partners: [], protectedVehicles: [] };
  const result = await findAvailability(sb, { storeId, fromMs: Date.now(), days: 1, quantity: 1, product: null, partnerId: null });
  return {
    storeId,
    enabled: result.allocationsEnabled,
    partners: result.partners,
    protectedVehicles: result.products.flatMap((p) => p.vehicles
      .filter((v) => v.protectedFor)
      .map((v) => ({ vehicleId: v.vehicleId, vehicleName: v.vehicleName, modelName: p.modelName, ...v.protectedFor! }))),
  };
}
