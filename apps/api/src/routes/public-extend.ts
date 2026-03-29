import { Router } from 'express';
import { ExtendLookupRequestSchema, ExtendConfirmRequestSchema } from '@lolas/shared';
import { validateBody } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { computeQuote } from '../use-cases/booking/compute-quote.js';
import { checkAvailability } from '../use-cases/booking/check-availability.js';
import { resolveStoreAccounts } from '../adapters/supabase/maintenance-expense-rpc.js';
import type { Payment, JournalLeg } from '@lolas/domain';
import { Money } from '@lolas/domain';

const router = Router();

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

// ── Confirm Extension ──

router.post('/confirm', validateBody(ExtendConfirmRequestSchema), async (req, res, next) => {
  try {
    const { orderReference, email, newDropoffDatetime } = req.body as {
      orderReference: string; email: string; newDropoffDatetime: string;
    };
    const trimmedEmail = email.trim().toLowerCase();
    const sb = getSupabaseClient();
    const newDropoff = new Date(newDropoffDatetime);

    // Find the booking
    const { data: rawRows } = await sb
      .from('orders_raw')
      .select('id, vehicle_model_id, store_id, dropoff_datetime, pickup_datetime')
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

      // Compute extension cost
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

      // Update the booking
      const { error: updErr } = await sb
        .from('orders_raw')
        .update({ dropoff_datetime: newDropoffDatetime })
        .eq('id', row.id as string);
      if (updErr) throw new Error(`Failed to update booking: ${updErr.message}`);

      res.json({ success: true, data: { success: true, newDropoffDatetime, extensionCost: quote.rentalSubtotal } });
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

        let extensionCost = 0;
        if (modelId) {
          const quote = await computeQuote({ configRepo: req.app.locals.deps.configRepo }, {
            storeId, vehicleModelId: modelId,
            pickupDatetime: item.dropoff_datetime as string, dropoffDatetime: newDropoffDatetime,
            pickupLocationId: locId, dropoffLocationId: locId,
          });
          extensionCost = quote.rentalSubtotal;
        }

        const pickup = new Date(item.pickup_datetime as string);
        const oldDays = (item.rental_days_count as number) ?? Math.max(1, Math.ceil((currentDropoff.getTime() - pickup.getTime()) / 86400000));
        const newDays = Math.max(1, Math.ceil((newDropoff.getTime() - pickup.getTime()) / 86400000));

        // 1. Update order item dates
        const { error: updErr } = await sb
          .from('order_items')
          .update({ dropoff_datetime: newDropoffDatetime, rental_days_count: newDays })
          .eq('id', item.id as string);
        if (updErr) throw new Error(`Failed to update order item: ${updErr.message}`);

        // 2. Recalculate per-day add-on costs if day count changed
        let addonDelta = 0;
        if (oldDays !== newDays) {
          const { data: addons } = await sb
            .from('order_addons')
            .select('id, addon_type, addon_price, quantity, total_amount')
            .eq('order_id', ord.id);

          for (const addon of (addons ?? []) as Array<Record<string, unknown>>) {
            if ((addon.addon_type as string) === 'per_day') {
              const oldTotal = Number(addon.total_amount ?? 0);
              const newTotal = Number(addon.addon_price ?? 0) * Number(addon.quantity ?? 1) * newDays;
              addonDelta += newTotal - oldTotal;
              await sb.from('order_addons').update({ total_amount: newTotal }).eq('id', addon.id as string);
            }
          }
        }

        // 3. Update order final_total and balance_due
        const totalDelta = extensionCost + addonDelta;
        if (totalDelta > 0) {
          const { orderRepo } = req.app.locals.deps;
          const order = await orderRepo.findById(ord.id);
          if (order) {
            order.adjustTotal(Money.php(totalDelta));
            await orderRepo.save(order);
          }
        }

        // 4. Create extension payment record (pending — staff collects later)
        if (extensionCost > 0) {
          const { paymentRepo } = req.app.locals.deps;
          const payment: Payment = {
            id: crypto.randomUUID(),
            storeId,
            orderId: ord.id,
            rawOrderId: null,
            orderItemId: item.id as string,
            orderAddonId: null,
            paymentType: 'extension',
            amount: extensionCost,
            paymentMethodId: 'pending',
            transactionDate: new Date().toISOString().slice(0, 10),
            settlementStatus: 'pending',
            settlementRef: `Extension: ${currentDropoff.toISOString().slice(0, 10)} → ${newDropoff.toISOString().slice(0, 10)}`,
            customerId: ord.customer_id,
            accountId: null,
          };
          await paymentRepo.save(payment);

          // 5. Journal entry: debit receivable, credit rental income
          const accounts = await resolveStoreAccounts(storeId);
          if (accounts.receivableAccountId && accounts.incomeAccountId) {
            const { accountingPort } = req.app.locals.deps;
            const extAmount = Money.php(extensionCost);
            const legs: JournalLeg[] = [
              {
                entryId: crypto.randomUUID(),
                accountId: accounts.receivableAccountId,
                debit: extAmount,
                credit: Money.zero(),
                description: `Extension: order ${ord.id} (${oldDays}→${newDays} days)`,
                referenceType: 'extension',
                referenceId: payment.id,
              },
              {
                entryId: crypto.randomUUID(),
                accountId: accounts.incomeAccountId,
                debit: Money.zero(),
                credit: extAmount,
                description: `Extension rental income: order ${ord.id}`,
                referenceType: 'extension',
                referenceId: payment.id,
              },
            ];
            await accountingPort.createTransaction(legs, storeId);
          }
        }

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
