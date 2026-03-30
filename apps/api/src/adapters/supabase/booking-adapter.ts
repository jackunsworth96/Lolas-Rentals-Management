import type {
  BookingPort,
  AvailabilityQuery,
  AvailableModel,
  InsertHoldInput,
  HoldRow,
  DirectBookingInsert,
  DirectBookingResult,
} from '@lolas/domain';
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

export function createBookingAdapter(): BookingPort {
  const sb = getSupabaseClient();

  return {
    async checkAvailability(query: AvailabilityQuery): Promise<AvailableModel[]> {
      const { storeId, pickupDatetime, dropoffDatetime } = query;

      const BUFFER_MS = 30 * 60 * 1000;
      const pickupBuffered = new Date(new Date(pickupDatetime).getTime() - BUFFER_MS).toISOString();

      // Statuses that permanently prevent a vehicle from being rented
      const NON_RENTABLE = ['Under Maintenance', 'Sold', 'Service Vehicle', 'Closed'];

      // Fleet rows — include all vehicles except hard non-rentable statuses.
      // "Active" vehicles may be available for the requested dates if their
      // current booking ends before pickup. The order_items overlap check
      // handles that.
      const { data: fleet, error: fleetErr } = await sb
        .from('fleet').select('id, model_id, status').eq('store_id', storeId)
        .not('model_id', 'is', null);
      if (fleetErr) throw new Error(`fleet query failed: ${fleetErr.message}`);
      const rentableFleet = (fleet ?? []).filter(
        (v: { status: string }) => !NON_RENTABLE.includes(v.status),
      );
      if (rentableFleet.length === 0) return [];

      const fleetByModel = new Map<string, Set<string>>();
      const vehicleToModel = new Map<string, string>();
      for (const v of rentableFleet as { id: string; model_id: string }[]) {
        if (!fleetByModel.has(v.model_id)) fleetByModel.set(v.model_id, new Set());
        fleetByModel.get(v.model_id)!.add(v.id);
        vehicleToModel.set(v.id, v.model_id);
      }

      // Track earliest dropoff per model for next-available-pickup calculation
      const minDropoff = new Map<string, string>();
      function trackDrop(mid: string, d: string) {
        const prev = minDropoff.get(mid);
        if (!prev || d < prev) minDropoff.set(mid, d);
      }

      // 3. Booked vehicles via order_items (30-min handover buffer applied)
      const { data: bookedRows, error: bookedErr } = await sb
        .from('order_items').select('vehicle_id, dropoff_datetime, orders!inner(status)')
        .eq('store_id', storeId).not('vehicle_id', 'is', null)
        .not('pickup_datetime', 'is', null).not('dropoff_datetime', 'is', null)
        .lt('pickup_datetime', dropoffDatetime)
        .gt('dropoff_datetime', pickupBuffered);
      if (bookedErr) throw new Error(`order_items overlap query failed: ${bookedErr.message}`);

      const bookedVehicleIds = new Set<string>();
      for (const row of (bookedRows ?? []) as Array<{ vehicle_id: string; dropoff_datetime: string; orders: unknown }>) {
        const orders = row.orders as { status: string } | { status: string }[] | null;
        const status = Array.isArray(orders) ? orders[0]?.status : orders?.status;
        if (status && status !== 'cancelled' && status !== 'completed') {
          bookedVehicleIds.add(row.vehicle_id);
          const mid = vehicleToModel.get(row.vehicle_id);
          if (mid) trackDrop(mid, row.dropoff_datetime);
        }
      }

      // 4. Unprocessed direct bookings (30-min handover buffer applied)
      const { data: directRows, error: directErr } = await sb
        .from('orders_raw').select('vehicle_model_id, dropoff_datetime')
        .eq('store_id', storeId).eq('booking_channel', 'direct').eq('status', 'unprocessed')
        .not('vehicle_model_id', 'is', null)
        .lt('pickup_datetime', dropoffDatetime)
        .gt('dropoff_datetime', pickupBuffered);
      if (directErr) throw new Error(`orders_raw direct overlap query failed: ${directErr.message}`);

      const directReservedByModel = new Map<string, number>();
      for (const row of (directRows ?? []) as { vehicle_model_id: string; dropoff_datetime: string }[]) {
        directReservedByModel.set(row.vehicle_model_id, (directReservedByModel.get(row.vehicle_model_id) ?? 0) + 1);
        trackDrop(row.vehicle_model_id, row.dropoff_datetime);
      }

      // 5. Active holds (no handover buffer on holds — they block by exact time)
      const nowIso = new Date().toISOString();
      const { data: holdRows, error: holdErr } = await sb
        .from('booking_holds').select('vehicle_model_id, dropoff_datetime')
        .eq('store_id', storeId).gt('expires_at', nowIso)
        .lt('pickup_datetime', dropoffDatetime).gt('dropoff_datetime', pickupDatetime);
      if (holdErr) throw new Error(`booking_holds overlap query failed: ${holdErr.message}`);

      const holdsByModel = new Map<string, number>();
      for (const row of (holdRows ?? []) as { vehicle_model_id: string; dropoff_datetime: string }[]) {
        holdsByModel.set(row.vehicle_model_id, (holdsByModel.get(row.vehicle_model_id) ?? 0) + 1);
        trackDrop(row.vehicle_model_id, row.dropoff_datetime);
      }

      // 6. Aggregate: available = total fleet - booked - direct reservations - holds
      const modelIds = [...fleetByModel.keys()];
      if (modelIds.length === 0) return [];

      const { data: models, error: modelErr } = await sb
        .from('vehicle_models').select('id, name').in('id', modelIds).eq('is_active', true);
      if (modelErr) throw new Error(`vehicle_models query failed: ${modelErr.message}`);

      const modelNameMap = new Map<string, string>();
      for (const m of (models ?? []) as { id: string; name: string }[]) modelNameMap.set(m.id, m.name);

      const results: AvailableModel[] = [];
      for (const [modelId, vehicleIds] of fleetByModel) {
        const modelName = modelNameMap.get(modelId);
        if (!modelName) continue;
        let available = vehicleIds.size;
        for (const vid of vehicleIds) { if (bookedVehicleIds.has(vid)) available--; }
        available -= directReservedByModel.get(modelId) ?? 0;
        available -= holdsByModel.get(modelId) ?? 0;
        available = Math.max(0, available);

        const entry: AvailableModel = { modelId, modelName, availableCount: available };
        if (available === 0) {
          const drop = minDropoff.get(modelId);
          if (drop) entry.nextAvailablePickup = new Date(new Date(drop).getTime() + BUFFER_MS).toISOString();
        }
        results.push(entry);
      }

      results.sort((a, b) => a.modelName.localeCompare(b.modelName));
      return results;
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

    async deleteHoldBySessionAndModel(sessionToken: string, vehicleModelId: string): Promise<void> {
      const { error } = await sb
        .from('booking_holds')
        .delete()
        .eq('session_token', sessionToken)
        .eq('vehicle_model_id', vehicleModelId);

      if (error) throw new Error(`Failed to clean up holds: ${error.message}`);
    },

    async insertDirectBooking(input: DirectBookingInsert): Promise<DirectBookingResult> {
      const { data, error } = await sb
        .from('orders_raw')
        .insert({
          source: input.source,
          booking_channel: 'direct',
          payload:
            input.webQuoteRaw != null ? { web_quote: input.webQuoteRaw } : null,
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
          addon_ids: input.addonIds,
          transfer_type: input.transferType ?? null,
          flight_number: input.flightNumber ?? null,
          flight_arrival_time: input.flightArrivalTime ?? null,
          transfer_route: input.transferRoute ?? null,
          charity_donation: input.charityDonation ?? 0,
          web_payment_method: input.webPaymentMethod ?? null,
        })
        .select('id, order_reference')
        .single();

      if (error) throw new Error(`Failed to insert direct booking: ${error.message}`);
      return {
        id: (data as { id: string; order_reference: string }).id,
        orderReference: (data as { id: string; order_reference: string }).order_reference,
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
