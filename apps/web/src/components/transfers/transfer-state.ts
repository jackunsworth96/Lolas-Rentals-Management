import { moneyAmount, type TransferRow } from '../../api/transfers.js';
import { formatCurrency } from '../../utils/currency.js';

const TIMEZONE = 'Asia/Manila';

export function transferTotal(t: TransferRow): number {
  return moneyAmount(t.totalPrice);
}

export function transferDue(t: TransferRow): number {
  return Math.max(0, Math.round((transferTotal(t) - (t.amountPaid ?? 0)) * 100) / 100);
}

/** Saved driver cut, falling back to the current route config for legacy rows. */
export function transferCut(t: TransferRow): number {
  if (t.driverCut != null) return t.driverCut;
  if (t.routeDriverCut == null) return 0;
  return t.routePricingType === 'per_head' ? t.routeDriverCut * Math.max(t.paxCount, 1) : t.routeDriverCut;
}

export function transferLolasShare(t: TransferRow): number {
  return transferTotal(t) - transferCut(t);
}

export function isCancelled(t: TransferRow): boolean {
  return t.status === 'cancelled';
}

export function isSettled(t: TransferRow): boolean {
  return !!t.driverSettledAt;
}

/** Paid (fully, or the driver is holding some of it) and the trip has happened. */
export function isReadyToSettle(t: TransferRow, today: string): boolean {
  if (isCancelled(t) || isSettled(t) || t.serviceDate > today) return false;
  return (t.amountPaid ?? 0) > 0 && (transferDue(t) <= 0 || t.driverCollectedAmount > 0);
}

export function needsCollection(t: TransferRow, today: string): boolean {
  return !isCancelled(t) && !isSettled(t) && t.serviceDate <= today && transferDue(t) > 0;
}

/** Net for the driver: positive = driver hands Lola's this much, negative = Lola's pays the driver. */
export function settlementNet(t: TransferRow): number {
  return t.driverCollectedAmount - transferCut(t);
}

export type MoneyTone = 'red' | 'amber' | 'yellow' | 'green' | 'teal' | 'gray' | 'blue';

export interface MoneyState {
  label: string;
  tone: MoneyTone;
  /** Short explanation for screen readers / tooltips. */
  hint: string;
}

export function moneyState(t: TransferRow): MoneyState {
  const due = transferDue(t);
  const paid = t.amountPaid ?? 0;
  if (isCancelled(t)) return { label: 'Cancelled', tone: 'gray', hint: 'Transfer was cancelled' };
  if (isSettled(t)) return { label: 'Settled', tone: 'green', hint: 'Paid and settled with the driver' };
  if (due > 0 && paid > 0) {
    return { label: `Part paid · ${formatCurrency(due)} due`, tone: 'yellow', hint: `${formatCurrency(paid)} received so far` };
  }
  if (due > 0) {
    if (t.billedToOrder) {
      return { label: `On order · ${formatCurrency(due)}`, tone: 'blue', hint: 'Collected with the rental order balance' };
    }
    if (t.collectVia === 'driver') {
      return { label: `Driver to collect ${formatCurrency(due)}`, tone: 'amber', hint: 'Customer pays the driver directly' };
    }
    return { label: `Unpaid ${formatCurrency(due)}`, tone: 'red', hint: "Customer pays Lola's" };
  }
  if (t.driverCollectedAmount > 0) {
    return { label: `Driver holds ${formatCurrency(t.driverCollectedAmount)}`, tone: 'amber', hint: "Driver collected the fare and owes Lola's at settlement" };
  }
  return { label: 'Paid at shop', tone: 'teal', hint: "Lola's collected the fare" };
}

export const MONEY_TONE_CLASSES: Record<MoneyTone, string> = {
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  yellow: 'bg-yellow-50 text-yellow-800 ring-yellow-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  teal: 'bg-teal-50 text-teal-800 ring-teal-200',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
};

