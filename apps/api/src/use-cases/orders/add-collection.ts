import {
  type OrderRepository,
  type OrderItemRepository,
  type FleetRepository,
  type PaymentRepository,
  type Payment,
  type AccountingPort,
  type CardSettlementRepository,
  type CardSettlement,
  type ConfigRepository,
  type JournalLeg,
  Money,
} from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';
import { lookupActivePartnerBySlug, applyPartnerBenefit } from '../../lib/partner-benefit.js';

export interface AddCollectionDeps {
  orderRepo: OrderRepository;
  orderItemRepo: OrderItemRepository;
  fleetRepo: FleetRepository;
  paymentRepo: PaymentRepository;
  accountingPort: AccountingPort;
  cardSettlementRepo: CardSettlementRepository;
  configRepo: Pick<ConfigRepository, 'getLocations'>;
}

export type TransportLeg = 'collection' | 'delivery';

export interface AddCollectionInput {
  orderId: string;
  /** `delivery` charges the pickup leg (we brought the vehicle out); defaults to `collection`. */
  kind?: TransportLeg;
  orderItemId: string;
  locationId: number;
  locationAddress?: string | null;
  paymentMethodId?: string | null;
  accountId?: string | null;
  receivableAccountId?: string;
  isCardPayment?: boolean;
  settlementRef?: string | null;
}

export interface AddCollectionResult {
  locationName: string;
  fee: number;
  isFree: boolean;
  freeReason: string | null;
  delta: number;
  finalTotal: number;
  balanceDue: number;
}

/**
 * Adds (or changes) an off-site collection/return location on an ACTIVE order,
 * independent of the Extend Return Date flow — e.g. the customer changes
 * their mind after pickup and now wants the vehicle collected instead of
 * returning it to the store themselves.
 *
 * The collection fee defaults to the configured `locations.collection_cost`
 * for the chosen location, unless the order is linked to a partner/affiliate
 * (orders.partner_ref) whose deal grants free delivery/collection for that
 * location — mirroring the same eligibility rules used when a booking is
 * first processed (see lib/partner-benefit.ts).
 *
 * With `kind: 'delivery'` the same flow sets the pickup leg instead, for when
 * staff delivered the vehicle but the booking was activated as a store pickup.
 */
