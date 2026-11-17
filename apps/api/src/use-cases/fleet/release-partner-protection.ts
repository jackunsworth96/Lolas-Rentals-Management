import type { SupabaseClient } from '@supabase/supabase-js';
import { DAY_MS, HANDOVER_MS } from '../../lib/availability-finder.js';
import { allocationQty, manilaDate, manilaMidnight, partnerHoldsBack, peakProtectedUse } from '../../lib/partner-protection.js';
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

export interface ReleasedRange { startsOn: string; endsBefore: string; previousQty: number; qty: number }

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

const dayLabel = (date: string) => new Date(manilaMidnight(date) + DAY_MS / 2)
  .toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Lowers a partner's allowance by one, using the same temporary allocation
 * change (with reason and actor) as the Partner Allocations page, so every
 * release stays on record there.
 *
 * Only the days where the partner's spare protected unit actually blocks this
 * booking are lowered. Days when the partner's own guests already fill their
 * allowance are left alone — the database rejects an allowance below what the
 * partner's guests are using, and there is nothing spare to give on those days.
 */
export async function releasePartnerProtection(sb: SupabaseClient, input: ReleaseInput) {
  const now = Date.now();
  const today = manilaDate(now);
  const windowStart = input.startsMs;
  const windowEnd = input.endsMs + HANDOVER_MS;
  const startsOn = manilaDate(windowStart) < today ? today : manilaDate(windowStart);
  const endsBefore = manilaDate(manilaMidnight(manilaDate(windowEnd - 1)) + DAY_MS);
  const fromMs = manilaMidnight(startsOn);
  const toMs = manilaMidnight(endsBefore);

  const protection = await loadProtectionData(sb, input.storeId, fromMs, toMs);
  if (!protection.enabled) throw fail('Partner allocations are switched off for this store, so nothing is protected.');
  const partnerName = protection.partnerNames.get(input.partnerId) ?? 'this partner';
  const noun = input.vehicleType === 'tuktuk' ? 'TukTuk' : 'bike';

  const releaseDays: Array<{ day: string; allowance: number }> = [];
  const fullDays: string[] = [];
  for (let dayMs = fromMs; dayMs < toMs; dayMs += DAY_MS) {
    const day = manilaDate(dayMs);
    const allowance = allocationQty(protection, input.partnerId, input.vehicleType, dayMs + DAY_MS / 2);
    if (allowance <= 0) continue;
    const bookingFrom = Math.max(windowStart, dayMs, now);
    const bookingTo = Math.min(windowEnd, dayMs + DAY_MS);
    if (!partnerHoldsBack(protection, input.vehicleType, input.partnerId, bookingFrom, bookingTo)) continue;
    const peak = peakProtectedUse(protection, input.partnerId, input.vehicleType, Math.max(dayMs, now), dayMs + DAY_MS);
    if (peak > allowance - 1) fullDays.push(day);
    else releaseDays.push({ day, allowance });
  }

  if (fullDays.length > 0) {
    throw fail(
      `${partnerName}'s own guests are using their protected ${noun} on ${fullDays.map(dayLabel).join(', ')}, `
        + `but it still blocks this booking for part of ${fullDays.length === 1 ? 'that day' : 'those days'}, so it can't be released. `
        + 'Choose other dates or another vehicle.',
    );
  }
  if (releaseDays.length === 0) {
    throw fail(`${partnerName} isn't holding back a ${noun} from this booking, so there is nothing to release.`);
  }

  // One allocation change per run of consecutive days with the same allowance.
  const ranges: ReleasedRange[] = [];
  for (const { day, allowance } of releaseDays) {
    const last = ranges[ranges.length - 1];
    const next = manilaDate(manilaMidnight(day) + DAY_MS);
    if (last && last.endsBefore === day && last.previousQty === allowance) last.endsBefore = next;
    else ranges.push({ startsOn: day, endsBefore: next, previousQty: allowance, qty: allowance - 1 });
  }

  for (const range of ranges) {
    const { error } = await sb.rpc('allocation_configure', {
      p_store: input.storeId,
      p_partner: input.partnerId,
      p_actor: input.actorUserId,
      p_action: 'override',
      p_data: { vehicleType: input.vehicleType, startsOn: range.startsOn, endsBefore: range.endsBefore, qty: range.qty, reason: `Released for a walk-in booking: ${input.reason}` },
    });
    if (error) {
      if (error.message.includes('overlaps an existing override')) {
        throw fail(`${partnerName} already has a temporary allocation change on these dates. Adjust it on the Partner Allocations page instead.`);
      }
      throw fail(`Could not release the protected ${input.vehicleType}: ${error.message.replace(/^ALLOCATION_CONFLICT:\s*/, '')}`);
    }
  }

  const rangeText = ranges
    .map((r) => `${r.startsOn} to ${manilaDate(manilaMidnight(r.endsBefore) - 1)} (allowance ${r.previousQty} → ${r.qty})`)
    .join('\n');
  try {
    await sendTelegramAlert(
      `⚠️ <b>Partner allocation released</b>\n`
        + `Partner: ${escapeHtml(partnerName)}\n`
        + `Vehicle type: ${input.vehicleType}\n`
        + `Dates: ${rangeText}\n`
        + `By: ${escapeHtml(input.actorName ?? input.actorUserId)}\n`
        + `Reason: ${escapeHtml(input.reason)}`,
      getTelegramChatId('fleet'),
    );
  } catch (err) {
    console.error('[partner-protection] telegram notify error:', err);
  }

  const first = ranges[0];
  return {
    partnerId: input.partnerId,
    partnerName,
    vehicleType: input.vehicleType,
    startsOn: first.startsOn,
    endsBefore: ranges[ranges.length - 1].endsBefore,
    previousQty: first.previousQty,
    qty: first.qty,
    ranges,
  };
}
