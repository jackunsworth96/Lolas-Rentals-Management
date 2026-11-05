import { useEffect, useMemo, useState } from 'react';
import {
  SURF_RACK_PRODUCT, useAvailabilityFinder,
  type AvailabilityFinderResult, type FinderProduct, type FinderVehicleRow,
} from '../../api/fleet.js';
import { Modal } from '../common/Modal.js';

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ORDINAL = ['1st', '2nd', '3rd'];
const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}th`;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(fromIso: string, untilIso: string): string {
  const ms = Date.parse(untilIso) - Date.parse(fromIso);
  if (ms < DAY_MS) {
    const hours = Math.max(0, Math.floor(ms / HOUR_MS));
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms - days * DAY_MS) / HOUR_MS);
  return `${days} day${days === 1 ? '' : 's'}${hours > 0 ? ` ${hours}h` : ''}`;
}

/** "Free for 5 days (until Mon 10 Nov, 09:00)" / "No upcoming bookings". */
function freeForLabel(fromIso: string | null, untilIso: string | null): string {
  if (!fromIso) return '—';
  if (!untilIso) return 'No upcoming bookings';
  return `${formatDuration(fromIso, untilIso)} (until ${formatWhen(untilIso)})`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function NowCell({ row }: { row: FinderVehicleRow }) {
  const ref = row.reference ? ` · ${row.reference}` : '';
  const who = row.customerName ? ` · ${row.customerName}` : '';
  let main: React.ReactNode;
  switch (row.state) {
    case 'free':
      main = <span className="font-medium text-green-700">Free</span>;
      break;
    case 'on_rent':
      main = <span className="text-gray-800">On rent{ref}{row.returnAt ? ` · back ${formatWhen(row.returnAt)}` : ''}</span>;
      break;
    case 'overdue':
      main = <span className="font-medium text-red-700">Overdue{ref}{row.returnAt ? ` · was due ${formatWhen(row.returnAt)}` : ''}</span>;
      break;
    case 'awaiting_pickup':
      main = <span className="text-gray-800">Booked, awaiting pickup{ref}</span>;
      break;
    case 'walk_in':
      main = <span className="text-gray-800">Walk-in reserved{ref}{who}</span>;
      break;
    case 'owner_use':
      main = <span className="text-amber-800">Owner use{row.customerName ? ` · ${row.customerName}` : ''}{row.returnAt ? ` · until ${formatWhen(row.returnAt)}` : ' · no end date'}</span>;
      break;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {main}
      {row.protectedFor && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300">
          Protected for {row.protectedFor.partnerName ?? 'a partner'}
        </span>
      )}
      {row.heldForBooking && (
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-800 ring-1 ring-purple-300">
          Held for an unassigned booking
        </span>
      )}
    </div>
  );
}

function ProductBoard({ product, from, defaultOpen }: { product: FinderProduct; from: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const isNow = Date.parse(from) - Date.now() < 15 * 60 * 1000;
  const atLabel = isNow ? 'now' : `on ${formatWhen(from)}`;
  const summary = [
    `${product.totalUnits} unit${product.totalUnits === 1 ? '' : 's'}`,
    `${product.freeNow} free ${atLabel}`,
    product.protectedNow > 0 ? `${product.protectedNow} protected for partners` : null,
    product.heldNow > 0 ? `${product.heldNow} held for unassigned bookings` : null,
    product.backToday > 0 ? `${product.backToday} more back today` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="rounded-lg border border-gray-200">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left">
        <span className="font-semibold text-gray-900">
          {product.modelName}
          {product.hiddenFromWebsite && <span className="ml-2 text-xs font-normal text-gray-500">(back office only)</span>}
        </span>
        <span className="text-sm text-gray-600">{summary} <span className="ml-1 text-gray-400">{open ? '▲' : '▼'}</span></span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4">
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-3 font-medium">Vehicle</th>
                <th className="py-1.5 pr-3 font-medium">{isNow ? 'Now' : `On ${formatWhen(from)}`}</th>
                <th className="py-1.5 pr-3 font-medium">Next free from</th>
                <th className="py-1.5 font-medium">Free for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {product.vehicles.map((row) => (
                <tr key={row.vehicleId} className={row.protectedFor ? 'bg-amber-50' : row.heldForBooking ? 'bg-purple-50/50' : ''}>
                  <td className="py-1.5 pr-3 font-medium text-gray-900">{row.vehicleName}</td>
                  <td className="py-1.5 pr-3"><NowCell row={row} /></td>
                  <td className="py-1.5 pr-3 text-gray-700">
                    {row.nextFreeAt == null ? 'No end date' : row.nextFreeAt === from ? (isNow ? 'Now' : 'Already free') : formatWhen(row.nextFreeAt)}
                  </td>
                  <td className="py-1.5 text-gray-700">{freeForLabel(row.nextFreeAt, row.freeUntil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {product.unassignedBookings.length > 0 && (
            <div className="mt-3 rounded-md bg-purple-50 px-3 py-2 text-xs text-purple-900">
              <p className="font-semibold">Website bookings not yet given a vehicle (next 14 days)</p>
              <ul className="mt-1 space-y-0.5">
                {product.unassignedBookings.map((b, i) => (
                  <li key={b.rawOrderId ?? i}>
                    {b.reference ?? 'Booking'}{b.customerName ? ` · ${b.customerName}` : ''} · {formatWhen(b.pickupAt)} to {formatWhen(b.dropoffAt)}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-purple-700">These need a {product.modelName} each, so the system keeps enough free for them.</p>
            </div>
          )}
          {product.basketHolds > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              {product.basketHolds} customer{product.basketHolds === 1 ? ' is' : 's are'} checking out on the website right now and briefly holding a unit.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function SearchAnswer({ result }: { result: AvailabilityFinderResult }) {
  const s = result.search;
  if (!s) return null;
  const missing = s.quantity - s.answers.length;
  const isRack = s.product === SURF_RACK_PRODUCT;
  return (
    <section className="rounded-lg border-2 border-teal-200 bg-teal-50/50 p-4">
      <h3 className="font-semibold text-gray-900">
        {s.quantity} × {s.productName} for {s.days} day{s.days === 1 ? '' : 's'}
        {s.partnerId && <span className="ml-2 text-sm font-normal text-gray-600">(for {result.partners.find((p) => p.partnerId === s.partnerId)?.partnerName ?? 'partner'})</span>}
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {s.answers.map((a) => (
          <li key={a.unit} className="flex flex-wrap items-baseline gap-x-3">
            <span className="w-10 font-semibold text-gray-500">{ordinal(a.unit)}</span>
            <span className={`w-48 font-semibold ${a.readyNow ? 'text-green-700' : 'text-gray-900'}`}>
              {a.readyNow ? 'Ready now' : formatWhen(a.startsAt)}
            </span>
            {!isRack && <span className="font-medium text-gray-800">{a.vehicleName ?? 'Any unit'}</span>}
            {!isRack && <span className="text-gray-600">{a.freeUntil ? `free for ${freeForLabel(a.startsAt, a.freeUntil)}` : 'no upcoming bookings'}</span>}
          </li>
        ))}
        {missing > 0 && (
          <li className="flex gap-x-3 text-red-700">
            <span className="w-10 font-semibold">{ordinal(s.answers.length + 1)}{missing > 1 ? '+' : ''}</span>
            <span>Not available within the next 60 days for this length of rental.</span>
          </li>
        )}
      </ul>
      {s.quantity > 1 && s.allTogetherAt && (
        <p className="mt-2 text-sm font-medium text-gray-800">All {s.quantity} together from {formatWhen(s.allTogetherAt)}.</p>
      )}
      {s.protectedBy.length > 0 && (
        <p className="mt-2 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900">
          Bikes protected for {s.protectedBy.map((p) => p.partnerName).join(' and ')} are not offered here.
          If this customer is their guest, choose them under “Booking for”.
        </p>
      )}
    </section>
  );
}

export function AvailabilityFinderModal({ open, onClose, storeId }: Props) {
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [days, setDays] = useState(1);
  const [fromMode, setFromMode] = useState<'now' | 'date'>('now');
  const [fromLocal, setFromLocal] = useState('');
  const [partnerId, setPartnerId] = useState('');

  const params = useDebounced({ product, quantity, days, fromMode, fromLocal, partnerId }, 300);
  const result = useAvailabilityFinder({
    storeId,
    product: params.product || undefined,
    quantity: Math.min(20, Math.max(1, params.quantity || 1)),
    days: Math.min(60, Math.max(1, params.days || 1)),
    from: params.fromMode === 'date' && params.fromLocal ? `${params.fromLocal}:00+08:00` : undefined,
    partnerId: params.partnerId || undefined,
    enabled: open,
  });
  const data = result.data;

  useEffect(() => {
    if (!product && data?.products[0]) setProduct(data.products[0].modelId);
  }, [data, product]);

  const partnerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of data?.partners ?? []) seen.set(p.partnerId, p.partnerName);
    return [...seen];
  }, [data]);

  const inputCls = 'mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm';

  return (
    <Modal open={open} onClose={onClose} title="Find availability" size="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-3">
          <label className="text-sm text-gray-700">What
            <select value={product} onChange={(e) => setProduct(e.target.value)} className={inputCls}>
              {(data?.products ?? []).map((p) => <option key={p.modelId} value={p.modelId}>{p.modelName}</option>)}
              <option value={SURF_RACK_PRODUCT}>Surf rack</option>
            </select>
          </label>
          <label className="text-sm text-gray-700">How many
            <input type="number" min={1} max={20} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={`${inputCls} w-20`} />
          </label>
          <label className="text-sm text-gray-700">For (days)
            <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputCls} w-20`} />
          </label>
          <label className="text-sm text-gray-700">From
            <select value={fromMode} onChange={(e) => setFromMode(e.target.value as 'now' | 'date')} className={inputCls}>
              <option value="now">Now</option>
              <option value="date">A date…</option>
            </select>
          </label>
          {fromMode === 'date' && (
            <label className="text-sm text-gray-700">Date
              <input type="datetime-local" value={fromLocal} onChange={(e) => setFromLocal(e.target.value)} className={inputCls} />
            </label>
          )}
          {partnerOptions.length > 0 && (
            <label className="text-sm text-gray-700">Booking for
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={inputCls}>
                <option value="">Walk-in / direct</option>
                {partnerOptions.map(([id, name]) => <option key={id} value={id}>{name} guest</option>)}
              </select>
            </label>
          )}
          <span className="pb-2 text-xs text-gray-500">Manila time · updates as you type</span>
        </div>

        {result.isLoading && <p className="text-sm text-gray-500">Checking the fleet…</p>}
        {result.error && <p className="text-sm text-red-600">{result.error instanceof Error ? result.error.message : 'Could not check availability.'}</p>}
        {data && (
          <div className={`space-y-4 ${result.isFetching ? 'opacity-70' : ''}`}>
            <SearchAnswer result={data} />

            {data.allocationsEnabled && data.partners.length > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Partner allocations:{' '}
                {data.partners.map((p) => `${p.partnerName} has ${p.allowance} ${p.vehicleType}${p.allowance === 1 ? '' : 's'} protected (${p.inUse} in use by their guests)`).join('; ')}.
                {' '}A protected bike can only go to that partner&apos;s guests.
              </p>
            )}

            {data.products.map((p) => (
              <ProductBoard key={p.modelId} product={p} from={data.from} defaultOpen={p.modelId === (params.product || data.products[0]?.modelId)} />
            ))}

            {data.surfRacks && (
              <section className="rounded-lg border border-gray-200 px-4 py-3 text-sm">
                <p className="font-semibold text-gray-900">Surf racks</p>
                {data.surfRacks.tracked ? (
                  <p className="mt-1 text-gray-700">
                    {data.surfRacks.total} total · {data.surfRacks.freeNow} free now · {data.surfRacks.rackBikesFreeNow} rack-fitted bike{data.surfRacks.rackBikesFreeNow === 1 ? '' : 's'} free now
                    {' · '}
                    {data.surfRacks.nextFreeAt
                      ? (Date.parse(data.surfRacks.nextFreeAt) <= Date.parse(data.from) ? 'one can go out now' : `next free ${formatWhen(data.surfRacks.nextFreeAt)}`)
                      : 'none free within 60 days'}
                  </p>
                ) : (
                  <p className="mt-1 text-gray-500">Rack stock isn&apos;t set for this store, so racks aren&apos;t tracked. {data.surfRacks.rackBikesFreeNow} rack-fitted bikes are free now.</p>
                )}
              </section>
            )}

            {data.notRentable.length > 0 && (
              <section className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">Not rentable</p>
                <p className="mt-1">
                  {data.notRentable.map((v) => `${v.vehicleName} (${v.reason === 'missing_model' ? 'no model set' : v.reason === 'inactive_model' ? 'model switched off' : v.detail})`).join(', ')}
                </p>
              </section>
            )}
            <p className="text-xs text-gray-400">Checked {formatTime(data.from)}. Every time shown includes the 30-minute handover after a return.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
