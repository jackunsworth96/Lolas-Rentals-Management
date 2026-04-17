import { getSupabaseClient } from '../adapters/supabase/client.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { resolveStoreAccounts } from '../adapters/supabase/maintenance-expense-rpc.js';
import { sendEmail, extendConfirmationHtml } from '../services/email.js';
import { formatManilaDate } from '../utils/manila-date.js';

// ── Shared helpers (exported for reuse by the main route file) ──

export function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export function extDayCount(msA: number, msB: number): number {
  return Math.max(1, Math.round((msB - msA) / 86400000));
}

// ── Extension resolver types ──

export type ExtensionInputs = {
  orderReference: string;
  trimmedEmail: string;
  newDropoffDatetime: string;
  overrideDailyRate: number | undefined;
  isPaid: boolean;
  paymentMethodId: string;
  emailErrorLabel: string;
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
  | { kind: 'success'; extensionDays: number; extensionCost: number; newDropoffDatetime: string };

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
    isPaid,
    paymentMethodId,
    emailErrorLabel,
    deps,
  } = args;

  const sb = getSupabaseClient();
  const newDropoff = new Date(newDropoffDatetime);

  const { data: rawRows } = await sb
    .from('orders_raw')
    .select('id, vehicle_model_id, store_id, dropoff_datetime, pickup_datetime, payload')
    .eq('order_reference', orderReference)
    .ilike('customer_email', escapeIlike(trimmedEmail))
    .in('status', ['unprocessed', 'processed']);

  if (!rawRows || rawRows.length === 0) return { kind: 'not_found' };

  const row = rawRows[0] as Record<string, unknown>;
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
    protectedDailyRate = origDailyRate > 0 ? Math.max(computedExtDailyRate, origDailyRate) : computedExtDailyRate;
  }
  const extensionCost = Math.round(protectedDailyRate * extDays * 100) / 100;

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
      p_ext_description:   `Extension (raw order ${row.id as string}): ${extDays} day${extDays !== 1 ? 's' : ''}`,
    });

  if (rpcErr) throw new Error(`Extend RPC failed: ${rpcErr.message}`);
  const extResult = rpcResult as { success: boolean; error?: string };
  if (!extResult.success) throw new Error(extResult.error ?? 'Extend failed');

  void (async () => {
    try {
      const formatManila = (iso: string) =>
        new Date(iso).toLocaleString('en-PH', {
          timeZone: 'Asia/Manila',
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      const extDaysRaw = Math.max(1, Math.round(
        (newDropoff.getTime() - currentDropoff.getTime()) / (1000 * 60 * 60 * 24),
      ));
      await sendEmail({
        to: trimmedEmail,
        subject: `Rental Extended — ${orderReference} | Lola's Rentals`,
        html: extendConfirmationHtml({
          customerName: trimmedEmail.split('@')[0],
          orderReference,
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

  return { kind: 'success', extensionDays: extDays, extensionCost, newDropoffDatetime };
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
    isPaid,
    paymentMethodId,
    emailErrorLabel,
    deps,
  } = args;

  const sb = getSupabaseClient();
  const newDropoff = new Date(newDropoffDatetime);

  const { data: custRows } = await sb
    .from('customers').select('id').ilike('email', escapeIlike(trimmedEmail)).limit(10);
  const custIds = (custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean);

  if (custIds.length === 0) return { kind: 'not_found' };

  const { data: orderRows } = await sb
    .from('orders').select('id, customer_id, store_id').in('customer_id', custIds).eq('status', 'active');

  for (const ord of (orderRows ?? []) as Array<{ id: string; customer_id: string; store_id: string }>) {
    const { data: items } = await sb
      .from('order_items')
      .select('id, vehicle_id, pickup_datetime, dropoff_datetime, store_id, order_reference, rental_days_count, rental_rate, pickup_fee, dropoff_fee, discount')
      .eq('order_id', ord.id).not('pickup_datetime', 'is', null);

    const item = (items ?? []).find(
      (i: Record<string, unknown>) => (i as { order_reference: string }).order_reference === orderReference,
    ) as Record<string, unknown> | undefined;
    if (!item) continue;

    const currentDropoff = new Date(item.dropoff_datetime as string);
    if (newDropoff <= currentDropoff) {
      return { kind: 'error', reason: 'New return date must be after the current return date.' };
    }

    let modelId = '';
    if (item.vehicle_id) {
      const { data: veh } = await sb.from('fleet').select('model_id').eq('id', item.vehicle_id as string).single();
      if (veh) modelId = (veh as { model_id: string }).model_id;
    }

    if (modelId) {
      const avail = await checkAvailability(
        { bookingPort: deps.bookingPort as never },
        { storeId: item.store_id as string, pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime },
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
    let extensionCost = 0;

    if (modelId) {
      const quote = await computeQuote({ configRepo: deps.configRepo as never }, {
        storeId, vehicleModelId: modelId,
        pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime,
        pickupLocationId: locId, dropoffLocationId: locId,
      });

      let dailyRate: number;
      if (overrideDailyRate !== undefined) {
        dailyRate = overrideDailyRate;
      } else {
        const computedExtDailyRate = extDays > 0 ? quote.rentalSubtotal / extDays : quote.rentalSubtotal;
        const origDailyRate = Number(item.rental_rate ?? 0);
        dailyRate = origDailyRate > 0 ? Math.max(computedExtDailyRate, origDailyRate) : computedExtDailyRate;
      }
      extensionCost = Math.round(dailyRate * extDays * 100) / 100;
    }

    const pickup = new Date(item.pickup_datetime as string);
    const oldDays = (item.rental_days_count as number) ?? extDayCount(pickup.getTime(), currentDropoff.getTime());
    const newDays = extDayCount(pickup.getTime(), newDropoff.getTime());

    const addonUpdates: Array<{ id: string; new_total: number }> = [];
    let addonDelta = 0;
    if (oldDays !== newDays) {
      const { data: addons } = await sb
        .from('order_addons')
        .select('id, addon_type, addon_price, quantity, total_amount')
        .eq('order_id', ord.id);
      for (const addon of (addons ?? []) as Array<Record<string, unknown>>) {
        if ((addon.addon_type as string) === 'per_day') {
          const newTotal = Number(addon.addon_price ?? 0) * Number(addon.quantity ?? 1) * newDays;
          addonDelta += newTotal - Number(addon.total_amount ?? 0);
          addonUpdates.push({ id: addon.id as string, new_total: newTotal });
        }
      }
    }

    const totalDelta = extensionCost + addonDelta;
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
        p_addon_updates:     JSON.stringify(addonUpdates),
        p_total_delta:       totalDelta,
        p_payment_id:        paymentId,
        p_store_id:          storeId,
        p_amount:            extensionCost,
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
        p_ext_description:   `Extension: order ${ord.id} (${oldDays}→${newDays} days)`,
      });

    if (rpcErr) throw new Error(`Extend RPC failed: ${rpcErr.message}`);
    const extResult = rpcResult as { success: boolean; error?: string };
    if (!extResult.success) throw new Error(extResult.error ?? 'Extend failed');

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
          subject: `Rental Extended — ${orderReference} | Lola's Rentals`,
          html: extendConfirmationHtml({
            customerName: trimmedEmail.split('@')[0],
            orderReference,
            newDropoffDatetime: formatManila(newDropoffDatetime),
            extensionDays: newDays - oldDays,
            extensionCost,
            whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX',
          }),
        });
      } catch (emailErr) {
        console.error(emailErrorLabel, emailErr);
      }
    })();

    return { kind: 'success', extensionDays: newDays - oldDays, extensionCost, newDropoffDatetime };
  }

  return { kind: 'not_found' };
}
