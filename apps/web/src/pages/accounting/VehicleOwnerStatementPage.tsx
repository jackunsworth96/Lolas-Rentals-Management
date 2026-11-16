import { useEffect, useMemo, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth-store.js';
import { useBalancesV2 } from '../../api/accounting.js';
import {
  useCloseOwnerMonth,
  useOwnerStatement,
  useVehicleOwners,
  type OwnerStatementMonth,
} from '../../api/vehicle-owners.js';
import { OwnerPayoutModal } from '../../components/accounting/OwnerPayoutModal.js';
import { formatCurrency } from '../../utils/currency.js';
import { CHARITY_WALLET_ID, formatShortDate, isLiquidAccount, liquidSortKey, manilaMonth } from './account-helpers.js';

function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shortDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', timeZone: 'Asia/Manila' });
}

const KIND_LABEL: Record<string, string> = {
  share: 'Vehicle share',
  personal: 'Personal cost',
  collected: 'Collected for owner',
  paid: 'Paid to owner',
  other: 'Adjustment',
};

function Money({ value, muted }: { value: number; muted?: boolean }) {
  if (Math.abs(value) < 0.005) return <span className="text-gray-300">—</span>;
  return <span className={`tabular-nums ${value < 0 ? 'text-red-600' : muted ? 'text-gray-600' : 'text-gray-900'}`}>{formatCurrency(value)}</span>;
}

