import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import type { TransferDetails } from './basket-types.js';
import { formatCurrency } from '../../utils/currency.js';

interface TransferRoute {
  id: number;
  route: string;
  vanType: string | null;
  price: number;
  pricingType: string;
  storeId: string | null;
  isActive: boolean;
}

interface RouteGroup {
  vanType: string;
  route: TransferRoute;
  displayName: string;
  icon: string;
  /** 'shared', 'private', or 'tuktuk' — maps to backend transferType enum */
  transferType: 'shared' | 'private' | 'tuktuk';
}

interface Props {
  transfer: TransferDetails | null;
  onTransferChange: (t: TransferDetails | null) => void;
  errors: Record<string, string>;
}

const INPUT_CLS =
  'h-10 w-full rounded-lg border border-charcoal-brand/[0.15] bg-white px-3 text-[13px] text-charcoal-brand placeholder:text-charcoal-brand/30 focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand transition-colors';
const LABEL_CLS = 'mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-charcoal-brand/50';

function mapVanType(vanType: string | null): Pick<RouteGroup, 'displayName' | 'icon' | 'transferType'> {
  const lower = (vanType ?? '').toLowerCase();
  if (lower.includes('shared')) {
    return { displayName: 'Shared Van', icon: '🚐', transferType: 'shared' };
  }
  if (lower.includes('tuk')) {
    return { displayName: 'Private TukTuk', icon: '🛺', transferType: 'tuktuk' };
  }
  return { displayName: 'Private Van', icon: '🚌', transferType: 'private' };
}

function buildGroups(routes: TransferRoute[]): RouteGroup[] {
  const seen = new Set<string>();
  const groups: RouteGroup[] = [];
  for (const route of routes) {
    const key = (route.vanType ?? '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const { displayName, icon, transferType } = mapVanType(route.vanType);
    groups.push({ vanType: route.vanType ?? '', route, displayName, icon, transferType });
  }
  return groups;
}

export function TransferSection({ transfer, onTransferChange, errors }: Props) {
  const storeId = useBookingStore((s) => s.storeId);
  const [routes, setRoutes] = useState<TransferRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<TransferRoute[]>(`/public/booking/transfer-routes?storeId=${storeId}`)
      .then((data) => {
        if (!cancelled) setRoutes(data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storeId]);

  const groups = buildGroups(routes);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-sand-brand" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) return null;

  function selectGroup(group: RouteGroup) {
    const pricingType = (group.route.pricingType === 'per_head' ? 'per_head' : 'fixed') as 'fixed' | 'per_head';
    const unitPrice = group.route.price;
    const prevPax = transfer?.paxCount ?? 1;
    const paxCount = pricingType === 'per_head' ? prevPax : 1;
    const totalPrice = pricingType === 'per_head' ? unitPrice * paxCount : unitPrice;
    onTransferChange({
      transferType: group.transferType,
      transferRoute: group.route.route,
      flightNumber: transfer?.flightNumber ?? '',
      flightArrivalTime: transfer?.flightArrivalTime ?? '',
      transferRouteId: group.route.id,
      vanType: group.vanType,
      pricingType,
      unitPrice,
      paxCount,
      totalPrice,
    });
  }

  function updatePaxCount(delta: number) {
    if (!transfer) return;
    const next = Math.max(1, transfer.paxCount + delta);
    onTransferChange({
      ...transfer,
      paxCount: next,
      totalPrice: transfer.unitPrice * next,
    });
  }

  function updateField(field: 'flightNumber' | 'flightArrivalTime', value: string) {
    if (!transfer) return;
    onTransferChange({ ...transfer, [field]: value });
  }

  const isSelected = (group: RouteGroup) =>
    transfer !== null && transfer.transferRouteId === group.route.id;

  return (
    <div className="space-y-3">

      {/* Van type selection rows */}
      <div className="divide-y divide-charcoal-brand/[0.08] rounded-xl border border-charcoal-brand/10 overflow-hidden">
        {groups.map((group) => {
          const selected = isSelected(group);
          const pricingType = group.route.pricingType === 'per_head' ? 'per_head' : 'fixed';
          const priceLabel = pricingType === 'per_head'
            ? `${formatCurrency(group.route.price)} / person`
            : formatCurrency(group.route.price);

          return (
            <div key={group.vanType} className={selected ? 'bg-teal-brand/5' : 'bg-white'}>
              <button
                type="button"
                onClick={() => (selected ? onTransferChange(null) : selectGroup(group))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sand-brand/30"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${
                  selected ? 'bg-teal-brand/10' : 'bg-sand-brand'
                }`}>
                  {group.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-charcoal-brand">{group.displayName}</p>
                  <p className="text-[12px] text-charcoal-brand/50">
                    {pricingType === 'per_head' ? 'Per person pricing' : 'Fixed price'}
                  </p>
                </div>
                <span className={`mr-3 shrink-0 text-[14px] font-medium ${
                  selected ? 'text-teal-brand' : 'text-charcoal-brand/70'
                }`}>
                  {priceLabel}
                </span>
                <div className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors ${
                  selected ? 'bg-teal-brand' : 'bg-charcoal-brand/15'
                }`}>
                  <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    selected ? 'translate-x-[19px]' : 'translate-x-[3px]'
                  }`} />
                </div>
              </button>

              {/* Pax counter — shown when this per_head group is selected */}
              {selected && pricingType === 'per_head' && transfer && (
                <div className="mb-3 ml-16 flex items-center gap-3 px-4">
                  <button
                    type="button"
                    onClick={() => updatePaxCount(-1)}
                    disabled={transfer.paxCount <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-charcoal-brand/20 text-sm font-medium text-charcoal-brand transition-colors hover:bg-sand-brand disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Remove passenger"
                  >
                    −
                  </button>
                  <span className="min-w-[6rem] text-center text-[13px] font-medium text-charcoal-brand">
                    {transfer.paxCount} passenger{transfer.paxCount !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => updatePaxCount(1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-charcoal-brand/20 text-sm font-medium text-charcoal-brand transition-colors hover:bg-sand-brand"
                    aria-label="Add passenger"
                  >
                    +
                  </button>
                  <span className="ml-2 text-[13px] font-medium text-teal-brand">
                    Total: {formatCurrency(transfer.totalPrice)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Flight details form — shown when any transfer is selected */}
      {transfer && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-charcoal-brand/[0.08] bg-sand-brand/30 p-4 md:grid-cols-2">
          <div>
            <label className={LABEL_CLS}>Flight Number</label>
            <input
              type="text"
              value={transfer.flightNumber}
              onChange={(e) => updateField('flightNumber', e.target.value)}
              placeholder="e.g. 5J 123"
              autoComplete="off"
              className={`${INPUT_CLS} ${errors.flightNumber ? 'border-red-400 ring-1 ring-red-400' : ''}`}
            />
            {errors.flightNumber && (
              <p className="mt-1 text-[11px] text-red-500">{errors.flightNumber}</p>
            )}
          </div>
          <div>
            <label className={LABEL_CLS}>Flight Arrival Time</label>
            <input
              type="datetime-local"
              value={transfer.flightArrivalTime}
              onChange={(e) => updateField('flightArrivalTime', e.target.value)}
              className={`${INPUT_CLS} ${errors.flightArrivalTime ? 'border-red-400 ring-1 ring-red-400' : ''}`}
            />
            {errors.flightArrivalTime && (
              <p className="mt-1 text-[11px] text-red-500">{errors.flightArrivalTime}</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
