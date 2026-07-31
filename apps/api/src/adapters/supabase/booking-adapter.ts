import type {
  BookingPort,
  AvailabilityQuery,
  AvailableModel,
  InsertHoldInput,
  HoldRow,
  DirectBookingInsert,
  DirectBookingResult,
} from '@lolas/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './client.js';

interface HoldDbRow {
  id: string;
  vehicle_model_id: string;
  store_id: string;
  pickup_datetime: string;
  dropoff_datetime: string;
  session_token: string;
  expires_at: string;
  created_at: string;
}

function dbRowToHold(row: HoldDbRow): HoldRow {
  return {
    id: row.id,
    vehicleModelId: row.vehicle_model_id,
    storeId: row.store_id,
    pickupDatetime: row.pickup_datetime,
    dropoffDatetime: row.dropoff_datetime,
    sessionToken: row.session_token,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/**
 * Last bookable pickup slot in minutes since midnight (Manila local time).
 * Philippines is fixed UTC+8 — no DST.
 */
const LAST_SLOT_MINS = 16 * 60 + 45; // 16:45

/**
 * If `isoUtc` falls after the last bookable slot (16:45 Manila), advance it to
 * 09:15 Manila the following calendar day. Otherwise return it unchanged.
 */
function snapToBusinessHours(isoUtc: string): string {
  const d = new Date(isoUtc);
  const manilaTime = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour12: false });
  const [h, m] = manilaTime.split(':').map(Number);
  if (h * 60 + m <= LAST_SLOT_MINS) return isoUtc;

  // Past last slot → next day 09:15 Manila (UTC+8 = UTC+0 01:15)
  const manilaDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const [yr, mo, dy] = manilaDate.split('-').map(Number);
  return new Date(Date.UTC(yr, mo - 1, dy + 1, 1, 15, 0)).toISOString();
}

export type ExactAvailabilityReason = 'order' | 'walk_in' | 'owner_use';

export interface AvailabilityExplanation {
  models: Array<{
    modelId: string;
    modelName: string;
    totalEligible: number;
    availableCount: number;
    exactVehicleExclusions: Array<{
      vehicleId: string;
      vehicleName: string;
      reasons: ExactAvailabilityReason[];
    }>;
    capacityDeductions: { directReservations: number; holds: number };
  }>;
  configurationExclusions: Array<{
    vehicleId: string;
    vehicleName: string;
    reason: 'missing_model' | 'non_rentable_status' | 'inactive_model';
    detail?: string;
  }>;
}

export interface AvailabilityEvaluation {
  models: AvailableModel[];
  explanation: AvailabilityExplanation;
}

