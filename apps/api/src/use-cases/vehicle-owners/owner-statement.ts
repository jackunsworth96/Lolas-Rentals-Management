import type { AccountingPort } from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { formatManilaDate, formatManilaPeriod, manilaMidnightMs } from '../../utils/manila-date.js';
import { createJournalEntry } from '../accounting/create-journal-entry.js';

interface AgreementRow {
  id: string;
  owner_name: string;
  fee_pct: number;
  payable_account_id: string;
  start_period: string;
  is_active: boolean;
  notes: string | null;
}

interface SettlementRow {
  period: string;
  revenue: number;
  vehicle_costs: number;
  fee: number;
  owner_share: number;
  lines: Partial<MonthLines> | null;
  note: string | null;
  created_at: string;
}

interface OrderItemRow {
  id: string;
  vehicle_id: string;
  order_id: string;
  rental_days_count: number | null;
  rental_rate: number | null;
  discount: number | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
}

interface LedgerRow {
  id: string;
  date: string;
  period: string;
  debit: number;
  credit: number;
  description: string | null;
  reference_type: string;
  reference_id: string | null;
}

export interface VehicleLine {
  vehicleId: string;
  vehicleName: string;
  rentalDays: number;
  revenue: number;
  costs: number;
}

export interface BookingLine {
  orderId: string;
  vehicleName: string;
  pickup: string | null;
  dropoff: string | null;
  daysInMonth: number;
  revenue: number;
  /** Fuel, damage and other charges at return. Shown for reference; not part of revenue. */
  returnCharges: number;
  returnChargesNote: string | null;
}

export interface CostLine {
  expenseId: string;
  date: string;
  vehicleName: string;
  category: string;
  description: string | null;
  amount: number;
}

interface MonthLines {
  vehicles: VehicleLine[];
  bookings: BookingLine[];
  costs: CostLine[];
}

export type LedgerKind = 'share' | 'personal' | 'collected' | 'paid' | 'other';

export interface LedgerLine {
  id: string;
  date: string;
  kind: LedgerKind;
  description: string | null;
  /** Positive increases what Lola's owes the owner. */
  amount: number;
}

export interface OwnerStatementMonth extends MonthLines {
  period: string;
  closed: boolean;
  closedAt: string | null;
  note: string | null;
  revenue: number;
  vehicleCosts: number;
  net: number;
  fee: number;
  ownerShare: number;
  personal: number;
  collected: number;
  paid: number;
  other: number;
  openingBalance: number;
  closingBalance: number;
  ledger: LedgerLine[];
}

export interface OwnerStatement {
  agreement: { id: string; ownerName: string; feePct: number; payableAccountId: string; startPeriod: string; notes: string | null };
  vehicles: Array<{ id: string; name: string; status: string; storeId: string }>;
  /** What the books say is owed now: closed months only. Positive = Lola's owes the owner. */
  balanceOwed: number;
  /** balanceOwed plus the estimated share of months not closed yet. */
  projectedBalance: number;
  months: OwnerStatementMonth[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function periodsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let p = from; p <= to; p = nextPeriod(p)) out.push(p);
  return out;
}

/**
 * Share of one booking that falls in [startMs, endMs), split by the exact fraction of the booking's
 * time inside the window. Unlike computeOrderItemOverlap (which rounds each period up to whole days),
 * the parts across months always add up to the booking, so an owner is never paid a day twice.
 */
function prorateBooking(oi: OrderItemRow, startMs: number, endMs: number) {
  if (!oi.pickup_datetime || !oi.dropoff_datetime) return null;
  const pickupMs = new Date(oi.pickup_datetime).getTime();
  const dropoffMs = new Date(oi.dropoff_datetime).getTime();
  if (Number.isNaN(pickupMs) || Number.isNaN(dropoffMs) || dropoffMs <= pickupMs) return null;
  const overlapMs = Math.min(dropoffMs, endMs) - Math.max(pickupMs, startMs);
  if (overlapMs <= 0) return null;
  const ratio = overlapMs / (dropoffMs - pickupMs);
  const totalBookingDays = Number(oi.rental_days_count ?? 0);
  // Owners earn on the rental only; delivery fees and add-ons belong to Lola's.
  const revenue = Number(oi.rental_rate ?? 0) * totalBookingDays * ratio
    - Number(oi.discount ?? 0) * ratio;
  return { overlapDays: totalBookingDays * ratio, totalBookingDays, revenue };
}