export async function addCollection(
  deps: AddCollectionDeps,
  input: AddCollectionInput,
): Promise<AddCollectionResult> {
  const { orderRepo, orderItemRepo, fleetRepo, paymentRepo, accountingPort, cardSettlementRepo, configRepo } = deps;
  const isDelivery = input.kind === 'delivery';
  const label = isDelivery ? 'Delivery' : 'Collection';

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  const items = await orderItemRepo.findByOrderId(order.id);
  const item = items.find((i) => i.id === input.orderItemId);
  if (!item) throw new Error(`Order item ${input.orderItemId} not found on this order`);

  const locations = await configRepo.getLocations(order.storeId);
  const location = locations.find((l) => String(l.id) === String(input.locationId) && l.isActive !== false);
  if (!location) throw new Error('Selected location was not found or is no longer active');

  let fee = Math.round(Number((isDelivery ? location.deliveryCost : location.collectionCost) ?? 0) * 100) / 100;
  let isFree = false;
  let freeReason: string | null = null;

  const sb = getSupabaseClient();

  // ── Partner/affiliate free-collection eligibility ──
  // orders.partner_ref isn't on the Order domain entity, so look it up directly.
  if (fee > 0) {
    const { data: orderRow } = await sb
      .from('orders')
      .select('partner_ref')
      .eq('id', order.id)
      .maybeSingle();
    const partnerSlug = (orderRow as { partner_ref: string | null } | null)?.partner_ref ?? null;

    if (partnerSlug) {
      const partner = await lookupActivePartnerBySlug(partnerSlug);
      if (partner) {
        const vehicle = await fleetRepo.findById(item.vehicleId);
        const benefit = applyPartnerBenefit({
          partner,
          rentalSubtotal: 0,
          pickupFee: isDelivery ? fee : 0,
          dropoffFee: isDelivery ? 0 : fee,
          vehicleModelId: vehicle?.modelId ?? null,
          ...(isDelivery
            ? { pickupLocationId: Number(input.locationId) }
            : { dropoffLocationId: Number(input.locationId) }),
        });
        if ((isDelivery ? benefit.pickupFee : benefit.dropoffFee) === 0) {
          isFree = true;
          freeReason = `Partner benefit (${partner.name})`;
          fee = 0;
        }
      }
    }
  }

  const oldFee = Math.round(Number((isDelivery ? item.pickupFee : item.dropoffFee) ?? 0) * 100) / 100;
  const delta = Math.round((fee - oldFee) * 100) / 100;

  // order_items location id/name columns aren't part of the OrderItem domain
  // mapping (see adapters/supabase/order-item-repo.ts), so update them
  // directly — same approach the extend-booking flow uses.
  const leg = isDelivery ? 'pickup' : 'dropoff';
  const { error: itemErr } = await sb
    .from('order_items')
    .update({
      [`${leg}_location_id`]: String(input.locationId),
      [`${leg}_location`]: location.name,
      [`${leg}_fee`]: fee,
    })
    .eq('id', item.id);
  if (itemErr) throw new Error(`Failed to update ${isDelivery ? 'delivery' : 'return'} location: ${itemErr.message}`);

  // Best-effort: keep orders_raw in sync (address/receipt lookups read from here).
  if (order.bookingToken) {
    await sb
      .from('orders_raw')
      .update({
        [`${leg}_location_id`]: Number(input.locationId),
        ...(input.locationAddress?.trim() ? { [`${leg}_location_address`]: input.locationAddress.trim() } : {}),
      })
      .eq('order_reference', order.bookingToken);
  }

  if (delta !== 0) {
    order.adjustTotal(Money.php(delta));
  }

  // Record the charge, mirroring modify-addons.ts: either collected immediately
  // (payment method chosen) or left as a pending balance for later collection.
  if (delta > 0) {
    const paymentAmount = Money.php(delta);
    const isPending = !input.paymentMethodId || input.paymentMethodId === 'pending';
    const settlementRef = input.settlementRef ?? `${label} fee: ${location.name}`;
    const payment: Payment = {
      id: crypto.randomUUID(),
      storeId: order.storeId,
      orderId: order.id,
      rawOrderId: null,
      orderItemId: item.id,
      orderAddonId: null,
      paymentType: 'addon',
      amount: paymentAmount.toNumber(),
      paymentMethodId: isPending ? 'pending' : input.paymentMethodId!,
      transactionDate: formatManilaDate(),
      settlementStatus: (isPending || input.isCardPayment) ? 'pending' : null,
      settlementRef,
      customerId: order.customerId,
      accountId: isPending ? null : (input.isCardPayment ? null : (input.accountId ?? null)),
    };
    await paymentRepo.save(payment);

    if (!isPending && !input.isCardPayment && input.accountId) {
      const legs: JournalLeg[] = [
        {
          entryId: crypto.randomUUID(),
          accountId: input.accountId,
          debit: paymentAmount,
          credit: Money.zero(),
          description: `Order ${order.id} ${label.toLowerCase()} fee received`,
          referenceType: 'payment',
          referenceId: payment.id,
        },
        {
          entryId: crypto.randomUUID(),
          accountId: input.receivableAccountId!,
          debit: Money.zero(),
          credit: paymentAmount,
          description: `Order ${order.id} ${label.toLowerCase()} fee receivable reduced`,
          referenceType: 'payment',
          referenceId: payment.id,
        },
      ];
      await accountingPort.createTransaction(legs, order.storeId);
    }

    if (!isPending && input.isCardPayment) {
      const settlement: CardSettlement = {
        id: crypto.randomUUID(),
        storeId: order.storeId,
        orderId: order.id,
        customerId: order.customerId,
        paymentId: payment.id,
        name: null,
        amount: paymentAmount.toNumber(),
        refNumber: input.settlementRef ?? null,
        transactionDate: formatManilaDate(),
        forecastedDate: null,
        isPaid: false,
        dateSettled: null,
        settlementRef: null,
        netAmount: null,
        feeExpense: null,
        accountId: null,
        batchNo: null,
        createdAt: new Date(),
      };
      await cardSettlementRepo.save(settlement);
    }

    if (!isPending) {
      const allPayments = await paymentRepo.findByOrderId(order.id);
      const totalPaid = allPayments.reduce((sum, p) => sum.add(Money.php(p.amount)), Money.zero());
      order.applyPayments(totalPaid);
    }
    // When pending: adjustTotal already increased balanceDue correctly.
  }

  await orderRepo.save(order);

  return {
    locationName: location.name,
    fee,
    isFree,
    freeReason,
    delta,
    finalTotal: order.finalTotal.toNumber(),
    balanceDue: order.balanceDue.toNumber(),
  };
}