/** Single source of truth for public counts and staff-only availability diagnostics. */
export async function evaluateAvailability(
  query: AvailabilityQuery,
  sb: SupabaseClient = getSupabaseClient(),
): Promise<AvailabilityEvaluation> {
  const { storeId, pickupDatetime, dropoffDatetime, excludeSessionToken, excludeOrderItemId } = query;
  const BUFFER_MS = 30 * 60 * 1000;
  const pickupBuffered = new Date(new Date(pickupDatetime).getTime() - BUFFER_MS).toISOString();
  const NON_RENTABLE = ['Under Maintenance', 'Sold', 'Service Vehicle', 'Closed', 'Pending ORCR'];

  type FleetRow = { id: string; name: string; model_id: string | null; status: string };
  const { data: fleet, error: fleetErr } = await sb
    .from('fleet').select('id, name, model_id, status').eq('store_id', storeId);
  if (fleetErr) throw new Error(`fleet query failed: ${fleetErr.message}`);

  const configurationExclusions: AvailabilityExplanation['configurationExclusions'] = [];
  const rentableFleet: FleetRow[] = [];
  for (const vehicle of (fleet ?? []) as FleetRow[]) {
    if (!vehicle.model_id) {
      configurationExclusions.push({ vehicleId: vehicle.id, vehicleName: vehicle.name, reason: 'missing_model' });
    } else if (NON_RENTABLE.includes(vehicle.status)) {
      configurationExclusions.push({
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        reason: 'non_rentable_status',
        detail: vehicle.status,
      });
    } else {
      rentableFleet.push(vehicle);
    }
  }
  if (rentableFleet.length === 0) {
    return { models: [], explanation: { models: [], configurationExclusions } };
  }

  const fleetByModel = new Map<string, Set<string>>();
  const vehicleToModel = new Map<string, string>();
  const vehicleName = new Map<string, string>();
  for (const vehicle of rentableFleet) {
    const modelId = vehicle.model_id!;
    if (!fleetByModel.has(modelId)) fleetByModel.set(modelId, new Set());
    fleetByModel.get(modelId)!.add(vehicle.id);
    vehicleToModel.set(vehicle.id, modelId);
    vehicleName.set(vehicle.id, vehicle.name);
  }

  const minDropoff = new Map<string, string>();
  const trackDrop = (modelId: string, dropoff: string) => {
    const previous = minDropoff.get(modelId);
    if (!previous || dropoff < previous) minDropoff.set(modelId, dropoff);
  };

  // Track earliest blocker that starts AFTER the user's pickup (for partial-availability detection)
  const minConflictStart = new Map<string, string>();
  const trackConflictStart = (modelId: string, blockerPickup: string) => {
    if (blockerPickup <= pickupDatetime) return;
    const previous = minConflictStart.get(modelId);
    if (!previous || blockerPickup < previous) minConflictStart.set(modelId, blockerPickup);
  };

  // Track units that were already blocked AT the start of the window (pickup ≤ user's pickupDatetime)
  // Used to verify that at least one unit was actually free at pickup time before claiming partial availability.
  const exactVehicleBlockedFromStart = new Map<string, Set<string>>(); // model → set of vehicle IDs
  const trackExactVehicleFromStart = (vehicleId: string, modelId: string, blockerPickup: string) => {
    if (blockerPickup > pickupDatetime) return;
    const set = exactVehicleBlockedFromStart.get(modelId) ?? new Set<string>();
    set.add(vehicleId);
    exactVehicleBlockedFromStart.set(modelId, set);
  };
  const directFromStart = new Map<string, number>();
  const holdsFromStart = new Map<string, number>();

  const exactBlockers = new Map<string, Set<ExactAvailabilityReason>>();
  const requestedPickupMs = new Date(pickupDatetime).getTime();
  const requestedQuantity = Math.max(1, query.requestedQuantity ?? 1);
  const initiallyBlockedVehicles = new Set<string>();
  const futureVehicleBlockStarts = new Map<string, string>();
  const initialCapacityDeductions = new Map<string, number>();
  const futureCapacityBlockStarts = new Map<string, string[]>();

  const trackVehicleBlockStart = (vehicleId: string, startsAt: string | null | undefined) => {
    if (!startsAt) return;
    const startsMs = new Date(startsAt).getTime();
    if (startsMs <= requestedPickupMs) {
      initiallyBlockedVehicles.add(vehicleId);
      return;
    }
    const previous = futureVehicleBlockStarts.get(vehicleId);
    if (!previous || startsAt < previous) futureVehicleBlockStarts.set(vehicleId, startsAt);
  };
  const trackCapacityBlockStart = (modelId: string, startsAt: string | null | undefined) => {
    if (!startsAt) return;
    const startsMs = new Date(startsAt).getTime();
    if (startsMs <= requestedPickupMs) {
      initialCapacityDeductions.set(modelId, (initialCapacityDeductions.get(modelId) ?? 0) + 1);
      return;
    }
    const starts = futureCapacityBlockStarts.get(modelId) ?? [];
    starts.push(startsAt);
    futureCapacityBlockStarts.set(modelId, starts);
  };
  const addExactBlocker = (vehicleId: string, reason: ExactAvailabilityReason) => {
    const reasons = exactBlockers.get(vehicleId) ?? new Set<ExactAvailabilityReason>();
    reasons.add(reason);
    exactBlockers.set(vehicleId, reasons);
  };

  const { data: bookedRows, error: bookedErr } = await sb
    .from('order_items').select('id, vehicle_id, pickup_datetime, dropoff_datetime, orders!inner(status)')
    .eq('store_id', storeId).not('vehicle_id', 'is', null)
    .not('pickup_datetime', 'is', null).not('dropoff_datetime', 'is', null)
    .lt('pickup_datetime', dropoffDatetime).gt('dropoff_datetime', pickupBuffered);
  if (bookedErr) throw new Error(`order_items overlap query failed: ${bookedErr.message}`);
  for (const row of (bookedRows ?? []) as Array<{ id: string; vehicle_id: string; pickup_datetime: string; dropoff_datetime: string; orders: unknown }>) {
    if (excludeOrderItemId && row.id === excludeOrderItemId) continue;
    const orders = row.orders as { status: string } | { status: string }[] | null;
    const status = Array.isArray(orders) ? orders[0]?.status : orders?.status;
    if (status && status !== 'cancelled' && status !== 'completed') {
      addExactBlocker(row.vehicle_id, 'order');
      const modelId = vehicleToModel.get(row.vehicle_id);
      if (modelId) {
        trackDrop(modelId, row.dropoff_datetime);
        trackVehicleBlockStart(row.vehicle_id, row.pickup_datetime);
        trackConflictStart(modelId, row.pickup_datetime);
        trackExactVehicleFromStart(row.vehicle_id, modelId, row.pickup_datetime);
      }
    }
  }

  const { data: directRows, error: directErr } = await sb
    .from('orders_raw').select('vehicle_model_id, pickup_datetime, dropoff_datetime')
    .eq('store_id', storeId).eq('booking_channel', 'direct').eq('status', 'unprocessed')
    .not('vehicle_model_id', 'is', null)
    .lt('pickup_datetime', dropoffDatetime).gt('dropoff_datetime', pickupBuffered);
  if (directErr) throw new Error(`orders_raw direct overlap query failed: ${directErr.message}`);
  const directReservedByModel = new Map<string, number>();
  for (const row of (directRows ?? []) as Array<{ vehicle_model_id: string; pickup_datetime: string; dropoff_datetime: string }>) {
    directReservedByModel.set(row.vehicle_model_id, (directReservedByModel.get(row.vehicle_model_id) ?? 0) + 1);
    trackDrop(row.vehicle_model_id, row.dropoff_datetime);
    trackCapacityBlockStart(row.vehicle_model_id, row.pickup_datetime);
    trackConflictStart(row.vehicle_model_id, row.pickup_datetime);
    if (row.pickup_datetime <= pickupDatetime) {
      directFromStart.set(row.vehicle_model_id, (directFromStart.get(row.vehicle_model_id) ?? 0) + 1);
    }
  }

  const { data: walkInRows, error: walkInErr } = await sb
    .from('orders_raw').select('vehicle_id, pickup_datetime, dropoff_datetime')
    .eq('store_id', storeId).eq('booking_channel', 'walk_in').eq('status', 'unprocessed')
    .not('vehicle_id', 'is', null)
    .lt('pickup_datetime', dropoffDatetime).gt('dropoff_datetime', pickupBuffered);
  if (walkInErr) throw new Error(`orders_raw walk-in overlap query failed: ${walkInErr.message}`);
  for (const row of (walkInRows ?? []) as Array<{ vehicle_id: string; pickup_datetime: string; dropoff_datetime: string }>) {
    addExactBlocker(row.vehicle_id, 'walk_in');
    const modelId = vehicleToModel.get(row.vehicle_id);
    if (modelId) {
      trackDrop(modelId, row.dropoff_datetime);
      trackVehicleBlockStart(row.vehicle_id, row.pickup_datetime);
      trackConflictStart(modelId, row.pickup_datetime);
      trackExactVehicleFromStart(row.vehicle_id, modelId, row.pickup_datetime);
    }
  }

  const vehicleIds = rentableFleet.map((vehicle) => vehicle.id);
  const { data: ownerUseRows, error: ownerUseErr } = await sb
    .from('fleet_unavailability').select('vehicle_id, starts_at')
    .eq('store_id', storeId).eq('type', 'owner_use').is('cancelled_at', null)
    .in('vehicle_id', vehicleIds)
    .lt('starts_at', dropoffDatetime).gt('ends_at', pickupDatetime);
  if (ownerUseErr) throw new Error(`fleet unavailability query failed: ${ownerUseErr.message}`);
  for (const row of (ownerUseRows ?? []) as Array<{ vehicle_id: string; starts_at: string }>) {
    addExactBlocker(row.vehicle_id, 'owner_use');
    trackVehicleBlockStart(row.vehicle_id, row.starts_at);
    const modelId = vehicleToModel.get(row.vehicle_id);
    if (modelId) {
      trackConflictStart(modelId, row.starts_at);
      trackExactVehicleFromStart(row.vehicle_id, modelId, row.starts_at);
    }
  }

  const nowIso = new Date().toISOString();
  let holdsQuery = sb
    .from('booking_holds').select('vehicle_model_id, pickup_datetime, dropoff_datetime, expires_at')
    .eq('store_id', storeId).gt('expires_at', nowIso)
    .lt('pickup_datetime', dropoffDatetime).gt('dropoff_datetime', pickupDatetime);
  if (excludeSessionToken) holdsQuery = holdsQuery.neq('session_token', excludeSessionToken);
  const { data: holdRows, error: holdErr } = await holdsQuery;
  if (holdErr) throw new Error(`booking_holds overlap query failed: ${holdErr.message}`);
  const holdsByModel = new Map<string, number>();
  const minHoldExpiry = new Map<string, string>();
  for (const row of (holdRows ?? []) as Array<{ vehicle_model_id: string; pickup_datetime: string; dropoff_datetime: string; expires_at: string }>) {
    holdsByModel.set(row.vehicle_model_id, (holdsByModel.get(row.vehicle_model_id) ?? 0) + 1);
    trackDrop(row.vehicle_model_id, row.dropoff_datetime);
    trackCapacityBlockStart(row.vehicle_model_id, row.pickup_datetime);
    trackConflictStart(row.vehicle_model_id, row.pickup_datetime);
    const previous = minHoldExpiry.get(row.vehicle_model_id);
    if (!previous || row.expires_at < previous) minHoldExpiry.set(row.vehicle_model_id, row.expires_at);
    if (row.pickup_datetime <= pickupDatetime) {
      holdsFromStart.set(row.vehicle_model_id, (holdsFromStart.get(row.vehicle_model_id) ?? 0) + 1);
    }
  }

  const modelIds = [...fleetByModel.keys()];
  const { data: models, error: modelErr } = await sb
    .from('vehicle_models').select('id, name').in('id', modelIds).eq('is_active', true);
  if (modelErr) throw new Error(`vehicle_models query failed: ${modelErr.message}`);
  const modelNameMap = new Map<string, string>();
  for (const model of (models ?? []) as Array<{ id: string; name: string }>) modelNameMap.set(model.id, model.name);
  for (const [modelId, ids] of fleetByModel) {
    if (modelNameMap.has(modelId)) continue;
    for (const vehicleId of ids) {
      configurationExclusions.push({
        vehicleId,
        vehicleName: vehicleName.get(vehicleId) ?? vehicleId,
        reason: 'inactive_model',
        detail: modelId,
      });
    }
  }

  const results: AvailableModel[] = [];
  const detailModels: AvailabilityExplanation['models'] = [];
  for (const [modelId, ids] of fleetByModel) {
    const modelName = modelNameMap.get(modelId);
    if (!modelName) continue;
    const excludedVehicles = [...ids]
      .filter((vehicleId) => exactBlockers.has(vehicleId))
      .map((vehicleId) => ({
        vehicleId,
        vehicleName: vehicleName.get(vehicleId) ?? vehicleId,
        reasons: [...exactBlockers.get(vehicleId)!],
      }));
    let available = ids.size - excludedVehicles.length;
    const directReservations = directReservedByModel.get(modelId) ?? 0;
    const holds = holdsByModel.get(modelId) ?? 0;
    available -= directReservations;
    const confirmedAvailable = available;
    available = Math.max(0, available - holds);

    const entry: AvailableModel = { modelId, modelName, availableCount: available };
    if (available < requestedQuantity) {
      const initiallyBlockedForModel = [...ids]
        .filter((vehicleId) => initiallyBlockedVehicles.has(vehicleId)).length;
      let continuousCapacity = ids.size
        - initiallyBlockedForModel
        - (initialCapacityDeductions.get(modelId) ?? 0);

      if (continuousCapacity >= requestedQuantity) {
        const events = new Map<string, number>();
        for (const vehicleId of ids) {
          if (initiallyBlockedVehicles.has(vehicleId)) continue;
          const startsAt = futureVehicleBlockStarts.get(vehicleId);
          if (startsAt) events.set(startsAt, (events.get(startsAt) ?? 0) + 1);
        }
        for (const startsAt of futureCapacityBlockStarts.get(modelId) ?? []) {
          events.set(startsAt, (events.get(startsAt) ?? 0) + 1);
        }
        for (const [startsAt, deduction] of [...events].sort(([a], [b]) => a.localeCompare(b))) {
          continuousCapacity -= deduction;
          if (continuousCapacity < requestedQuantity) {
            entry.availableUntil = startsAt;
            break;
          }
        }
      }
    }
    if (available === 0) {
      const dropoff = minDropoff.get(modelId);
      if (dropoff) entry.nextAvailablePickup = snapToBusinessHours(new Date(new Date(dropoff).getTime() + BUFFER_MS).toISOString());
      if (confirmedAvailable > 0) {
        const expiry = minHoldExpiry.get(modelId);
        if (expiry) entry.holdExpiresAt = expiry;
      }
      // Partial availability: set firstConflictAt when there is a free window within the period.
      const conflictStart = minConflictStart.get(modelId);
      if (conflictStart) {
        const totalUnits = ids.size;
        const fromStartExact = exactVehicleBlockedFromStart.get(modelId)?.size ?? 0;
        const fromStartDirect = directFromStart.get(modelId) ?? 0;
        const fromStartHolds = holdsFromStart.get(modelId) ?? 0;
        const availableAtWindowStart = Math.max(0, totalUnits - fromStartExact - fromStartDirect - fromStartHolds);
        if (availableAtWindowStart > 0) {
          // Clean case: at least one unit was free at the user's exact pickup time.
          entry.firstConflictAt = conflictStart;
        } else if (
          entry.nextAvailablePickup &&
          entry.nextAvailablePickup < dropoffDatetime &&
          conflictStart > entry.nextAvailablePickup
        ) {
          // Same-day-return case: a prior booking clears within the window (nextAvailablePickup)
          // before a new booking starts (conflictStart). The vehicle is free between those two
          // points even though it was blocked at the user's exact pickup time.
          entry.firstConflictAt = conflictStart;
        }
      }
    }
    results.push(entry);
    detailModels.push({
      modelId,
      modelName,
      totalEligible: ids.size,
      availableCount: available,
      exactVehicleExclusions: excludedVehicles,
      capacityDeductions: { directReservations, holds },
    });
  }

  results.sort((a, b) => a.modelName.localeCompare(b.modelName));
  detailModels.sort((a, b) => a.modelName.localeCompare(b.modelName));
  return { models: results, explanation: { models: detailModels, configurationExclusions } };
}