export function feeFor(net: number, feePct: number): number {
  return net > 0 ? round2((net * feePct) / 100) : 0;
}

function ledgerKind(referenceType: string): LedgerKind {
  switch (referenceType) {
    case 'owner_settlement': return 'share';
    case 'expense': return 'personal';
    case 'owner_collection': return 'collected';
    case 'owner_payout': return 'paid';
    default: return 'other';
  }
}

async function loadAgreement(agreementId: string): Promise<AgreementRow> {
  const { data, error } = await getSupabaseClient()
    .from('vehicle_owner_agreements')
    .select('*')
    .eq('id', agreementId)
    .maybeSingle();
  if (error) throw new Error(`Agreement lookup failed: ${error.message}`);
  if (!data) {
    const err = new Error('Vehicle owner not found') as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  return data as AgreementRow;
}

async function loadOwnerVehicles(ownerName: string) {
  const { data, error } = await getSupabaseClient()
    .from('fleet')
    .select('id, name, status, store_id')
    .eq('owner', ownerName)
    .order('name');
  if (error) throw new Error(`Owner vehicles query failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; name: string; status: string; store_id: string }>;
}

/** Revenue and vehicle costs for one month, from bookings and expenses (not yet posted). */
async function computeMonth(vehicles: Array<{ id: string; name: string }>, period: string): Promise<MonthLines> {
  const sb = getSupabaseClient();
  const startMs = manilaMidnightMs(`${period}-01`);
  const endMs = manilaMidnightMs(`${nextPeriod(period)}-01`);
  const nameById = new Map(vehicles.map((v) => [v.id, v.name]));
  const byVehicle = new Map<string, VehicleLine>(
    vehicles.map((v) => [v.id, { vehicleId: v.id, vehicleName: v.name, rentalDays: 0, revenue: 0, costs: 0 }]),
  );
  const ids = vehicles.map((v) => v.id);
  if (ids.length === 0) return { vehicles: [], bookings: [], costs: [] };

  const { data: items, error: itemsErr } = await sb
    .from('order_items')
    .select('id, vehicle_id, order_id, rental_days_count, rental_rate, discount, pickup_datetime, dropoff_datetime')
    .in('vehicle_id', ids)
    .lt('pickup_datetime', new Date(endMs).toISOString())
    .gt('dropoff_datetime', new Date(startMs).toISOString());
  if (itemsErr) throw new Error(`Bookings query failed: ${itemsErr.message}`);
  const itemRows = (items ?? []) as OrderItemRow[];

  const countedOrders = new Map<string, { returnCharges: number; returnChargesNote: string | null }>();
  const itemOrderIds = [...new Set(itemRows.map((oi) => oi.order_id))];
  if (itemOrderIds.length > 0) {
    const { data: orders, error: ordErr } = await sb
      .from('orders')
      .select('id, return_charges, return_charges_note')
      .in('id', itemOrderIds)
      .in('status', ['active', 'completed']);
    if (ordErr) throw new Error(`Orders query failed: ${ordErr.message}`);
    for (const o of (orders ?? []) as Array<{ id: string; return_charges: number | null; return_charges_note: string | null }>) {
      countedOrders.set(o.id, { returnCharges: Number(o.return_charges ?? 0), returnChargesNote: o.return_charges_note });
    }
  }

  const bookingByItem = new Map<string, BookingLine>();
  for (const oi of itemRows) {
    const order = countedOrders.get(oi.order_id);
    if (!order) continue;
    const overlap = prorateBooking(oi, startMs, endMs);
    if (!overlap) continue;
    const returnedInMonth = !!oi.dropoff_datetime
      && new Date(oi.dropoff_datetime).getTime() >= startMs && new Date(oi.dropoff_datetime).getTime() < endMs;
    const line = byVehicle.get(oi.vehicle_id)!;
    line.rentalDays += overlap.overlapDays;
    line.revenue += overlap.revenue;
    bookingByItem.set(oi.id, {
      orderId: oi.order_id,
      vehicleName: nameById.get(oi.vehicle_id) ?? oi.vehicle_id,
      pickup: oi.pickup_datetime,
      dropoff: oi.dropoff_datetime,
      daysInMonth: overlap.overlapDays,
      revenue: overlap.revenue,
      returnCharges: returnedInMonth ? order.returnCharges : 0,
      returnChargesNote: returnedInMonth ? order.returnChargesNote : null,
    });
  }

  const { data: expenses, error: expErr } = await sb
    .from('expenses')
    .select('id, date, vehicle_id, category, description, amount')
    .in('vehicle_id', ids)
    .gte('date', `${period}-01`)
    .lt('date', `${nextPeriod(period)}-01`)
    .order('date');
  if (expErr) throw new Error(`Vehicle costs query failed: ${expErr.message}`);
  const costs: CostLine[] = ((expenses ?? []) as Array<Record<string, unknown>>).map((e) => {
    const amount = Number(e.amount);
    byVehicle.get(e.vehicle_id as string)!.costs += amount;
    return {
      expenseId: e.id as string,
      date: e.date as string,
      vehicleName: nameById.get(e.vehicle_id as string) ?? (e.vehicle_id as string),
      category: e.category as string,
      description: (e.description as string | null) ?? null,
      amount,
    };
  });

  return {
    vehicles: [...byVehicle.values()]
      .map((v) => ({ ...v, rentalDays: Math.round(v.rentalDays * 10) / 10, revenue: round2(v.revenue), costs: round2(v.costs) }))
      .filter((v) => v.rentalDays > 0 || v.revenue !== 0 || v.costs !== 0),
    bookings: [...bookingByItem.values()]
      .map((b) => ({ ...b, daysInMonth: Math.round(b.daysInMonth * 10) / 10, revenue: round2(b.revenue) }))
      .sort((a, b) => (a.pickup ?? '').localeCompare(b.pickup ?? '')),
    costs,
  };
}

export async function getOwnerStatement(agreementId: string): Promise<OwnerStatement> {
  const sb = getSupabaseClient();
  const agreement = await loadAgreement(agreementId);
  const vehicles = await loadOwnerVehicles(agreement.owner_name);
  const currentPeriod = formatManilaPeriod();
  const feePct = Number(agreement.fee_pct);

  const [{ data: settlements, error: sErr }, { data: ledger, error: lErr }] = await Promise.all([
    sb.from('vehicle_owner_settlements').select('*').eq('agreement_id', agreementId),
    sb.from('journal_entries')
      .select('id, date, period, debit, credit, description, reference_type, reference_id')
      .eq('account_id', agreement.payable_account_id)
      .order('date').order('created_at'),
  ]);
  if (sErr) throw new Error(`Settlements query failed: ${sErr.message}`);
  if (lErr) throw new Error(`Ledger query failed: ${lErr.message}`);

  const settlementByPeriod = new Map(((settlements ?? []) as SettlementRow[]).map((s) => [s.period, s]));
  const ledgerRows = (ledger ?? []) as LedgerRow[];
  const lastPeriod = [currentPeriod, ...ledgerRows.map((r) => r.date.slice(0, 7))].sort().at(-1)!;
  const periods = periodsBetween(agreement.start_period, lastPeriod);

  let running = round2(ledgerRows
    .filter((r) => r.date.slice(0, 7) < agreement.start_period)
    .reduce((s, r) => s + Number(r.credit) - Number(r.debit), 0));
  let balanceOwed = running;

  const months: OwnerStatementMonth[] = [];
  for (const period of periods) {
    const settlement = settlementByPeriod.get(period);
    const lines: MonthLines = settlement
      ? { vehicles: settlement.lines?.vehicles ?? [], bookings: settlement.lines?.bookings ?? [], costs: settlement.lines?.costs ?? [] }
      : await computeMonth(vehicles, period);

    const revenue = settlement ? Number(settlement.revenue) : round2(lines.vehicles.reduce((s, v) => s + v.revenue, 0));
    const vehicleCosts = settlement ? Number(settlement.vehicle_costs) : round2(lines.costs.reduce((s, c) => s + c.amount, 0));
    const fee = settlement ? Number(settlement.fee) : feeFor(round2(revenue - vehicleCosts), feePct);
    const ownerShare = settlement ? Number(settlement.owner_share) : round2(revenue - vehicleCosts - fee);

    const monthLedger: LedgerLine[] = ledgerRows
      .filter((r) => r.date.slice(0, 7) === period)
      .map((r) => ({
        id: r.id,
        date: r.date,
        kind: ledgerKind(r.reference_type),
        description: r.description,
        amount: round2(Number(r.credit) - Number(r.debit)),
      }));
    const sumKind = (kind: LedgerKind) => round2(monthLedger.filter((l) => l.kind === kind).reduce((s, l) => s + l.amount, 0));
    const posted = round2(monthLedger.reduce((s, l) => s + l.amount, 0));
    balanceOwed = round2(balanceOwed + posted);

    const openingBalance = running;
    running = round2(running + posted + (settlement ? 0 : ownerShare));
    months.push({
      period,
      closed: !!settlement,
      closedAt: settlement?.created_at ?? null,
      note: settlement?.note ?? null,
      revenue,
      vehicleCosts,
      net: round2(revenue - vehicleCosts),
      fee,
      ownerShare,
      personal: -sumKind('personal'),
      collected: sumKind('collected'),
      paid: -sumKind('paid'),
      other: round2(sumKind('other') + sumKind('share') - (settlement ? ownerShare : 0)),
      openingBalance,
      closingBalance: running,
      ledger: monthLedger,
      ...lines,
    });
  }

  return {
    agreement: {
      id: agreement.id,
      ownerName: agreement.owner_name,
      feePct,
      payableAccountId: agreement.payable_account_id,
      startPeriod: agreement.start_period,
      notes: agreement.notes,
    },
    vehicles: vehicles.map((v) => ({ id: v.id, name: v.name, status: v.status, storeId: v.store_id })),
    balanceOwed,
    projectedBalance: running,
    months,
  };
}

export async function listOwnerAgreements() {
  const { data, error } = await getSupabaseClient()
    .from('vehicle_owner_agreements')
    .select('id, owner_name, fee_pct, start_period')
    .eq('is_active', true)
    .order('owner_name');
  if (error) throw new Error(`Agreements query failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; owner_name: string; fee_pct: number; start_period: string }>).map((a) => ({
    id: a.id, ownerName: a.owner_name, feePct: Number(a.fee_pct), startPeriod: a.start_period,
  }));
}