export default function VehicleOwnerStatementPage() {
  const canEdit = useAuthStore((s) => s.hasPermission)('can_edit_accounts');
  const currentPeriod = manilaMonth();
  const { data: owners = [], isLoading: ownersLoading } = useVehicleOwners();
  const [ownerId, setOwnerId] = useState('');
  const agreementId = ownerId || owners[0]?.id || '';
  const { data, isLoading, isError, error, refetch } = useOwnerStatement(agreementId);
  const closeMonth = useCloseOwnerMonth(agreementId);
  const { data: balances } = useBalancesV2('all', currentPeriod, 'full');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [showPayout, setShowPayout] = useState(false);

  const sourceAccounts = useMemo(
    () => (balances?.summary ?? [])
      .flatMap((g) => g.accounts)
      .filter((a) => isLiquidAccount(a) && a.accountId !== CHARITY_WALLET_ID)
      .sort((a, b) => liquidSortKey(a.accountId) - liquidSortKey(b.accountId)),
    [balances?.summary],
  );

  const months = useMemo(() => [...(data?.months ?? [])].reverse(), [data?.months]);

  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => { window.print(); setPrinting(false); }, 50);
    return () => clearTimeout(t);
  }, [printing]);

  function toggle(period: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period); else next.add(period);
      return next;
    });
  }

  function handleClose(period: string) {
    if (!data) return;
    const m = data.months.find((x) => x.period === period);
    const msg = `Close ${monthLabel(period)} for ${data.agreement.ownerName}?\n\n`
      + `The share of ${formatCurrency(m?.ownerShare ?? 0)} will be posted to what Lola's owes ${data.agreement.ownerName}. `
      + 'Bookings or costs added to this month afterwards will not change it.';
    if (!window.confirm(msg)) return;
    closeMonth.mutate(period);
  }

  const ownerName = data?.agreement.ownerName ?? owners.find((o) => o.id === agreementId)?.ownerName ?? 'Owner';
  const owed = data?.balanceOwed ?? 0;
  const projected = data?.projectedBalance ?? 0;

  return (
    <div className="font-lato">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/accounts" className="text-xs text-gray-500 hover:text-teal-brand print:hidden">← Accounts</Link>
          <h1 className="font-headline text-2xl text-teal-brand">Vehicle owner statement — {ownerName}</h1>
          {data && (
            <p className="mt-0.5 text-sm text-gray-500">
              Lola&apos;s keeps {data.agreement.feePct}% of each month&apos;s net (rental revenue less vehicle costs).
              Personal costs and cash paid to {ownerName} come off the balance.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {owners.length > 1 && (
            <select
              value={agreementId}
              onChange={(e) => setOwnerId(e.target.value)}
              aria-label="Owner"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {owners.map((o) => <option key={o.id} value={o.id}>{o.ownerName}</option>)}
            </select>
          )}
          <button
            onClick={() => { setExpanded(new Set(data?.months.map((m) => m.period))); setPrinting(true); }}
            disabled={!data}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-charcoal-brand hover:bg-gray-50 disabled:opacity-50"
          >
            Print statement
          </button>
          {canEdit && (
            <button
              onClick={() => setShowPayout(true)}
              disabled={!data}
              className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Record payout
            </button>
          )}
        </div>
      </div>

      {(ownersLoading || isLoading) && <div className="h-40 animate-pulse rounded-xl bg-gray-100" aria-busy />}

      {!ownersLoading && owners.length === 0 && (
        <p className="py-12 text-center text-gray-500">No vehicle owner agreements set up.</p>
      )}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-semibold">Could not load the statement.</p>
          <p className="mt-1">{(error as Error)?.message}</p>
          <button onClick={() => refetch()} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-medium hover:bg-red-100">Try again</button>
        </div>
      )}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{owed >= 0 ? `Owed to ${ownerName} now` : `${ownerName} owes Lola's`}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${owed >= 0 ? 'text-teal-brand' : 'text-red-600'}`}>{formatCurrency(Math.abs(owed))}</p>
              <p className="mt-1 text-xs text-gray-400">Closed months only</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Including open months</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${projected >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatCurrency(projected)}</p>
              <p className="mt-1 text-xs text-gray-400">Estimated share for months not closed yet</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vehicles</p>
              <p className="mt-1 text-sm text-gray-800">
                {data.vehicles.map((v) => v.name).join(', ') || 'None'}
              </p>
              <p className="mt-1 text-xs text-gray-400">Fleet rows with owner &ldquo;{ownerName}&rdquo;</p>
            </div>
          </div>

          <section className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2 text-left font-medium">Month</th>
                    <th className="px-3 py-2 text-right font-medium">Revenue</th>
                    <th className="px-3 py-2 text-right font-medium">Vehicle costs</th>
                    <th className="px-3 py-2 text-right font-medium">{data.agreement.feePct}% fee</th>
                    <th className="px-3 py-2 text-right font-medium">Owner share</th>
                    <th className="px-3 py-2 text-right font-medium">Personal</th>
                    <th className="px-3 py-2 text-right font-medium">Collected</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-3 py-2 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => {
                    const open = expanded.has(m.period);
                    const canClose = canEdit && !m.closed && m.period < currentPeriod;
                    return (
                      <Fragment key={m.period}>
                        <tr className="cursor-pointer border-b border-gray-50 hover:bg-gray-50" onClick={() => toggle(m.period)} aria-expanded={open}>
                          <td className="px-4 py-2.5 text-gray-900">
                            <span className="mr-1 inline-block w-3 text-gray-400 print:hidden">{open ? '▾' : '▸'}</span>
                            {monthLabel(m.period)}
                            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.closed ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                              {m.closed ? 'Closed' : m.period === currentPeriod ? 'In progress' : 'Not closed'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right"><Money value={m.revenue} muted /></td>
                          <td className="px-3 py-2.5 text-right"><Money value={-m.vehicleCosts} muted /></td>
                          <td className="px-3 py-2.5 text-right"><Money value={-m.fee} muted /></td>
                          <td className="px-3 py-2.5 text-right font-semibold"><Money value={m.ownerShare} /></td>
                          <td className="px-3 py-2.5 text-right"><Money value={-m.personal} muted /></td>
                          <td className="px-3 py-2.5 text-right"><Money value={m.collected} muted /></td>
                          <td className="px-3 py-2.5 text-right"><Money value={-m.paid} muted /></td>
                          <td className="px-3 py-2.5 text-right font-bold"><Money value={m.closingBalance} /></td>
                          <td className="px-3 py-2.5 text-right print:hidden" onClick={(e) => e.stopPropagation()}>
                            {canClose && (
                              <button
                                onClick={() => handleClose(m.period)}
                                disabled={closeMonth.isPending}
                                className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-teal-brand hover:bg-teal-50 disabled:opacity-50"
                              >
                                Close month
                              </button>
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-gray-100 bg-gray-50/50">
                            <td colSpan={10} className="px-4 py-4">
                              <MonthDetail month={m} ownerName={ownerName} feePct={data.agreement.feePct} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {closeMonth.error && <p className="border-t border-gray-100 px-4 py-3 text-sm text-red-600">{(closeMonth.error as Error).message}</p>}
          </section>

          <p className="mt-4 text-xs text-gray-500">
            Revenue counts the part of each booking that falls inside the month, split by time (rental rate, delivery fees and add-ons, less discounts).
            Vehicle costs are expenses and maintenance logged against one of these vehicles, so tag the vehicle when logging them.
            Balance is a running total; a negative balance means {ownerName} owes Lola&apos;s.
          </p>
        </>
      )}

      {showPayout && data && (
        <OwnerPayoutModal
          onClose={() => setShowPayout(false)}
          agreementId={data.agreement.id}
          ownerName={ownerName}
          owed={owed}
          sourceAccounts={sourceAccounts}
        />
      )}
    </div>
  );
}

function MonthDetail({ month: m, ownerName, feePct }: { month: OwnerStatementMonth; ownerName: string; feePct: number }) {
  return (
    <div className="space-y-4">
      {m.note && <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{m.note}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {m.vehicles.length > 0 && (
            <DetailTable
              title="By vehicle"
              head={['Vehicle', 'Days rented', 'Revenue', 'Costs', 'Net']}
              rows={m.vehicles.map((v) => [v.vehicleName, String(v.rentalDays), formatCurrency(v.revenue), formatCurrency(v.costs), formatCurrency(v.revenue - v.costs)])}
            />
          )}
          {m.bookings.length > 0 && (
            <DetailTable
              title="Bookings"
              head={['Vehicle', 'Pick-up', 'Return', 'Return charges (not counted)', 'Days in month', 'Revenue']}
              rows={m.bookings.map((b) => [
                b.vehicleName,
                shortDateTime(b.pickup),
                shortDateTime(b.dropoff),
                b.returnCharges ? `${formatCurrency(b.returnCharges)}${b.returnChargesNote ? ` (${b.returnChargesNote})` : ''}` : '',
                String(b.daysInMonth),
                formatCurrency(b.revenue),
              ])}
            />
          )}
          {m.costs.length > 0 && (
            <DetailTable
              title="Vehicle costs"
              head={['Date', 'Vehicle', 'Type', 'Description', 'Amount']}
              rows={m.costs.map((c) => [formatShortDate(c.date), c.vehicleName, c.category, c.description ?? '', formatCurrency(c.amount)])}
            />
          )}
          {m.ledger.length > 0 && (
            <DetailTable
              title={`Movements on ${ownerName}'s balance`}
              head={['Date', 'Type', 'Description', 'Amount']}
              rows={m.ledger.map((l) => [formatShortDate(l.date), KIND_LABEL[l.kind] ?? l.kind, l.description ?? '', formatCurrency(l.amount)])}
            />
          )}
          {m.vehicles.length === 0 && m.bookings.length === 0 && m.costs.length === 0 && m.ledger.length === 0 && (
            <p className="text-sm text-gray-400">Nothing recorded this month.</p>
          )}
        </div>

        <div className="space-y-1.5 self-start rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <Row label="Opening balance" value={m.openingBalance} />
          <Row label="Rental revenue" value={m.revenue} />
          <Row label="Less vehicle costs" value={-m.vehicleCosts} />
          <Row label={`Less ${feePct}% fee`} value={-m.fee} />
          <Row label={`${ownerName}'s share${m.closed ? '' : ' (estimate)'}`} value={m.ownerShare} strong />
          <Row label="Less personal costs" value={-m.personal} />
          {m.collected !== 0 && <Row label={`Collected for ${ownerName}`} value={m.collected} />}
          <Row label={`Less paid to ${ownerName}`} value={-m.paid} />
          {m.other !== 0 && <Row label="Adjustments" value={m.other} />}
          <div className="border-t border-gray-200 pt-1.5">
            <Row label={m.closingBalance >= 0 ? `Owed to ${ownerName}` : `${ownerName} owes Lola's`} value={Math.abs(m.closingBalance)} strong />
          </div>
          {m.closed && m.closedAt && <p className="pt-1 text-xs text-gray-400">Closed {shortDateTime(m.closedAt)}</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${value < 0 ? 'text-red-600' : ''}`}>{formatCurrency(value)}</span>
    </div>
  );
}

function DetailTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <table className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-1.5 font-medium ${i === head.length - 1 || /^(Days|Revenue|Costs|Net|Amount)/.test(h) ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-gray-100">
              {r.map((cell, i) => (
                <td key={i} className={`px-3 py-1.5 ${i === r.length - 1 || /^(Days|Revenue|Costs|Net|Amount)/.test(head[i]) ? 'text-right tabular-nums' : 'text-left'} text-gray-700`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
