import { Router } from 'express';
import { ExtendLookupRequestSchema, ExtendConfirmRequestSchema } from '@lolas/shared';
import { validateBody } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { resolveStoreAccounts } from '../adapters/supabase/maintenance-expense-rpc.js';

const router = Router();

// ── Shared helpers ──

function getDayBracketLabel(days: number): string {
  if (days <= 2) return '1–2 day rate';
  if (days <= 6) return '3–6 day rate';
  return '7+ day rate';
}

function extDayCount(msA: number, msB: number): number {
  return Math.max(1, Math.round((msB - msA) / 86400000));
}

// ── Lookup ──

router.post('/lookup', validateBody(ExtendLookupRequestSchema), async (req, res, next) => {
  try {
    const { email, orderReference } = req.body as { email: string; orderReference: string };
    const trimmedEmail = email.trim().toLowerCase();
    const sb = getSupabaseClient();

    // 1. Check orders_raw (unprocessed direct bookings)
    const { data: rawRows, error: rawErr } = await sb
      .from('orders_raw')
      .select('order_reference, vehicle_model_id, store_id, dropoff_datetime, pickup_datetime, customer_name')
      .eq('order_reference', orderReference)
      .ilike('customer_email', trimmedEmail)
      .in('status', ['unprocessed', 'processed']);

    if (rawErr) throw new Error(`orders_raw lookup failed: ${rawErr.message}`);

    if (rawRows && rawRows.length > 0) {
      const row = rawRows[0] as Record<string, unknown>;
      const modelId = row.vehicle_model_id as string;
      const storeId = row.store_id as string;

      const { data: model } = await sb.from('vehicle_models').select('name').eq('id', modelId).single();
      const { data: locs } = await sb.from('locations').select('name').eq('store_id', storeId).limit(1);

      const pickup = new Date(row.pickup_datetime as string);
      const dropoff = new Date(row.dropoff_datetime as string);
      const days = Math.max(1, Math.ceil((dropoff.getTime() - pickup.getTime()) / 86400000));

      let originalTotal = 0;
      try {
        const locRows = await req.app.locals.deps.configRepo.getLocations(storeId);
        const storeLoc = locRows.find((l: { deliveryCost: number; collectionCost: number }) =>
          Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0,
        );
        const locId = storeLoc ? Number(storeLoc.id) : (locRows[0] ? Number(locRows[0].id) : 1);
        const quote = await computeQuote({ configRepo: req.app.locals.deps.configRepo }, {
          storeId, vehicleModelId: modelId,
          pickupDatetime: row.pickup_datetime as string, dropoffDatetime: row.dropoff_datetime as string,
          pickupLocationId: locId, dropoffLocationId: locId,
        });
        originalTotal = quote.grandTotal;
      } catch { /* fallback to 0 */ }

      res.json({
        success: true,
        data: {
          found: true,
          order: {
            orderReference: row.order_reference as string,
            vehicleModelName: (model as { name: string } | null)?.name ?? 'Vehicle',
            vehicleModelId: modelId,
            storeId,
            currentDropoffDatetime: row.dropoff_datetime as string,
            pickupLocationName: (locs as { name: string }[] | null)?.[0]?.name ?? 'General Luna',
            originalTotal,
            rentalDays: days,
          },
        },
      });
      return;
    }

    // 2. Check processed orders via orders + customers
    const { data: custRows, error: cErr } = await sb
      .from('customers').select('id').ilike('email', trimmedEmail).limit(10);
    if (cErr) throw new Error(`customer lookup failed: ${cErr.message}`);
    const custIds = (custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean);

    if (custIds.length > 0) {
      const { data: orderRows, error: oErr } = await sb
        .from('orders')
        .select('id, order_date, status, customer_id')
        .in('customer_id', custIds)
        .eq('status', 'active');
      if (oErr) throw new Error(`orders lookup failed: ${oErr.message}`);

      for (const ord of (orderRows ?? []) as Array<Record<string, unknown>>) {
        const { data: items } = await sb
          .from('order_items')
          .select('vehicle_id, pickup_datetime, dropoff_datetime, store_id, order_reference, rental_days_count')
          .eq('order_id', ord.id as string)
          .not('pickup_datetime', 'is', null);

        if (!items || items.length === 0) continue;
        const item = items[0] as Record<string, unknown>;
        if ((item.order_reference as string) !== orderReference) continue;

        const storeId = item.store_id as string;
        let modelName = 'Vehicle';
        let modelId = '';

        if (item.vehicle_id) {
          const { data: veh } = await sb.from('fleet').select('model_id').eq('id', item.vehicle_id as string).single();
          if (veh) {
            modelId = (veh as { model_id: string }).model_id;
            const { data: mdl } = await sb.from('vehicle_models').select('name').eq('id', modelId).single();
            if (mdl) modelName = (mdl as { name: string }).name;
          }
        }

        const pickup = new Date(item.pickup_datetime as string);
        const dropoff = new Date(item.dropoff_datetime as string);
        const days = (item.rental_days_count as number) ?? Math.max(1, Math.ceil((dropoff.getTime() - pickup.getTime()) / 86400000));

        const { data: locs } = await sb.from('locations').select('name').eq('store_id', storeId).limit(1);

        res.json({
          success: true,
          data: {
            found: true,
            order: {
              orderReference,
              vehicleModelName: modelName,
              vehicleModelId: modelId,
              storeId,
              currentDropoffDatetime: item.dropoff_datetime as string,
              pickupLocationName: (locs as { name: string }[] | null)?.[0]?.name ?? 'General Luna',
              originalTotal: 0,
              rentalDays: days,
            },
          },
        });
        return;
      }
    }

    res.json({ success: true, data: { found: false } });
  } catch (err) {
    next(err);
  }
});

