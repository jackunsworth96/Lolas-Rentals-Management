import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { logger } from './logger.js';

export type DemandMissSource = 'website' | 'partner_portal' | 'walk_in';

/** Stable, non-reversible key for "the same person searching again". */
export function visitorKeyFor(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  const ua = req.get('user-agent') ?? '';
  return createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

/**
 * Records every model that came back with zero availability for a customer's
 * date search. Fire-and-forget: a logging failure must never break the search.
 */
export function recordSoldOutSearch(input: {
  source: Exclude<DemandMissSource, 'walk_in'>;
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  models: Array<{ modelId: string; availableCount: number }>;
  visitorKey: string;
  partnerRef?: string | null;
}): void {
  const rows = input.models
    .filter((m) => m.availableCount <= 0)
    .map((m) => ({
      store_id: input.storeId,
      vehicle_model_id: m.modelId,
      source: input.source,
      pickup_datetime: new Date(input.pickupDatetime).toISOString(),
      dropoff_datetime: new Date(input.dropoffDatetime).toISOString(),
      visitor_key: input.visitorKey,
      partner_ref: input.partnerRef ?? null,
    }));
  if (rows.length === 0) return;

  void Promise.resolve(
    getSupabaseClient()
      .from('demand_misses')
      .upsert(rows, {
        onConflict: 'source,store_id,vehicle_model_id,pickup_datetime,dropoff_datetime,visitor_key',
        ignoreDuplicates: true,
      }),
  )
    .then(({ error }) => {
      if (error) logger.warn({ err: error.message }, 'demand_misses insert failed');
    })
    .catch((err: unknown) => logger.warn({ err }, 'demand_misses insert failed'));
}
