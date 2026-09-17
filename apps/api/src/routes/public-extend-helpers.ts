import { getSupabaseClient } from '../adapters/supabase/client.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { resolveStoreAccounts } from '../adapters/supabase/maintenance-expense-rpc.js';
import { sendEmail, extendConfirmationHtml, escapeHtml } from '../services/email.js';
import { formatManilaDate, formatManilaDateTime } from '../utils/manila-date.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';

// ── Shared helpers (exported for reuse by the main route file) ──

export function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

/** Accepts LR/BB references with or without dashes (e.g. LR0423BE36 ↔ LR-0423-BE36). */
export function orderReferenceLookupVariants(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const variants = new Set<string>();
  variants.add(trimmed);
  const upper = trimmed.toUpperCase();
  variants.add(upper);
  const compact = upper.replace(/-/g, '').replace(/\s+/g, '');
  if (compact) variants.add(compact);
  const m = compact.match(/^(LR|BB)(\d{4})([A-F0-9]{4})$/);
  if (m) variants.add(`${m[1]}-${m[2]}-${m[3]}`);
  return [...variants].filter(Boolean);
}

export function extDayCount(msA: number, msB: number): number {
  return Math.max(1, Math.ceil((msB - msA) / 86400000));
}

// ── Extension resolver types ──

export type ExtensionInputs = {
  orderReference: string;
  trimmedEmail: string;
  newDropoffDatetime: string;
  overrideDailyRate: number | undefined;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  isPaid: boolean;
  paymentMethodId: string;
  emailErrorLabel: string;
  ninePmAddonId?: number;
  newOneTimeAddonIds?: number[];
  newPerDayAddonIds?: number[];
  newDropoffLocationId?: number;
  newDropoffLocationAddress?: string;
  deps: {
    bookingPort: unknown;
    configRepo: {
      getLocations: (storeId: string) => Promise<Array<{ id: number | string; deliveryCost: number; collectionCost: number }>>;
    };
  };
};

export type ExtensionOutcome =
  | { kind: 'not_found' }
  | { kind: 'error'; reason: string }
  | { kind: 'success'; extensionDays: number; extensionCost: number; outstandingBalance: number; newDropoffDatetime: string };

export function calculateExtensionDiscount(
  subtotal: number,
  discountType?: 'percentage' | 'fixed',
  discountValue?: number,
): number {
  if (subtotal <= 0 || discountValue === undefined || discountValue <= 0) return 0;
  const requested = discountType === 'percentage'
    ? subtotal * Math.min(discountValue, 100) / 100
    : discountType === 'fixed'
      ? discountValue
      : 0;
  return Math.min(subtotal, Math.round(requested * 100) / 100);
}

async function getPendingExtensionBalance(
  target: { source: 'active' | 'raw'; id: string },
  fallbackAmount: number,
): Promise<number> {
  let query = getSupabaseClient()
    .from('payments')
    .select('amount')
    .eq('payment_type', 'extension')
    .eq('settlement_status', 'pending');

  query = target.source === 'active'
    ? query.eq('order_id', target.id)
    : query.eq('raw_order_id', target.id);

  const { data, error } = await query;
  if (error) {
    console.error('[extend] Pending extension balance lookup failed:', error.message, target);
    return fallbackAmount;
  }

  return Math.round((data ?? []).reduce(
    (sum: number, payment: { amount: number | string | null }) => sum + Number(payment.amount ?? 0),
    0,
  ) * 100) / 100;
}

// ── resolveExtensionForRaw ──
// Handles extension for raw/unactivated orders (orders_raw).
// Returns `not_found` if no row matches the ref+email, `error` for validation/availability failures,
// `success` with the extension cost/days when the RPC completes.
// Side effects: DB reads, RPC write (`confirm_extend_raw_atomic`), and a fire-and-forget customer email.

