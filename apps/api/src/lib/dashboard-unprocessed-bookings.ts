import { getDashboardAvailabilityModel, type DashboardAvailabilityModel } from './dashboard-availability-model.js';

export interface UnprocessedBookingRow {
  store_id?: string | null;
  vehicle_id?: string | null;
  vehicle_model_id?: string | null;
  pickup_datetime?: string | null;
  dropoff_datetime?: string | null;
}

export interface UnprocessedBookingHolds {
  /** Bookings that already name a specific vehicle (walk-ins, pre-assigned web bookings). */
  vehicleIds: Set<string>;
  /** Bookings for a model with no vehicle yet — each one takes a unit of that dashboard model. */
  modelCounts: Map<DashboardAvailabilityModel['modelId'], number>;
}

/**
 * Bookings still in `orders_raw` (not yet processed into an order) hold fleet
 * just like confirmed orders do. Rows overlapping [windowStartMs, windowEndMs) count.
 */
export function unprocessedBookingHolds(
  rows: UnprocessedBookingRow[],
  modelNameById: Map<string, string>,
  windowStartMs: number,
  windowEndMs: number,
  storeId?: string,
): UnprocessedBookingHolds {
  const vehicleIds = new Set<string>();
  const modelCounts = new Map<DashboardAvailabilityModel['modelId'], number>();
  for (const row of rows) {
    if (storeId && row.store_id !== storeId) continue;
    const pickupMs = row.pickup_datetime ? new Date(row.pickup_datetime).getTime() : NaN;
    const dropoffMs = row.dropoff_datetime ? new Date(row.dropoff_datetime).getTime() : NaN;
    if (!Number.isFinite(pickupMs) || !Number.isFinite(dropoffMs)) continue;
    if (!(pickupMs < windowEndMs && dropoffMs > windowStartMs)) continue;

    if (row.vehicle_id) {
      vehicleIds.add(row.vehicle_id);
      continue;
    }
    if (!row.vehicle_model_id) continue;
    const { modelId } = getDashboardAvailabilityModel(modelNameById.get(row.vehicle_model_id) ?? row.vehicle_model_id);
    modelCounts.set(modelId, (modelCounts.get(modelId) ?? 0) + 1);
  }
  return { vehicleIds, modelCounts };
}

/** Free units per dashboard model after unassigned bookings take their share, never below zero. */
export function availableAfterUnassignedHolds(
  freeUnitsByModel: Map<DashboardAvailabilityModel['modelId'], number>,
  modelCounts: Map<DashboardAvailabilityModel['modelId'], number>,
): number {
  let total = 0;
  for (const [modelId, free] of freeUnitsByModel) {
    total += Math.max(0, free - (modelCounts.get(modelId) ?? 0));
  }
  return total;
}
