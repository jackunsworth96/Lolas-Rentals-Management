import { randomUUID } from 'node:crypto';
import type { BookingPort } from '@lolas/domain';
import { checkAvailability } from '../booking/check-availability.js';
import { extensionDayCount } from '../booking/price-extension-rental.js';
import { formatManilaDate } from '../../utils/manila-date.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReturnTimeOrderItem {
  id: string;
  storeId: string;
  vehicleId: string | null;
  pickupDatetime: string;
  dropoffDatetime: string;
  rentalDaysCount: number;
  originalDropoffDatetime?: string | null;
  rentalRate?: number;
}

export interface ReturnTimeExtensionPayment {
  id: string;
  amount: number;
  pending: boolean;
}

export interface ReturnTimePerDayAddon {
  id: string;
  name: string;
  totalAmount: number;
}

export interface ReturnTimeOrder {
  id: string;
  status: string;
  items: ReturnTimeOrderItem[];
  finalTotal?: number;
  balanceDue?: number;
  extensionPayments?: ReturnTimeExtensionPayment[];
  perDayAddons?: ReturnTimePerDayAddon[];
}

export interface ApplyReturnTimeInput {
  orderId: string;
  newDropoffDatetime: string;
  noteId: string;
  body: string;
  meta: Record<string, unknown>;
  employeeId: string | null;
}

export interface ReturnTimeAddonUpdate {
  id: string;
  name: string;
  oldTotal: number;
  newTotal: number;
}

export interface ApplyReturnTimeRecalcInput extends ApplyReturnTimeInput {
  orderItemId: string;
  newDays: number;
  addonUpdates: ReturnTimeAddonUpdate[];
  reduction: number;
  /** Manila date of the new return, used to rewrite the extension's "→ date" label. */
  newToLabel: string;
}

export interface ChangeReturnTimePort {
  loadOrder(orderId: string): Promise<ReturnTimeOrder | null>;
  findVehicleModelId(vehicleId: string): Promise<string | null>;
  apply(input: ApplyReturnTimeInput): Promise<void>;
  applyWithRecalc?(input: ApplyReturnTimeRecalcInput): Promise<void>;
}

export interface PriceExtensionInput {
  storeId: string;
  modelId: string | null;
  fromIso: string;
  toIso: string;
  storedDailyRate: number;
}

export interface ChangeReturnTimeDeps {
  port: ChangeReturnTimePort;
  bookingPort: BookingPort;
  /** Rental charge for an extension span, priced like Extend. Required for recalculation. */
  priceExtension?(input: PriceExtensionInput): Promise<number>;
}

export interface ChangeReturnTimeInput {
  orderId: string;
  newDropoffDatetime: string;
  reason?: string | null;
  employeeId: string | null;
  recalculate?: boolean;
}

export type ReturnTimeRecalcPreview =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      orderItemId: string;
      oldDays: number;
      newDays: number;
      rentalDelta: number;
      addonDelta: number;
      reduction: number;
      pendingExtensionTotal: number;
      newFinalTotal: number;
      newBalanceDue: number;
      addonUpdates: ReturnTimeAddonUpdate[];
    };

function badRequest(message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { statusCode });
}

