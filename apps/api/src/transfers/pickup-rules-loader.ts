/**
 * Loads active pickup rules from the transfer_pickup_rules table.
 *
 * This function is the DB-access companion to the pure calculatePickupTime
 * function in pickup-time.ts. Call it once per request, then pass the result
 * directly to calculatePickupTime.
 */

import { getSupabaseClient } from '../adapters/supabase/client.js';
import type { PickupRule } from './pickup-time.js';

export async function loadPickupRules(): Promise<PickupRule[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('transfer_pickup_rules')
    .select('vehicle_type, direction, rule_type, flight_hour, pickup_from, pickup_to, offset_mins')
    .eq('is_active', true);

  if (error) {
    throw new Error('Failed to load pickup rules: ' + error.message);
  }

  return (data ?? []).map((row) => ({
    vehicleType: row.vehicle_type as string,
    direction: row.direction as string,
    ruleType: row.rule_type as 'bracket' | 'offset',
    flightHour: row.flight_hour as number | null,
    pickupFrom: row.pickup_from as string | null,
    pickupTo: row.pickup_to as string | null,
    offsetMins: row.offset_mins as number | null,
  }));
}