// ── Preview Extension (read-only, no DB writes) ──

router.get('/preview', async (req, res, next) => {
  try {
    const { orderReference, email, newDropoffDatetime } = req.query as {
      orderReference?: string; email?: string; newDropoffDatetime?: string;
    };

    if (!orderReference || !email || !newDropoffDatetime) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'orderReference, email, and newDropoffDatetime are required' } });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const sb = getSupabaseClient();
    const newDropoff = new Date(newDropoffDatetime);

    // ── Try orders_raw ──
    const { data: rawRows } = await sb
      .from('orders_raw')
      .select('vehicle_model_id, store_id, dropoff_datetime, pickup_datetime, payload')
      .eq('order_reference', orderReference)
      .ilike('customer_email', trimmedEmail)
      .in('status', ['unprocessed', 'processed']);

    if (rawRows && rawRows.length > 0) {
      const row = rawRows[0] as Record<string, unknown>;
      const currentDropoff = new Date(row.dropoff_datetime as string);

      if (newDropoff <= currentDropoff) {
        res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: 'New return date must be after the current return date.' } });
        return;
      }

      const avail = await checkAvailability(
        { bookingPort: req.app.locals.deps.bookingPort },
        { storeId: row.store_id as string, pickupDatetime: row.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime },
      );
      const model = avail.find((m) => m.modelId === (row.vehicle_model_id as string));
      if (!model || model.availableCount === 0) {
        res.status(409).json({ success: false, error: { code: 'NOT_AVAILABLE', message: 'Sorry, this vehicle is not available for the extended dates.' } });
        return;
      }

      const locRows = await req.app.locals.deps.configRepo.getLocations(row.store_id as string);
      const storeLoc = locRows.find((l: { deliveryCost: number; collectionCost: number }) =>
        Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0,
      );
      const locId = storeLoc ? Number(storeLoc.id) : (locRows[0] ? Number(locRows[0].id) : 1);
      const quote = await computeQuote({ configRepo: req.app.locals.deps.configRepo }, {
        storeId: row.store_id as string, vehicleModelId: row.vehicle_model_id as string,
        pickupDatetime: row.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime,
        pickupLocationId: locId, dropoffLocationId: locId,
      });

      const extDays = extDayCount(currentDropoff.getTime(), newDropoff.getTime());
      const computedExtDailyRate = extDays > 0 ? quote.rentalSubtotal / extDays : quote.rentalSubtotal;

      const origPickup = new Date(row.pickup_datetime as string);
      const origDays = extDayCount(origPickup.getTime(), currentDropoff.getTime());
      const payload = row.payload as Record<string, unknown> | null;
      const webQuote = payload ? Number(payload.web_quote ?? 0) : 0;
      const origDailyRate = webQuote > 0 ? webQuote / origDays : 0;

      const dailyRate = Math.round((origDailyRate > 0 ? Math.max(computedExtDailyRate, origDailyRate) : computedExtDailyRate) * 100) / 100;

      res.json({
        success: true,
        data: {
          extensionDays: extDays,
          dailyRate,
          extensionTotal: Math.round(dailyRate * extDays * 100) / 100,
          bracketLabel: getDayBracketLabel(extDays),
        },
      });
      return;
    }

    // ── Try processed orders ──
    const { data: custRows } = await sb.from('customers').select('id').ilike('email', trimmedEmail).limit(10);
    const custIds = (custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean);

    if (custIds.length > 0) {
      const { data: orderRows } = await sb
        .from('orders').select('id, customer_id, store_id').in('customer_id', custIds).eq('status', 'active');

      for (const ord of (orderRows ?? []) as Array<{ id: string; customer_id: string; store_id: string }>) {
        const { data: items } = await sb
          .from('order_items')
          .select('vehicle_id, pickup_datetime, dropoff_datetime, store_id, order_reference, rental_days_count, rental_rate')
          .eq('order_id', ord.id).not('pickup_datetime', 'is', null);

        const item = (items ?? []).find((i: Record<string, unknown>) => (i as { order_reference: string }).order_reference === orderReference) as Record<string, unknown> | undefined;
        if (!item) continue;

        const currentDropoff = new Date(item.dropoff_datetime as string);
        if (newDropoff <= currentDropoff) {
          res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: 'New return date must be after the current return date.' } });
          return;
        }

        let modelId = '';
        if (item.vehicle_id) {
          const { data: veh } = await sb.from('fleet').select('model_id').eq('id', item.vehicle_id as string).single();
          if (veh) modelId = (veh as { model_id: string }).model_id;
        }

        if (modelId) {
          const avail = await checkAvailability(
            { bookingPort: req.app.locals.deps.bookingPort },
            { storeId: item.store_id as string, pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime },
          );
          const m = avail.find((a) => a.modelId === modelId);
          if (!m || m.availableCount === 0) {
            res.status(409).json({ success: false, error: { code: 'NOT_AVAILABLE', message: 'Sorry, this vehicle is not available for the extended dates.' } });
            return;
          }
        }

        const storeId = item.store_id as string;
        const locRows = await req.app.locals.deps.configRepo.getLocations(storeId);
        const storeLoc = locRows.find((l: { deliveryCost: number; collectionCost: number }) =>
          Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0,
        );
        const locId = storeLoc ? Number(storeLoc.id) : (locRows[0] ? Number(locRows[0].id) : 1);

        const extDays = extDayCount(currentDropoff.getTime(), newDropoff.getTime());
        let dailyRate = 0;

        if (modelId) {
          const quote = await computeQuote({ configRepo: req.app.locals.deps.configRepo }, {
            storeId, vehicleModelId: modelId,
            pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime,
            pickupLocationId: locId, dropoffLocationId: locId,
          });
          const computedExtDailyRate = extDays > 0 ? quote.rentalSubtotal / extDays : quote.rentalSubtotal;
          const origDailyRate = Number(item.rental_rate ?? 0);
          dailyRate = Math.round((origDailyRate > 0 ? Math.max(computedExtDailyRate, origDailyRate) : computedExtDailyRate) * 100) / 100;
        }

        res.json({
          success: true,
          data: {
            extensionDays: extDays,
            dailyRate,
            extensionTotal: Math.round(dailyRate * extDays * 100) / 100,
            bracketLabel: getDayBracketLabel(extDays),
          },
        });
        return;
      }
    }

    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found. Please check the order reference and email.' } });
  } catch (err) {
    next(err);
  }
});