function formatManila(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPeso(n: number): string {
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

function ineligible(reason: string): ReturnTimeRecalcPreview {
  return { eligible: false, reason };
}

async function evaluateRecalc(
  deps: ChangeReturnTimeDeps,
  order: ReturnTimeOrder,
  newDropoff: Date,
): Promise<ReturnTimeRecalcPreview> {
  if (!deps.priceExtension) return ineligible('Recalculation is not available');
  if (order.status !== 'active' && order.status !== 'confirmed') {
    return ineligible('Only active or confirmed orders can have their return time changed');
  }

  const items = order.items.filter((i) => i.pickupDatetime && i.dropoffDatetime);
  if (items.length !== 1) return ineligible('Recalculation only supports orders with one rental vehicle');
  const item = items[0];

  const pickupMs = new Date(item.pickupDatetime).getTime();
  const oldDropoffMs = new Date(item.dropoffDatetime).getTime();
  const newMs = newDropoff.getTime();
  if (newMs >= oldDropoffMs) return ineligible('The return is not moving earlier');
  if (newMs <= pickupMs) return ineligible('Return time must be after pickup');

  const oldDays = item.rentalDaysCount;
  const newDays = extensionDayCount(pickupMs, newMs);
  if (newDays >= oldDays) return ineligible('The number of billed days does not change');

  const extensionPayments = order.extensionPayments ?? [];
  if (extensionPayments.some((p) => !p.pending)) {
    return ineligible('An extension on this order has already been paid; use Refund instead');
  }
  const pendingTotal = round2(extensionPayments.reduce((sum, p) => sum + p.amount, 0));
  if (pendingTotal <= 0) return ineligible('There is no unpaid extension to reduce');

  const base = item.originalDropoffDatetime ? new Date(item.originalDropoffDatetime) : null;
  if (!base || Number.isNaN(base.getTime()) || base.getTime() >= oldDropoffMs) {
    return ineligible('Could not find where the extension starts');
  }
  if (newMs < base.getTime()) {
    return ineligible(`The new return is before the original return (${formatManila(base.toISOString())}); use Refund for an early return`);
  }

  const modelId = item.vehicleId ? await deps.port.findVehicleModelId(item.vehicleId) : null;
  const priceInput = {
    storeId: item.storeId,
    modelId,
    fromIso: base.toISOString(),
    storedDailyRate: Number(item.rentalRate ?? 0),
  };
  const oldExtCost = await deps.priceExtension({ ...priceInput, toIso: new Date(oldDropoffMs).toISOString() });
  const newExtCost = newMs > base.getTime()
    ? await deps.priceExtension({ ...priceInput, toIso: newDropoff.toISOString() })
    : 0;
  const rentalDelta = Math.max(0, round2(oldExtCost - newExtCost));

  const addonUpdates: ReturnTimeAddonUpdate[] = [];
  let addonDelta = 0;
  for (const addon of order.perDayAddons ?? []) {
    const perDay = oldDays > 0 ? addon.totalAmount / oldDays : 0;
    const newTotal = round2(perDay * newDays);
    if (newTotal >= addon.totalAmount) continue;
    addonDelta += addon.totalAmount - newTotal;
    addonUpdates.push({ id: addon.id, name: addon.name, oldTotal: addon.totalAmount, newTotal });
  }
  addonDelta = round2(addonDelta);

  const reduction = Math.min(pendingTotal, round2(rentalDelta + addonDelta));
  if (reduction <= 0) return ineligible('The shorter return does not change the price');

  return {
    eligible: true,
    orderItemId: item.id,
    oldDays,
    newDays,
    rentalDelta,
    addonDelta,
    reduction,
    pendingExtensionTotal: pendingTotal,
    newFinalTotal: round2(Number(order.finalTotal ?? 0) - reduction),
    newBalanceDue: round2(Number(order.balanceDue ?? 0) - reduction),
    addonUpdates,
  };
}

export async function previewReturnTimeRecalc(
  deps: ChangeReturnTimeDeps,
  input: { orderId: string; newDropoffDatetime: string },
): Promise<ReturnTimeRecalcPreview> {
  const newDropoff = new Date(input.newDropoffDatetime);
  if (Number.isNaN(newDropoff.getTime())) throw badRequest('Invalid return datetime');
  const order = await deps.port.loadOrder(input.orderId);
  if (!order) throw badRequest('Order not found', 404);
  return evaluateRecalc(deps, order, newDropoff);
}

export async function changeReturnTime(deps: ChangeReturnTimeDeps, input: ChangeReturnTimeInput) {
  const newDropoff = new Date(input.newDropoffDatetime);
  if (Number.isNaN(newDropoff.getTime())) throw badRequest('Invalid return datetime');
  const newDropoffIso = newDropoff.toISOString();

  const order = await deps.port.loadOrder(input.orderId);
  if (!order) throw badRequest('Order not found', 404);
  if (order.status !== 'active' && order.status !== 'confirmed') {
    throw badRequest('Only active or confirmed orders can have their return time changed', 409);
  }

  const items = order.items.filter((i) => i.pickupDatetime && i.dropoffDatetime);
  if (items.length === 0) throw badRequest('Order has no rental items', 409);

  for (const item of items) {
    if (newDropoff.getTime() <= new Date(item.pickupDatetime).getTime()) {
      throw badRequest('Return time must be after pickup');
    }
    const paidUntil = new Date(item.pickupDatetime).getTime() + item.rentalDaysCount * DAY_MS;
    if (newDropoff.getTime() > paidUntil) {
      throw badRequest(
        `New return time is beyond the ${item.rentalDaysCount} paid day${item.rentalDaysCount === 1 ? '' : 's'} (latest ${formatManila(new Date(paidUntil).toISOString())}). Use Extend instead.`,
      );
    }
  }

  for (const item of items) {
    if (newDropoff.getTime() <= new Date(item.dropoffDatetime).getTime() || !item.vehicleId) continue;
    const modelId = await deps.port.findVehicleModelId(item.vehicleId);
    if (!modelId) continue;
    const avail = await checkAvailability(
      { bookingPort: deps.bookingPort },
      {
        storeId: item.storeId,
        pickupDatetime: item.dropoffDatetime,
        dropoffDatetime: newDropoffIso,
        excludeOrderItemId: item.id,
        includeHiddenFromWebsite: true,
      },
    );
    const m = avail.find((a) => a.modelId === modelId);
    if (!m || m.availableCount === 0) {
      throw badRequest('This vehicle is booked by someone else in that window, so the return cannot move later.', 409);
    }
  }

  const oldDropoffIso = items
    .map((i) => new Date(i.dropoffDatetime).toISOString())
    .reduce((latest, d) => (d > latest ? d : latest));
  const reason = input.reason?.trim() || null;
  const body = `Return time changed from ${formatManila(oldDropoffIso)} to ${formatManila(newDropoffIso)}${reason ? `. Reason: ${reason}` : ''}`;
  const meta = { oldDropoffDatetime: oldDropoffIso, newDropoffDatetime: newDropoffIso, reason };

  if (input.recalculate) {
    if (!deps.port.applyWithRecalc) throw badRequest('Recalculation is not available', 501);
    const recalc = await evaluateRecalc(deps, order, newDropoff);
    if (!recalc.eligible) throw badRequest(recalc.reason, 409);

    await deps.port.applyWithRecalc({
      orderId: order.id,
      newDropoffDatetime: newDropoffIso,
      noteId: randomUUID(),
      body: `${body}. Total reduced by ${formatPeso(recalc.reduction)} (${recalc.oldDays} → ${recalc.newDays} days)`,
      meta: {
        ...meta,
        recalculated: true,
        oldDays: recalc.oldDays,
        newDays: recalc.newDays,
        rentalDelta: recalc.rentalDelta,
        addonDelta: recalc.addonDelta,
        reduction: recalc.reduction,
      },
      employeeId: input.employeeId,
      orderItemId: recalc.orderItemId,
      newDays: recalc.newDays,
      addonUpdates: recalc.addonUpdates,
      reduction: recalc.reduction,
      newToLabel: formatManilaDate(newDropoff),
    });

    return { oldDropoffDatetime: oldDropoffIso, newDropoffDatetime: newDropoffIso, reduction: recalc.reduction };
  }

  await deps.port.apply({
    orderId: order.id,
    newDropoffDatetime: newDropoffIso,
    noteId: randomUUID(),
    body,
    meta,
    employeeId: input.employeeId,
  });

  return { oldDropoffDatetime: oldDropoffIso, newDropoffDatetime: newDropoffIso, reduction: 0 };
}
