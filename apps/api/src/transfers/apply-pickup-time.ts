import type { Transfer, TransferRepository } from '@lolas/domain';
import { calculatePickupTime, inferDirection, type PickupTimeResult, type TransferDirection } from './pickup-time.js';
import { loadPickupRules } from './pickup-rules-loader.js';

export interface AppliedPickupTime {
  transfer: Transfer;
  pickup: PickupTimeResult | null;
  direction: TransferDirection;
}

/**
 * Calculates and saves the pickup window from the flight time, independently of
 * Telegram so the Transfers page always shows it. Leaves an existing manual
 * pickup time untouched; failures are logged and the transfer is returned as-is.
 */
export async function applyPickupTime(
  transfer: Transfer,
  transferRepo: TransferRepository,
): Promise<AppliedPickupTime> {
  const direction = inferDirection(transfer.route);
  if (!transfer.flightTime) return { transfer, pickup: null, direction };

  try {
    const rules = await loadPickupRules();
    const pickup = calculatePickupTime(direction, transfer.vanType, transfer.flightTime, transfer.serviceDate, rules);
    if (transfer.pickupTime) return { transfer, pickup, direction };
    const updated = transfer.withPickupWindow(pickup.from, pickup.to);
    await transferRepo.save(updated);
    return { transfer: updated, pickup, direction };
  } catch (err) {
    console.error('[transfers] Pickup time calculation failed:', err);
    return { transfer, pickup: null, direction };
  }
}
