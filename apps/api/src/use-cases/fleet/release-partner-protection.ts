import type { SupabaseClient } from '@supabase/supabase-js';
import { DAY_MS } from '../../lib/availability-finder.js';
import { allocationQty, manilaDate, manilaMidnight } from '../../lib/partner-protection.js';
import { sendTelegramAlert, getTelegramChatId } from '../../lib/telegram.js';
import { escapeHtml } from '../../services/email.js';
import { loadProtectionData } from './protection-inputs.js';

export interface ReleaseInput {
  storeId: string;
  partnerId: string;
  vehicleType: 'bike' | 'tuktuk';
  startsMs: number;
  endsMs: number;
  reason: string;
  actorUserId: string;
  actorName?: string | null;
}

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

/**
 * Lowers a partner's allowance by one for the booking's days, using the same
 * temporary allocation change (with reason and actor) as the Partner
 * Allocations page, so every release stays on record there.
 */
export async function releasePartnerProtection(sb: SupabaseClient, input: ReleaseInput) {
  const today = manilaDate(Date.now());
  const startsOn = manilaDate(input.startsMs) < today ? today : manilaDate(input.startsMs);
  const endsBefore = manilaDate(manilaMidnight(manilaDate(input.endsMs - 1)) + DAY_MS);
  const fromMs = manilaMidnight(startsOn);
  const toMs = manilaMidnight(endsBefore);

  const protection = await loadProtectionData(sb, input.storeId, fromMs, toMs);
  if (!protection.enabled) throw fail('Partner allocations are switched off for this store, so nothing is protected.');
  let allowance = Number.POSITIVE_INFINITY;
  for (let day = fromMs; day < toMs; day += DAY_MS) {
    allowance = Math.min(allowance, allocationQty(protection, input.partnerId, input.vehicleType, day + DAY_MS / 2));
  }
  const partnerName = protection.partnerNames.get(input.partnerId) ?? 'this partner';
  if (!Number.isFinite(allowance) || allowance <= 0) {
    throw fail(`${partnerName} has no ${input.vehicleType} protected on these dates, so there is nothing to release.`);
  }

  const qty = allowance - 1;
  const { error } = await sb.rpc('allocation_configure', {
    p_store: input.storeId,
    p_partner: input.partnerId,
    p_actor: input.actorUserId,
    p_action: 'override',
    p_data: { vehicleType: input.vehicleType, startsOn, endsBefore, qty, reason: `Released for a walk-in booking: ${input.reason}` },
  });
  if (error) {
    if (error.message.includes('overlaps an existing override')) {
      throw fail(`${partnerName} already has a temporary allocation change on these dates. Adjust it on the Partner Allocations page instead.`);
    }
    throw fail(`Could not release the protected ${input.vehicleType}: ${error.message.replace(/^ALLOCATION_CONFLICT:\s*/, '')}`);
  }

  try {
    await sendTelegramAlert(
      `⚠️ <b>Partner allocation released</b>\n`
        + `Partner: ${escapeHtml(partnerName)}\n`
        + `Vehicle type: ${input.vehicleType}\n`
        + `Dates: ${startsOn} to ${manilaDate(toMs - 1)} (allowance ${allowance} → ${qty})\n`
        + `By: ${escapeHtml(input.actorName ?? input.actorUserId)}\n`
        + `Reason: ${escapeHtml(input.reason)}`,
      getTelegramChatId('fleet'),
    );
  } catch (err) {
    console.error('[partner-protection] telegram notify error:', err);
  }

  return { partnerId: input.partnerId, partnerName, vehicleType: input.vehicleType, startsOn, endsBefore, previousQty: allowance, qty };
}