export function createBookingAdapter(): BookingPort {
  const sb = getSupabaseClient();

  return {
    async checkAvailability(query: AvailabilityQuery): Promise<AvailableModel[]> {
      return (await evaluateAvailability(query, sb)).models;
    },

    async insertHold(input: InsertHoldInput): Promise<HoldRow> {
      const { data, error } = await sb
        .from('booking_holds')
        .insert({
          vehicle_model_id: input.vehicleModelId,
          store_id: input.storeId,
          pickup_datetime: input.pickupDatetime,
          dropoff_datetime: input.dropoffDatetime,
          session_token: input.sessionToken,
          expires_at: input.expiresAt,
        })
        .select('*')
        .single();

      if (error) throw new Error(`Failed to insert hold: ${error.message}`);
      return dbRowToHold(data as HoldDbRow);
    },

    async deleteHold(holdId: string, sessionToken: string): Promise<boolean> {
      const { data, error } = await sb
        .from('booking_holds')
        .delete()
        .eq('id', holdId)
        .eq('session_token', sessionToken)
        .select('id');

      if (error) throw new Error(`Failed to delete hold: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async findActiveHoldsBySession(sessionToken: string): Promise<HoldRow[]> {
      const nowIso = new Date().toISOString();
      const { data, error } = await sb
        .from('booking_holds')
        .select('*')
        .eq('session_token', sessionToken)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: true });

      if (error) throw new Error(`Failed to fetch holds: ${error.message}`);
      return (data ?? []).map((r) => dbRowToHold(r as HoldDbRow));
    },

    async findActiveHold(
      sessionToken: string,
      vehicleModelId: string,
      pickupDatetime: string,
      dropoffDatetime: string,
    ): Promise<HoldRow | null> {
      const nowIso = new Date().toISOString();
      const { data, error } = await sb
        .from('booking_holds')
        .select('*')
        .eq('session_token', sessionToken)
        .eq('vehicle_model_id', vehicleModelId)
        .eq('pickup_datetime', pickupDatetime)
        .eq('dropoff_datetime', dropoffDatetime)
        .gt('expires_at', nowIso)
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`Failed to find active hold: ${error.message}`);
      return data ? dbRowToHold(data as HoldDbRow) : null;
    },

    async deleteHoldBySessionAndModel(sessionToken: string, vehicleModelId: string, holdId?: string): Promise<void> {
      let query = sb.from('booking_holds').delete();

      if (holdId) {
        query = query.eq('id', holdId);
      } else {
        query = query.eq('session_token', sessionToken).eq('vehicle_model_id', vehicleModelId);
      }

      const { error } = await query;
      if (error) throw new Error(`Failed to clean up holds: ${error.message}`);
    },

    async insertDirectBooking(input: DirectBookingInsert): Promise<DirectBookingResult> {
      const payload: Record<string, unknown> | null = (() => {
        const p: Record<string, unknown> = {};
        if (input.webQuoteRaw != null) p.web_quote = input.webQuoteRaw;
        if (input.helmetCount != null) p.helmet_count = input.helmetCount;
        if (input.transferAmount != null && input.transferAmount > 0)
          p.transfer_amount = input.transferAmount;
        if (input.transferPaxCount != null && input.transferPaxCount > 0)
          p.transfer_pax_count = input.transferPaxCount;
        const acc = input.accommodationName?.trim();
        if (acc) p.accommodation_name = acc;
        const driverName = input.driverName?.trim();
        if (driverName) p.driver_name = driverName;
        const groupRef = input.partnerBookingGroupRef?.trim();
        if (groupRef) p.partner_booking_group_ref = groupRef;
        return Object.keys(p).length > 0 ? p : null;
      })();

      const { data, error } = await sb
        .from('orders_raw')
        .insert({
          source: input.source,
          booking_channel: 'direct',
          payload,
          status: 'unprocessed',
          customer_name: input.customerName,
          customer_email: input.customerEmail,
          customer_mobile: input.customerMobile,
          vehicle_model_id: input.vehicleModelId,
          pickup_datetime: input.pickupDatetime,
          dropoff_datetime: input.dropoffDatetime,
          pickup_location_id: input.pickupLocationId,
          dropoff_location_id: input.dropoffLocationId,
          store_id: input.storeId,
          order_reference: input.orderReference,
          cancellation_token: input.cancellationToken,
          addon_ids: input.addonIds,
          transfer_type: input.transferType ?? null,
          flight_number: input.flightNumber ?? null,
          flight_arrival_time: input.flightArrivalTime ?? null,
          transfer_route: input.transferRoute ?? null,
          charity_donation: input.charityDonation ?? 0,
          web_payment_method: input.webPaymentMethod ?? null,
          web_quote_raw: input.webQuoteRaw ?? null,
          transfer_pax_count:
            input.transferPaxCount != null && input.transferPaxCount > 0
              ? input.transferPaxCount
              : null,
          transfer_amount:
            input.transferAmount != null && input.transferAmount > 0
              ? input.transferAmount
              : null,
          customer_company: input.company?.trim() || null,
          customer_extra_comments: input.extraComments?.trim() || null,
          pickup_location_address: input.pickupLocationAddress?.trim() || null,
          dropoff_location_address: input.dropoffLocationAddress?.trim() || null,
          device_type: input.deviceType ?? null,
          partner_ref: input.partnerRef?.trim() || null,
          rental_value_raw: input.rentalValueRaw ?? null,
          partner_booking_group_ref: input.partnerBookingGroupRef?.trim() || null,
          driver_name: input.driverName?.trim() || null,
        })
        .select('id, order_reference, cancellation_token')
        .single();

      if (error) throw new Error(`Failed to insert direct booking: ${error.message}`);
      const row = data as { id: string; order_reference: string; cancellation_token: string };
      return {
        id: row.id,
        orderReference: row.order_reference,
        cancellationToken: row.cancellation_token,
      };
    },

    async isOrderReferenceUnique(orderReference: string): Promise<boolean> {
      const { count, error } = await sb
        .from('orders_raw')
        .select('id', { count: 'exact', head: true })
        .eq('order_reference', orderReference);

      if (error) throw new Error(`Failed to check order reference uniqueness: ${error.message}`);
      return (count ?? 0) === 0;
    },
  };
}