export async function resolveExtensionForRaw(args: ExtensionInputs): Promise<ExtensionOutcome> {
  const {
    orderReference,
    trimmedEmail,
    newDropoffDatetime,
    overrideDailyRate,
    discountType,
    discountValue,
    isPaid,
    paymentMethodId,
    emailErrorLabel,
    deps,
  } = args;

  const sb = getSupabaseClient();
  const newDropoff = new Date(newDropoffDatetime);
  const refVariants = orderReferenceLookupVariants(orderReference);

  const { data: rawRows } = await sb
    .from('orders_raw')
    .select('id, order_reference, vehicle_model_id, store_id, dropoff_datetime, pickup_datetime, payload')
    .in('order_reference', refVariants)
    .ilike('customer_email', escapeIlike(trimmedEmail))
    .in('status', ['unprocessed', 'processed']);

  if (!rawRows || rawRows.length === 0) return { kind: 'not_found' };

  const row = rawRows[0] as Record<string, unknown>;
  const displayRef = (row.order_reference as string) || orderReference;
  const currentDropoff = new Date(row.dropoff_datetime as string);

  if (newDropoff <= currentDropoff) {
    return { kind: 'error', reason: 'New return date must be after the current return date.' };
  }

  const avail = await checkAvailability(
    { bookingPort: deps.bookingPort as never },
    { storeId: row.store_id as string, pickupDatetime: row.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime },
  );
  const model = avail.find((m) => m.modelId === (row.vehicle_model_id as string));
  if (!model || model.availableCount === 0) {
    return { kind: 'error', reason: 'Sorry, this vehicle is not available for the extended dates. Try a shorter extension or contact us on WhatsApp.' };
  }

  const locRows = await deps.configRepo.getLocations(row.store_id as string);
  const storeLoc = locRows.find((l: { deliveryCost: number; collectionCost: number }) =>
    Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0,
  );
  const locId = storeLoc ? Number(storeLoc.id) : (locRows[0] ? Number(locRows[0].id) : 1);
  const quote = await computeQuote({ configRepo: deps.configRepo as never }, {
    storeId: row.store_id as string, vehicleModelId: row.vehicle_model_id as string,
    pickupDatetime: row.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime,
    pickupLocationId: locId, dropoffLocationId: locId,
  });

  const extDays = extDayCount(currentDropoff.getTime(), newDropoff.getTime());

  let protectedDailyRate: number;
  if (overrideDailyRate !== undefined) {
    protectedDailyRate = overrideDailyRate;
  } else {
    const computedExtDailyRate = extDays > 0 ? quote.rentalSubtotal / extDays : quote.rentalSubtotal;
    const origPickup = new Date(row.pickup_datetime as string);
    const origDays = extDayCount(origPickup.getTime(), currentDropoff.getTime());
    const payload = row.payload as Record<string, unknown> | null;
    const webQuote = payload ? Number(payload.web_quote ?? 0) : 0;
    const origDailyRate = webQuote > 0 ? webQuote / origDays : 0;
    // Extension daily rate = bracket rate for the extension days, capped so the
    // customer is never charged more per day than their original rate, but if the
    // extension-days bracket is cheaper (e.g. unlocked the 7+ day bracket through
    // volume) the customer keeps that cheaper rate.
    protectedDailyRate = origDailyRate > 0 ? Math.min(computedExtDailyRate, origDailyRate) : computedExtDailyRate;
  }
  const extensionSubtotal = Math.round(protectedDailyRate * extDays * 100) / 100;
  const discountAmount = calculateExtensionDiscount(extensionSubtotal, discountType, discountValue);
  const extensionCost = Math.round((extensionSubtotal - discountAmount) * 100) / 100;

  const paymentId = crypto.randomUUID();
  const journalTxId = crypto.randomUUID();
  const now = new Date();
  const journalDate = formatManilaDate(now);
  const journalPeriod = journalDate.slice(0, 7);
  const accounts = await resolveStoreAccounts(row.store_id as string);

  const { data: rpcResult, error: rpcErr } = await sb
    .rpc('confirm_extend_raw_atomic', {
      p_order_id:          row.id as string,
      p_new_dropoff:       newDropoffDatetime,
      p_payment_id:        paymentId,
      p_store_id:          row.store_id as string,
      p_amount:            extensionCost,
      p_payment_method_id: paymentMethodId,
      p_transaction_date:  journalDate,
      p_settlement_status: isPaid ? null : 'pending',
      p_settlement_ref:    `Extension: ${formatManilaDate(currentDropoff)} → ${formatManilaDate(newDropoff)}`,
      p_raw_order_id:      row.id as string,
      p_is_paid:           isPaid,
      p_receivable_acct:   accounts?.receivableAccountId ?? null,
      p_income_acct:       accounts?.incomeAccountId ?? null,
      p_journal_tx_id:     journalTxId,
      p_journal_date:      journalDate,
      p_journal_period:    journalPeriod,
      p_ext_description:   `Extension (raw order ${row.id as string}): ${extDays} day${extDays !== 1 ? 's' : ''}${discountAmount > 0 ? `; discount ₱${discountAmount}` : ''}`,
    });

  if (rpcErr) {
    console.error('[extend-raw] RPC network error:', rpcErr.message, { rawOrderId: row.id as string, extDays });
    return { kind: 'error', reason: `Extension failed — database error: ${rpcErr.message}. Please try again or contact us on WhatsApp.` };
  }
  const extResult = rpcResult as { success: boolean; error?: string };
  if (!extResult.success) {
    console.error('[extend-raw] RPC returned failure:', extResult.error, { rawOrderId: row.id as string, extDays });
    return { kind: 'error', reason: extResult.error ?? 'Extension failed. Please try again or contact us on WhatsApp.' };
  }

  void (async () => {
    try {
      const formatManila = (iso: string) =>
        new Date(iso).toLocaleString('en-PH', {
          timeZone: 'Asia/Manila',
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      const extDaysRaw = Math.max(1, Math.ceil(
        (newDropoff.getTime() - currentDropoff.getTime()) / (1000 * 60 * 60 * 24),
      ));
      await sendEmail({
        to: trimmedEmail,
        subject: `Rental Extended — ${displayRef} | Lola's Rentals`,
        html: extendConfirmationHtml({
          customerName: trimmedEmail.split('@')[0],
          orderReference: displayRef,
          newDropoffDatetime: formatManila(newDropoffDatetime),
          extensionDays: extDaysRaw,
          extensionCost,
          whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX',
        }),
      });
    } catch (emailErr) {
      console.error(emailErrorLabel, emailErr);
    }
  })();

  const outstandingBalance = await getPendingExtensionBalance(
    { source: 'raw', id: row.id as string },
    isPaid ? 0 : extensionCost,
  );
  return { kind: 'success', extensionDays: extDays, extensionCost, outstandingBalance, newDropoffDatetime };
}

// ── resolveExtensionForActive ──
// Handles extension for activated orders (customers → orders → order_items).
// Returns `not_found` if no matching active order_item exists, `error` for validation/availability failures,
// `success` with the extension cost/days when the RPC completes.
// Side effects: DB reads, RPC write (`confirm_extend_order_atomic`), and a fire-and-forget customer email.

export async function resolveExtensionForActive(args: ExtensionInputs): Promise<ExtensionOutcome> {
  const {
    orderReference,
    trimmedEmail,
    newDropoffDatetime,
    overrideDailyRate,
    discountType,
    discountValue,
    isPaid,
    paymentMethodId,
    emailErrorLabel,
    deps,
    newOneTimeAddonIds,
    newPerDayAddonIds,
    newDropoffLocationId,
    newDropoffLocationAddress,
  } = args;

  const sb = getSupabaseClient();
  const newDropoff = new Date(newDropoffDatetime);
  const refVariants = orderReferenceLookupVariants(orderReference);

  const { data: custRows } = await sb
    .from('customers').select('id').ilike('email', escapeIlike(trimmedEmail)).limit(10);
  const custIds = (custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean);

  if (custIds.length === 0) return { kind: 'not_found' };

  const { data: orderRows } = await sb
    .from('orders')
    .select('id, customer_id, store_id, booking_token')
    .in('customer_id', custIds)
    .eq('status', 'active')
    .in('booking_token', refVariants);

  for (const ord of (orderRows ?? []) as Array<{ id: string; customer_id: string; store_id: string; booking_token: string | null }>) {
    const displayRef = ord.booking_token || orderReference;
    const { data: items } = await sb
      .from('order_items')
      .select('id, vehicle_id, pickup_datetime, dropoff_datetime, store_id, rental_days_count, rental_rate, pickup_fee, dropoff_fee, discount, dropoff_location_id')
      .eq('order_id', ord.id).not('pickup_datetime', 'is', null);

    if ((items ?? []).length > 1) {
      return {
        kind: 'error',
        reason: 'This booking contains multiple rental vehicles. Please hand it off to the team so every vehicle and the full extension balance are updated together.',
      };
    }

    const item = (items ?? [])[0] as Record<string, unknown> | undefined;
    if (!item) continue;

    const currentDropoff = new Date(item.dropoff_datetime as string);
    if (newDropoff <= currentDropoff) {
      return { kind: 'error', reason: 'New return date must be after the current return date.' };
    }

    let modelId = '';
    let vehicleName = '';
    if (item.vehicle_id) {
      const { data: veh } = await sb.from('fleet').select('model_id, name').eq('id', item.vehicle_id as string).single();
      if (veh) {
        modelId = (veh as { model_id: string; name: string }).model_id;
        vehicleName = (veh as { model_id: string; name: string }).name;
      }
    }

    if (modelId) {
      const avail = await checkAvailability(
        { bookingPort: deps.bookingPort as never },
        {
          storeId: item.store_id as string,
          pickupDatetime: item.dropoff_datetime as string,
          dropoffDatetime: newDropoffDatetime,
          excludeOrderItemId: item.id as string,
        },
      );
      const m = avail.find((a) => a.modelId === modelId);
      if (!m || m.availableCount === 0) {
        return { kind: 'error', reason: 'Sorry, this vehicle is not available for the extended dates.' };
      }
    }

    const storeId = item.store_id as string;
    const locRows = await deps.configRepo.getLocations(storeId);
    const storeLoc = locRows.find((l: { deliveryCost: number; collectionCost: number }) =>
      Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0,
    );
    const locId = storeLoc ? Number(storeLoc.id) : (locRows[0] ? Number(locRows[0].id) : 1);

    const extDays = extDayCount(currentDropoff.getTime(), newDropoff.getTime());
    const storedDailyRate = Number(item.rental_rate ?? 0);
    let extensionCost = 0;
    let effectiveDailyRate = 0;

    if (modelId) {
      let quote: Awaited<ReturnType<typeof computeQuote>>;
      try {
        quote = await computeQuote({ configRepo: deps.configRepo as never }, {
          storeId, vehicleModelId: modelId,
          pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime,
          pickupLocationId: locId, dropoffLocationId: locId,
        });
      } catch (quoteErr) {
        const msg = quoteErr instanceof Error ? quoteErr.message : String(quoteErr);
        console.error('[extend-active] computeQuote failed:', msg, { storeId, modelId, extDays, dropoff: item.dropoff_datetime, newDropoff: newDropoffDatetime });
        return { kind: 'error', reason: `Unable to calculate extension cost (${msg}). Please contact us on WhatsApp.` };
      }

      let dailyRate: number;
      if (overrideDailyRate !== undefined) {
        dailyRate = overrideDailyRate;
      } else {
        const computedExtDailyRate = extDays > 0 ? quote.rentalSubtotal / extDays : quote.rentalSubtotal;
        // Extension daily rate = bracket rate for the extension days, capped so the
        // customer is never charged more per day than their original rate, but if the
        // extension-days bracket is cheaper (unlocked by volume) the customer keeps it.
        dailyRate = storedDailyRate > 0 ? Math.min(computedExtDailyRate, storedDailyRate) : computedExtDailyRate;
      }
      effectiveDailyRate = dailyRate;
      extensionCost = Math.round(dailyRate * extDays * 100) / 100;
    } else if (overrideDailyRate !== undefined) {
      effectiveDailyRate = overrideDailyRate;
      extensionCost = Math.round(overrideDailyRate * extDays * 100) / 100;
    } else if (storedDailyRate > 0) {
      // Model ID unavailable — fall back to the stored original daily rate so the
      // extension is still charged correctly when fleet/model data is missing.
      effectiveDailyRate = storedDailyRate;
      extensionCost = Math.round(storedDailyRate * extDays * 100) / 100;
    }

    const pickup = new Date(item.pickup_datetime as string);
    const oldDays = (item.rental_days_count as number) ?? extDayCount(pickup.getTime(), currentDropoff.getTime());
    const newDays = extDayCount(pickup.getTime(), newDropoff.getTime());

    type AddonUpdate = { id: string; new_total: number; name: string; delta: number };
    const addonUpdates: AddonUpdate[] = [];
    let addonDelta = 0;
    if (oldDays !== newDays) {
      const { data: addons } = await sb
        .from('order_addons')
        .select('id, addon_name, addon_type, addon_price, quantity, total_amount')
        .eq('order_id', ord.id);
      for (const addon of (addons ?? []) as Array<Record<string, unknown>>) {
        if ((addon.addon_type as string) === 'per_day') {
          const oldTotal = Number(addon.total_amount ?? 0);
          // Derive the actual per-day rate from total_amount / oldDays.
          // Some booking paths store quantity = rentalDays (not units), so using
          // addon_price * quantity * newDays would double-count the days.
          // Dividing by oldDays is safe and consistent regardless of how quantity was stored.
          const perDayRate = oldDays > 0 ? oldTotal / oldDays : Number(addon.addon_price ?? 0);
          const newTotal = Math.round(perDayRate * newDays * 100) / 100;
          const delta = Math.round((newTotal - oldTotal) * 100) / 100;
          addonDelta += delta;
          addonUpdates.push({ id: addon.id as string, new_total: newTotal, name: addon.addon_name as string, delta });
        }
      }
    }

    // ── 9PM late-return add-on (optional, one-time fee from catalog) ──
    let ninePmCost = 0;
    let ninePmAddonRow: { id: number; name: string; price_one_time: number } | null = null;
    if (args.ninePmAddonId) {
      const { data: addonCatalog } = await sb
        .from('addons')
        .select('id, name, price_one_time')
        .eq('id', args.ninePmAddonId)
        .eq('is_active', true)
        .maybeSingle();
      if (addonCatalog) {
        ninePmAddonRow = addonCatalog as { id: number; name: string; price_one_time: number };
        ninePmCost = Number(ninePmAddonRow.price_one_time ?? 0);
      }
    }

    // ── New one-time add-ons chosen during extension (catalog IDs) ──
    type CatalogAddonRow = { id: number; name: string; price_one_time: number; addon_type: string };
    const newOneTimeRows: CatalogAddonRow[] = [];
    let newOneTimeCost = 0;
    const allNewOneTimeIds = [
      ...(newOneTimeAddonIds ?? []),
      // ninePmAddonId is handled separately above; don't double-count
    ].filter((id) => id !== args.ninePmAddonId);
    if (allNewOneTimeIds.length > 0) {
      const { data: catalogRows } = await sb
        .from('addons')
        .select('id, name, price_one_time, addon_type')
        .in('id', allNewOneTimeIds)
        .eq('is_active', true)
        .eq('addon_type', 'one_time');
      for (const row of (catalogRows ?? []) as CatalogAddonRow[]) {
        newOneTimeRows.push(row);
        newOneTimeCost += Number(row.price_one_time ?? 0);
      }
    }

    // ── New per-day add-ons (staff only) charged for extension days ──
    type PerDayCatalogRow = { id: number; name: string; price_per_day: number; addon_type: string };
    const newPerDayRows: PerDayCatalogRow[] = [];
    let newPerDayCost = 0;
    if (newPerDayAddonIds && newPerDayAddonIds.length > 0) {
      const { data: pdRows } = await sb
        .from('addons')
        .select('id, name, price_per_day, addon_type')
        .in('id', newPerDayAddonIds)
        .eq('is_active', true)
        .eq('addon_type', 'per_day');
      for (const row of (pdRows ?? []) as PerDayCatalogRow[]) {
        newPerDayRows.push(row);
        newPerDayCost += Math.round(Number(row.price_per_day ?? 0) * extDays * 100) / 100;
      }
    }

    // ── Location change: compute delta from original dropoff fee ──
    let locationDelta = 0;
    let newLocationCollectionCost = 0;
    if (newDropoffLocationId) {
      const { data: locRow } = await sb
        .from('locations')
        .select('collection_cost')
        .eq('id', newDropoffLocationId)
        .eq('is_active', true)
        .maybeSingle();
      if (locRow) {
        newLocationCollectionCost = Number((locRow as { collection_cost: number }).collection_cost ?? 0);
        const currentDropoffFee = Number(item.dropoff_fee ?? 0);
        locationDelta = Math.round((newLocationCollectionCost - currentDropoffFee) * 100) / 100;
      }
    }

    const extensionSubtotal = extensionCost + addonDelta + ninePmCost + newOneTimeCost + newPerDayCost + locationDelta;
    const discountAmount = calculateExtensionDiscount(extensionSubtotal, discountType, discountValue);
    const totalDelta = Math.round((extensionSubtotal - discountAmount) * 100) / 100;
    const paymentId = crypto.randomUUID();
    const journalTxId = crypto.randomUUID();
    const now = new Date();
    const journalDate = formatManilaDate(now);
    const journalPeriod = journalDate.slice(0, 7);
    const accounts = await resolveStoreAccounts(storeId);

    const { data: rpcResult, error: rpcErr } = await sb
      .rpc('confirm_extend_order_atomic', {
        p_order_id:          ord.id,
        p_order_item_id:     item.id as string,
        p_new_dropoff:       newDropoffDatetime,
        p_new_days:          newDays,
        p_addon_updates:     addonUpdates,
        p_total_delta:       totalDelta,
        p_payment_id:        paymentId,
        p_store_id:          storeId,
        // The pending payment drives the customer-facing outstanding balance.
        // It must match the full order delta, including recurring add-ons such
        // as Peace of Mind Cover, not only the vehicle rental charge.
        p_amount:            totalDelta,
        p_payment_method_id: paymentMethodId,
        p_transaction_date:  journalDate,
        p_settlement_status: isPaid ? null : 'pending',
        p_settlement_ref:    `Extension: ${formatManilaDate(currentDropoff)} → ${formatManilaDate(newDropoff)}`,
        p_customer_id:       ord.customer_id,
        p_order_item_id_fk:  item.id as string,
        p_is_paid:           isPaid,
        p_receivable_acct:   accounts?.receivableAccountId ?? null,
        p_income_acct:       accounts?.incomeAccountId ?? null,
        p_journal_tx_id:     journalTxId,
        p_journal_date:      journalDate,
        p_journal_period:    journalPeriod,
        p_ext_description:   `Extension: order ${ord.id} (${oldDays}→${newDays} days)${discountAmount > 0 ? `; discount ₱${discountAmount}` : ''}`,
      });

    if (rpcErr) {
      console.error('[extend-active] RPC network error:', rpcErr.message, { orderId: ord.id, itemId: item.id as string, extDays, totalDelta, storeId });
      return { kind: 'error', reason: `Extension failed — database error: ${rpcErr.message}. Please try again or contact us on WhatsApp.` };
    }
    const extResult = rpcResult as { success: boolean; error?: string };
    if (!extResult.success) {
      console.error('[extend-active] RPC returned failure:', extResult.error, { orderId: ord.id, itemId: item.id as string, extDays, newDays, totalDelta, storeId });
      return { kind: 'error', reason: extResult.error ?? 'Extension failed. Please try again or contact us on WhatsApp.' };
    }

    // Ratchet rental_rate down to the effective extension daily rate so that
    // future extensions are capped at this rate rather than the original booking
    // rate. This ensures that a customer who earned a cheaper bracket (e.g. 7+
    // days at ₱465) keeps that rate as their cap on any subsequent short extension,
    // instead of reverting to the original booking rate (e.g. ₱535).
    // Only applies to computed rates — staff overrides are one-time concessions.
    if (overrideDailyRate === undefined && effectiveDailyRate > 0 && effectiveDailyRate < Number(item.rental_rate ?? 0)) {
      await sb.from('order_items').update({ rental_rate: effectiveDailyRate }).eq('id', item.id as string);
    }

    // ── Post-RPC inserts / updates (fire sequentially, non-blocking on errors) ──

    // Insert 9PM addon row
    if (ninePmAddonRow && ninePmCost > 0) {
      await sb.from('order_addons').insert({
        id: crypto.randomUUID(),
        order_id: ord.id,
        addon_name: ninePmAddonRow.name,
        addon_price: ninePmCost,
        addon_type: 'one_time',
        quantity: 1,
        total_amount: ninePmCost,
        store_id: storeId,
      });
    }

    // Insert new one-time add-on rows
    for (const row of newOneTimeRows) {
      const price = Number(row.price_one_time ?? 0);
      await sb.from('order_addons').insert({
        id: crypto.randomUUID(),
        order_id: ord.id,
        addon_name: row.name,
        addon_price: price,
        addon_type: 'one_time',
        quantity: 1,
        total_amount: price,
        store_id: storeId,
      });
    }

    // Insert new per-day add-on rows (charged for extension days only)
    for (const row of newPerDayRows) {
      const pricePerDay = Number(row.price_per_day ?? 0);
      const total = Math.round(pricePerDay * extDays * 100) / 100;
      await sb.from('order_addons').insert({
        id: crypto.randomUUID(),
        order_id: ord.id,
        addon_name: row.name,
        addon_price: pricePerDay,
        addon_type: 'per_day',
        quantity: extDays,
        total_amount: total,
        store_id: storeId,
      });
    }

    // Update order_items dropoff location + fee if location changed
    if (newDropoffLocationId) {
      await sb
        .from('order_items')
        .update({ dropoff_location_id: String(newDropoffLocationId), dropoff_fee: newLocationCollectionCost })
        .eq('id', item.id as string);

      // Best-effort update on orders_raw (may not exist for walk-in orders)
      if (newDropoffLocationAddress || newDropoffLocationId) {
        const refVariants = orderReferenceLookupVariants(ord.booking_token ?? orderReference);
        await sb
          .from('orders_raw')
          .update({
            dropoff_location_id: newDropoffLocationId,
            ...(newDropoffLocationAddress ? { dropoff_location_address: newDropoffLocationAddress } : {}),
          })
          .in('order_reference', refVariants);
      }
    }

    // addonDelta = per-day addon adjustment for extended days (e.g. Peace of Mind × extra days).
    // It is already included in totalDelta (sent to the RPC) and must also be included
    // in totalExtensionCost so the return value, Telegram, and email all reflect the full charge.
    const totalExtensionCost = totalDelta;

    // Fire-and-forget Ops channel Telegram alert. Look up the customer name
    // from the orders row — never block the response path on this.
    void (async () => {
      try {
        const { data: cust } = await sb.from('customers').select('name').eq('id', ord.customer_id).maybeSingle();
        const customerName = (cust as { name?: string } | null)?.name ?? trimmedEmail;
        const extraLines: string[] = [];
        // Existing per-day addon adjustments (e.g. Peace of Mind for extension days)
        if (addonUpdates.length > 0) {
          for (const u of addonUpdates) {
            if (u.delta !== 0) {
              extraLines.push(`${u.name}: +₱${u.delta.toLocaleString('en-PH')} (extended days adjustment)`);
            }
          }
        }
        if (ninePmAddonRow) extraLines.push(`${ninePmAddonRow.name}: +₱${ninePmCost.toLocaleString('en-PH')}`);
        if (newOneTimeRows.length > 0) {
          for (const r of newOneTimeRows) extraLines.push(`${r.name}: +₱${Number(r.price_one_time ?? 0).toLocaleString('en-PH')}`);
        }
        if (newPerDayRows.length > 0) {
          for (const r of newPerDayRows) {
            const cost = Math.round(Number(r.price_per_day ?? 0) * extDays * 100) / 100;
            extraLines.push(`${r.name}: +₱${cost.toLocaleString('en-PH')} (${extDays} day${extDays !== 1 ? 's' : ''})`);
          }
        }
        if (newDropoffLocationId) extraLines.push(`Location change → ID ${newDropoffLocationId}${newDropoffLocationAddress ? ` (${newDropoffLocationAddress})` : ''}`);
        if (discountAmount > 0) {
          const discountLabel = discountType === 'percentage' ? `${discountValue}%` : `₱${discountValue}`;
          extraLines.push(`Discount (${discountLabel}): −₱${discountAmount.toLocaleString('en-PH')}`);
        }
        await sendTelegramAlert(
          `🔄 <b>Rental Extended</b>\n` +
            `Reference: ${escapeHtml(displayRef)}\n` +
            `Customer: ${escapeHtml(customerName)}\n` +
            `Vehicle: ${escapeHtml(vehicleName || '—')}\n` +
            `New return: ${escapeHtml(formatManilaDateTime(newDropoffDatetime))}\n` +
            `Extension cost: ₱${totalExtensionCost.toLocaleString('en-PH')}` +
            (extraLines.length > 0 ? `\n${extraLines.map((l) => escapeHtml(l)).join('\n')}` : ''),
          getTelegramChatId('ops'),
        );
      } catch (tgErr) {
        console.error('[extend-active] Telegram notify error:', tgErr);
      }
    })();

    void (async () => {
      try {
        const formatManila = (iso: string) =>
          new Date(iso).toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        await sendEmail({
          to: trimmedEmail,
          subject: `Rental Extended — ${displayRef} | Lola's Rentals`,
          html: extendConfirmationHtml({
            customerName: trimmedEmail.split('@')[0],
            orderReference: displayRef,
            newDropoffDatetime: formatManila(newDropoffDatetime),
            extensionDays: newDays - oldDays,
            extensionCost: totalExtensionCost,
            whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX',
          }),
        });
      } catch (emailErr) {
        console.error(emailErrorLabel, emailErr);
      }
    })();

    const outstandingBalance = await getPendingExtensionBalance(
      { source: 'active', id: ord.id },
      isPaid ? 0 : totalExtensionCost,
    );
    return { kind: 'success', extensionDays: newDays - oldDays, extensionCost: totalExtensionCost, outstandingBalance, newDropoffDatetime };
  }

  return { kind: 'not_found' };
}