export type PrimaryAction = 'receive' | 'driver-collected' | 'settle' | 'notify' | null;

export function primaryAction(t: TransferRow, today: string): PrimaryAction {
  if (isCancelled(t) || isSettled(t)) return null;
  if (transferDue(t) > 0) {
    return t.collectVia === 'driver' && !t.billedToOrder ? 'driver-collected' : 'receive';
  }
  if (isReadyToSettle(t, today)) return 'settle';
  if (t.serviceDate >= today && !t.driverConfirmed) return 'notify';
  return null;
}

/** "IAO AIRPORT to GENERAL LUNA" -> "IAO → GL". */
export function shortRoute(route: string): string {
  const parts = route.split(/\s*(?:→|->|\bto\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return route;
  const abbr = (p: string) => {
    const k = p.toLowerCase();
    if (k.includes('iao') || k.includes('airport')) return 'IAO';
    if (k.includes('general luna') || k === 'gl') return 'GL';
    return p;
  };
  return `${abbr(parts[0])} → ${abbr(parts[parts.length - 1])}`;
}

/** The customer is picked up from their accommodation (GL → IAO). */
export function isFromAccommodation(route: string): boolean {
  const first = route.split(/\s*(?:→|->|\bto\b)\s*/i)[0]?.trim().toLowerCase() ?? '';
  return first.includes('luna') || first.includes('general');
}

/** "10:00:00" -> "10:00". */
export function hhmm(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

export function pickupWindow(t: TransferRow): string | null {
  const from = hhmm(t.pickupTime);
  if (!from) return null;
  const to = hhmm(t.pickupTimeEnd);
  return to ? `${from}–${to}` : from;
}

/** Flight time stored either as "HH:MM" or a full ISO timestamp; shown as Manila HH:MM. */
export function flightTimeLabel(flightTime: string | null | undefined): string | null {
  if (!flightTime) return null;
  const plain = hhmm(flightTime);
  if (plain && /^\d{1,2}:\d{2}(:\d{2})?$/.test(flightTime.trim())) return plain;
  const d = new Date(flightTime);
  if (Number.isNaN(d.getTime())) return flightTime;
  return d.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "Sun, Nov 15" with Today / Tomorrow / Yesterday when close. */
export function serviceDateLabel(serviceDate: string, today: string): string {
  const dayMs = 86_400_000;
  const diff = Math.round((Date.parse(`${serviceDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayMs);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return new Date(`${serviceDate}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(serviceDate.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  });
}

export function customerTypeLabel(t: TransferRow): { label: string; tone: 'blue' | 'purple' | 'teal' } {
  if (t.orderId) return { label: 'Renter', tone: 'teal' };
  if (t.customerType === 'Online') return { label: 'Online', tone: 'purple' };
  return { label: 'Walk-in', tone: 'blue' };
}

export function settlementStatement(rows: TransferRow[], storeName: string): string {
  const lines = rows.map((t) => {
    const cut = transferCut(t);
    const held = t.driverCollectedAmount;
    const who = held > 0 ? `driver collected ${formatCurrency(held)}` : "paid at Lola's";
    return `${t.serviceDate}  ${t.customerName} (${shortRoute(t.route)}, ${t.paxCount} pax): cut ${formatCurrency(cut)}, ${who}`;
  });
  const cuts = rows.reduce((s, t) => s + transferCut(t), 0);
  const held = rows.reduce((s, t) => s + t.driverCollectedAmount, 0);
  const net = held - cuts;
  return [
    `${storeName} — driver settlement`,
    ...lines,
    '',
    `Driver cuts: ${formatCurrency(cuts)}`,
    `Fares the driver collected: ${formatCurrency(held)}`,
    net >= 0
      ? `Driver hands over: ${formatCurrency(net)}`
      : `Lola's pays the driver: ${formatCurrency(-net)}`,
  ].join('\n');
}
