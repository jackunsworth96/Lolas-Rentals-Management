import { randomUUID } from 'node:crypto';
import type { BookingPort } from '@lolas/domain';
import { checkAvailability } from '../booking/check-availability.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReturnTimeOrderItem {
  id: string;
  storeId: string;
  vehicleId: string | null;
  pickupDatetime: string;
  dropoffDatetime: string;
  rentalDaysCount: number;
}

export interface ReturnTimeOrder {
  id: string;
  status: string;
  items: ReturnTimeOrderItem[];
}

export interface ApplyReturnTimeInput {
  orderId: string;
  newDropoffDatetime: string;
  noteId: string;
  body: string;
  meta: Record<string, unknown>;
  employeeId: string | null;
}

export interface ChangeReturnTimePort {
  loadOrder(orderId: string): Promise<ReturnTimeOrder | null>;
  findVehicleModelId(vehicleId: string): Promise<string | null>;
  apply(input: ApplyReturnTimeInput): Promise<void>;
}

export interface ChangeReturnTimeDeps {
  port: ChangeReturnTimePort;
  bookingPort: BookingPort;
}

export interface ChangeReturnTimeInput {
  orderId: string;
  newDropoffDatetime: string;
  reason?: string | null;
  employeeId: string | null;
}

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

  await deps.port.apply({
    orderId: order.id,
    newDropoffDatetime: newDropoffIso,
    noteId: randomUUID(),
    body,
    meta: { oldDropoffDatetime: oldDropoffIso, newDropoffDatetime: newDropoffIso, reason },
    employeeId: input.employeeId,
  });

  return { oldDropoffDatetime: oldDropoffIso, newDropoffDatetime: newDropoffIso };
}