// ── Confirm Extension ──

router.post('/confirm', validateBody(ExtendConfirmRequestSchema), async (req, res, next) => {
  try {
    const {
      orderReference,
      email,
      newDropoffDatetime,
      overrideDailyRate,
      paymentStatus = 'unpaid',
      paymentMethod,
    } = req.body as {
      orderReference: string;
      email: string;
      newDropoffDatetime: string;
      overrideDailyRate?: number;
      paymentStatus?: 'paid' | 'unpaid';
      paymentMethod?: string;
    };

    const trimmedEmail = email.trim().toLowerCase();
    const sb = getSupabaseClient();
    const newDropoff = new Date(newDropoffDatetime);
    const isPaid = paymentStatus === 'paid';

    // Find the booking
    const { data: rawRows } = await sb
      .from('orders_raw')
      .select('id, vehicle_model_id, store_id, dropoff_datetime, pickup_datetime, payload')
      .eq('order_reference', orderReference)
      .ilike('customer_email', trimmedEmail)
      .in('status', ['unprocessed', 'processed']);

    if (rawRows && rawRows.length > 0) {
      const row = rawRows[0] as Record<string, unknown>;
      const currentDropoff = new Date(row.dropoff_datetime as string);

      if (newDropoff <= currentDropoff) {
        res.json({ success: true, data: { success: false, reason: 'New return date must be after the current return date.' } });
        return;
      }

      // Check availability for the extension window
      const avail = await checkAvailability(
        { bookingPort: req.app.locals.deps.bookingPort },
        { storeId: row.store_id as string, pickupDatetime: (row.dropoff_datetime as string), dropoffDatetime: newDropoffDatetime },
      );
      const model = avail.find((m) => m.modelId === (row.vehicle_model_id as string));
      if (!model || model.availableCount === 0) {
        res.json({ success: true, data: { success: false, reason: 'Sorry, this vehicle is not available for the extended dates. Try a shorter extension or contact us on WhatsApp.' } });
        return;
      }

      // Compute extension cost with rate-protection (or staff override)
      const locRows = await req.app.locals.deps.configRepo.getLocations(row.store_id as string);
      const storeLoc = locRows.find((l: { deliveryCost: number; collectionCost: number }) =>
        Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0,
      );
      const locId = storeLoc ? Number(storeLoc.id) : (locRows[0] ? Number(locRows[0].id) : 1);
      const quote = await computeQuote({ configRepo: req.app.locals.deps.configRepo }, {
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
      const journalDate = now.toISOString().slice(0, 10);
      const journalPeriod = journalDate.slice(0, 7);
      const accounts = await resolveStoreAccounts(row.store_id as string);

      const { data: rpcResult, error: rpcErr } = await sb
        .rpc('confirm_extend_raw_atomic', {
          p_order_id:          row.id as string,
          p_new_dropoff:       newDropoffDatetime,
          p_payment_id:        paymentId,
          p_store_id:          row.store_id as string,
          p_amount:            extensionCost,
          p_payment_method_id: isPaid ? (paymentMethod ?? 'cash') : 'pending',
          p_transaction_date:  journalDate,
          p_settlement_status: isPaid ? null : 'pending',
          p_settlement_ref:    `Extension: ${currentDropoff.toISOString().slice(0, 10)} → ${newDropoff.toISOString().slice(0, 10)}`,
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

      res.json({ success: true, data: { success: true, newDropoffDatetime, extensionCost } });
      return;
    }

    // Check processed orders (active)
    const { data: custRows } = await sb.from('customers').select('id').ilike('email', trimmedEmail).limit(10);
    const custIds = (custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean);

    if (custIds.length > 0) {
      const { data: orderRows } = await sb
        .from('orders').select('id, customer_id, store_id').in('customer_id', custIds).eq('status', 'active');

      for (const ord of (orderRows ?? []) as Array<{ id: string; customer_id: string; store_id: string }>) {
        const { data: items } = await sb
          .from('order_items')
          .select('id, vehicle_id, pickup_datetime, dropoff_datetime, store_id, order_reference, rental_days_count, rental_rate, pickup_fee, dropoff_fee, discount')
          .eq('order_id', ord.id).not('pickup_datetime', 'is', null);

        const item = (items ?? []).find((i: Record<string, unknown>) => (i as { order_reference: string }).order_reference === orderReference) as Record<string, unknown> | undefined;
        if (!item) continue;

        const currentDropoff = new Date(item.dropoff_datetime as string);
        if (newDropoff <= currentDropoff) {
          res.json({ success: true, data: { success: false, reason: 'New return date must be after the current return date.' } });
          return;
        }

        let modelId = '';
        if (item.vehicle_id) {
          const { data: veh } = await sb.from('fleet').select('model_id').eq('id', item.vehicle_id as string).single();
          if (veh) modelId = (veh as { model_id: string }).model_id;
        }

        if (modelId) {
          const avail = await checkAvailability(
            { bookingPort: req.app.locals.deps.bookingPort },
            { storeId: item.store_id as string, pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime },
          );
          const m = avail.find((a) => a.modelId === modelId);
          if (!m || m.availableCount === 0) {
            res.json({ success: true, data: { success: false, reason: 'Sorry, this vehicle is not available for the extended dates.' } });
            return;
          }
        }

        const storeId = item.store_id as string;
        const locRows = await req.app.locals.deps.configRepo.getLocations(storeId);
        const storeLoc = locRows.find((l: { deliveryCost: number; collectionCost: number }) =>
          Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0,
        );
        const locId = storeLoc ? Number(storeLoc.id) : (locRows[0] ? Number(locRows[0].id) : 1);

        const extDays = extDayCount(currentDropoff.getTime(), newDropoff.getTime());
        let extensionCost = 0;

        if (modelId) {
          const quote = await computeQuote({ configRepo: req.app.locals.deps.configRepo }, {
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

        // Build addon updates array for RPC
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
        const journalDate = now.toISOString().slice(0, 10);
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
            p_payment_method_id: isPaid ? (paymentMethod ?? 'cash') : 'pending',
            p_transaction_date:  journalDate,
            p_settlement_status: isPaid ? null : 'pending',
            p_settlement_ref:    `Extension: ${currentDropoff.toISOString().slice(0, 10)} → ${newDropoff.toISOString().slice(0, 10)}`,
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

        res.json({ success: true, data: { success: true, newDropoffDatetime, extensionCost, extensionDays: newDays - oldDays } });
        return;
      }
    }

    res.json({ success: true, data: { success: false, reason: 'Booking not found. Please check your details and try again.' } });
  } catch (err) {
    next(err);
  }
});

export { router as publicExtendRoutes };