export async function closeOwnerMonth(input: { agreementId: string; period: string; createdBy: string | null }) {
  const agreement = await loadAgreement(input.agreementId);
  const vehicles = await loadOwnerVehicles(agreement.owner_name);
  const lines = await computeMonth(vehicles, input.period);
  const revenue = round2(lines.vehicles.reduce((s, v) => s + v.revenue, 0));
  const vehicleCosts = round2(lines.costs.reduce((s, c) => s + c.amount, 0));

  const { data, error } = await getSupabaseClient().rpc('post_vehicle_owner_settlement', {
    p_agreement_id: agreement.id,
    p_period: input.period,
    p_revenue: revenue,
    p_vehicle_costs: vehicleCosts,
    p_lines: lines,
    p_created_by: input.createdBy,
  });
  if (error) {
    const err = new Error(error.message) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  return data as { settlement_id: string; transaction_id: string | null; fee: number; owner_share: number };
}

export async function recordOwnerPayout(
  input: { agreementId: string; amount: number; fromAccountId: string; date: string; note: string; createdBy: string },
  deps: { accounting: AccountingPort },
) {
  const agreement = await loadAgreement(input.agreementId);
  const { data: account, error } = await getSupabaseClient()
    .from('chart_of_accounts')
    .select('id, account_type, is_active')
    .eq('id', input.fromAccountId)
    .maybeSingle();
  if (error) throw new Error(`Account lookup failed: ${error.message}`);
  const acc = account as { id: string; account_type: string; is_active: boolean } | null;
  if (!acc || !acc.is_active || acc.account_type !== 'Asset') {
    const err = new Error('Choose an active cash or bank account to pay from.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  if (input.date > formatManilaDate()) {
    const err = new Error('The payout date cannot be in the future.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const description = `Paid to ${agreement.owner_name}${input.note ? ` — ${input.note}` : ''}`;
  return createJournalEntry(
    {
      storeId: 'company',
      date: input.date,
      period: input.date.slice(0, 7),
      createdBy: input.createdBy,
      legs: [
        { accountId: agreement.payable_account_id, debit: input.amount, credit: 0, description, referenceType: 'owner_payout', referenceId: agreement.id },
        { accountId: acc.id, debit: 0, credit: input.amount, description, referenceType: 'owner_payout', referenceId: agreement.id },
      ],
    },
    deps,
  );
}
