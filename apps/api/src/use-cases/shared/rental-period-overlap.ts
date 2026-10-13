/**
 * Shared helpers for prorating a rental booking's days/revenue to the portion
 * that overlaps an arbitrary [periodStartMs, periodEndMs) window. Used by both
 * fleet utilization (grouped by vehicle) and partner utilization (grouped by
 * referring partner) so the two reports agree on how a booking that spans a
 * period boundary is counted.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrderItemForOverlap {
  rental_days_count: number | null;
  rental_rate: number | null;
  pickup_fee: number | null;
  dropoff_fee: number | null;
  discount: number | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
}

export interface OverlapResult {
  /** Days of this booking that fall within [periodStartMs, periodEndMs), capped at the booking's total length. */
  overlapDays: number;
  /** Total days committed across the whole booking (not just this period). */
  totalBookingDays: number;
  /** Rate revenue + in-period pickup/dropoff fees - prorated discount, excluding add-ons. */
  revenue: number;
}

/**
 * Computes the in-period overlap for a single order_item, or null if the
 * booking doesn't actually overlap the period (or has invalid/missing dates).
 *
 * rental_days_count/rental_rate/discount describe the WHOLE booking, so a
 * booking spanning the period boundary only contributes its in-period share
 * of days, rate revenue, and discount. pickup_fee/dropoff_fee are one-off
 * charges attributed to whichever period the pickup/dropoff actually falls in.
 */
export function computeOrderItemOverlap(
  item: OrderItemForOverlap,
  periodStartMs: number,
  periodEndMs: number,
): OverlapResult | null {
  if (!item.pickup_datetime || !item.dropoff_datetime) return null;
  const pickupMs = new Date(item.pickup_datetime).getTime();
  const dropoffMs = new Date(item.dropoff_datetime).getTime();
  if (Number.isNaN(pickupMs) || Number.isNaN(dropoffMs) || dropoffMs <= pickupMs) return null;

  const overlapStart = Math.max(pickupMs, periodStartMs);
  const overlapEnd = Math.min(dropoffMs, periodEndMs);
  if (overlapEnd <= overlapStart) return null; // no actual overlap with this period

  const totalBookingDays = Number(item.rental_days_count ?? 0);
  const overlapDays = totalBookingDays > 0
    ? Math.min(totalBookingDays, Math.ceil((overlapEnd - overlapStart) / DAY_MS))
    : 0;
  if (overlapDays <= 0) return null;

  const dayRatio = totalBookingDays > 0 ? overlapDays / totalBookingDays : 0;
  const rateRevenue = Number(item.rental_rate ?? 0) * overlapDays;
  const proratedDiscount = Number(item.discount ?? 0) * dayRatio;
  const pickupFee = pickupMs >= periodStartMs && pickupMs < periodEndMs ? Number(item.pickup_fee ?? 0) : 0;
  const dropoffFee = dropoffMs >= periodStartMs && dropoffMs < periodEndMs ? Number(item.dropoff_fee ?? 0) : 0;
  const revenue = rateRevenue + pickupFee + dropoffFee - proratedDiscount;

  return { overlapDays, totalBookingDays, revenue };
}

export interface AddonRow {
  order_id: string;
  addon_type: 'per_day' | 'one_time';
  total_amount: number | null;
  added_at: string | null;
}

export interface AddonAttributionTarget {
  overlapDays: number;
  totalBookingDays: number;
}

/**
 * Attributes order_addons revenue across the in-period contributing items of
 * their order. order_addons is linked to order_id only — the schema has an
 * order_item_id column, but the application never populates it (see
 * modify-addons.ts) — so there's no reliable per-vehicle/per-item link for
 * multi-item orders. We attribute each addon across the order's in-period
 * contributing items, weighted by each item's share of the order's total
 * booking days. For the common single-item-order case this is exact; for
 * multi-item orders it's a proportional approximation.
 *
 * `itemsByOrder` should contain only items that actually overlapped the
 * period (i.e. already passed computeOrderItemOverlap). `addRevenue` is
 * called once per (addon, contributing item) pair with the amount to add.
 */
export function attributeAddonRevenue<T extends AddonAttributionTarget>(
  addons: AddonRow[],
  itemsByOrder: Record<string, T[]>,
  periodStartMs: number,
  periodEndMs: number,
  addRevenue: (item: T, amount: number) => void,
): void {
  for (const addon of addons) {
    const items = itemsByOrder[addon.order_id];
    if (!items || items.length === 0) continue;
    const totalAmount = Number(addon.total_amount ?? 0);
    if (totalAmount === 0) continue;

    if (addon.addon_type === 'one_time') {
      // One-off charge — attribute it to whichever period it was actually added in.
      const addedAtMs = addon.added_at ? new Date(addon.added_at).getTime() : null;
      const inPeriod = addedAtMs != null
        ? addedAtMs >= periodStartMs && addedAtMs < periodEndMs
        : true; // no timestamp — fall back to counting it since the booking overlaps
      if (!inPeriod) continue;
      const share = totalAmount / items.length;
      for (const item of items) addRevenue(item, share);
    } else {
      // per_day — scales with rental duration, so prorate by each item's share of
      // in-period days out of the order's total committed booking days.
      const totalBookingDaysAll = items.reduce((s, i) => s + i.totalBookingDays, 0) || 1;
      for (const item of items) addRevenue(item, totalAmount * (item.overlapDays / totalBookingDaysAll));
    }
  }
}
