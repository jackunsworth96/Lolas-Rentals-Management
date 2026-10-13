import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../common/Modal.js';
import { useLocations, usePaymentMethods, useChartOfAccounts } from '../../api/config.js';
import { useOrderItems, useAddCollection, type AddCollectionResult } from '../../api/orders.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { fetchPublicPartnerBenefit } from '../../api/partners.js';
import { partnerAllowsFreeDeliveryLocation } from '../../utils/partnerDeliveryLocation.js';
import type { EnrichedOrder } from '../../types/api.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  open: boolean;
  onClose: () => void;
  enrichedData: EnrichedOrder;
}

type ConfigLocation = {
  id: number;
  name: string;
  deliveryCost?: number;
  delivery_cost?: number;
  collectionCost?: number;
  collection_cost?: number;
  locationType?: string | null;
  location_type?: string | null;
  isActive?: boolean;
  is_active?: boolean;
};

type OrderItemRow = {
  id: string;
  vehicleName: string;
  dropoffLocation?: string | null;
  dropoffFee?: number;
};

const PAYMENT_METHODS_FALLBACK_LABEL = 'Select method…';

function isStoreLocation(loc: ConfigLocation): boolean {
  const collection = Number(loc.collectionCost ?? loc.collection_cost ?? 0);
  const delivery = Number(loc.deliveryCost ?? loc.delivery_cost ?? 0);
  const type = loc.locationType ?? loc.location_type ?? null;
  return collection === 0 && delivery === 0 && (type === 'store' || type === null);
}

export function AddCollectionModal({ open, onClose, enrichedData }: Props) {
  const storeId = enrichedData.storeId;
  const orderId = enrichedData.id;

  const { data: configLocationsRaw = [] } = useLocations(storeId) as { data: ConfigLocation[] };
  const { data: orderItemsRaw = [] } = useOrderItems(orderId) as { data: OrderItemRow[] };
  const { data: paymentMethods = [] } = usePaymentMethods() as {
    data: Array<{ id: string; name: string; surchargePercent?: number; surcharge_percent?: number; isActive?: boolean; is_active?: boolean }> | undefined;
  };
  const { data: accounts = [] } = useChartOfAccounts() as { data: Array<Record<string, unknown>> | undefined };
  const routing = usePaymentRouting();
  const addCollectionMut = useAddCollection();

  const { data: partnerBenefit } = useQuery({
    queryKey: ['order-partner-benefit', enrichedData.partnerRef],
    queryFn: () => fetchPublicPartnerBenefit(String(enrichedData.partnerRef ?? '')),
    enabled: Boolean(enrichedData.partnerRef),
    staleTime: 5 * 60_000,
  });

  const items = useMemo(
    () => orderItemsRaw.filter((i) => !!i.id),
    [orderItemsRaw],
  );

  const [orderItemId, setOrderItemId] = useState('');
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('unpaid');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [settlementRef, setSettlementRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<AddCollectionResult | null>(null);

  // Default to the only vehicle on single-item orders.
  useEffect(() => {
    if (!open) return;
    if (orderItemId) return;
    if (items.length === 1) setOrderItemId(items[0].id);
  }, [open, items, orderItemId]);

  useEffect(() => {
    if (!open) {
      setOrderItemId('');
      setLocationId(null);
      setLocationAddress('');
      setPaymentStatus('unpaid');
      setPaymentMethodId('');
      setPaymentAccountId('');
      setSettlementRef('');
      setLoading(false);
      setError(null);
      setSuccessResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (!successResult) return;
    const t = setTimeout(() => onClose(), 2500);
    return () => clearTimeout(t);
  }, [successResult, onClose]);

  const configLocations = useMemo(
    () => configLocationsRaw.filter((l) => l.isActive !== false && l.is_active !== false),
    [configLocationsRaw],
  );

  // Only off-site (non-store) locations make sense for "add collection".
  const collectionLocations = useMemo(
    () => configLocations.filter((l) => !isStoreLocation(l)),
    [configLocations],
  );

  const selectedLoc = locationId != null ? configLocations.find((l) => l.id === locationId) ?? null : null;
  const configuredFee = selectedLoc ? Number(selectedLoc.collectionCost ?? selectedLoc.collection_cost ?? 0) : 0;

  const isPartnerFree = Boolean(
    partnerBenefit && locationId != null &&
    partnerAllowsFreeDeliveryLocation(partnerBenefit, locationId, null),
  );
  const previewFee = isPartnerFree ? 0 : configuredFee;

  const storeAccounts = useMemo(
    () => accounts.filter((a) => {
      const sid = String(a.storeId ?? a.store_id ?? '');
      return sid === storeId || sid === 'company';
    }),
    [accounts, storeId],
  );
  const paymentAccountOptions = useMemo(() => {
    const seen = new Set<string>();
    return storeAccounts.filter((a) => {
      const id = String(a.id);
      if (seen.has(id)) return false;
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      const match = type === 'asset' && (name.includes('cash') || name.includes('bank') || name.includes('gcash'));
      if (match) seen.add(id);
      return match;
    });
  }, [storeAccounts]);
  const defaultReceivableId = useMemo(() => {
    const match = storeAccounts.find((a) => {
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      return type === 'asset' && name.includes('receivable');
    });
    return match
      ? String(match.id)
      : (storeAccounts.find((a) => String(a.accountType ?? a.type ?? '').toLowerCase() === 'asset')?.id as string ?? '');
  }, [storeAccounts]);

  const activePaymentMethods = useMemo(
    () => paymentMethods.filter((m) => m.isActive !== false && m.is_active !== false),
    [paymentMethods],
  );
  const pmLookup = useMemo(() => new Map(paymentMethods.map((pm) => [pm.id, pm])), [paymentMethods]);
  const selectedPM = paymentMethodId ? pmLookup.get(paymentMethodId) : null;
  const isCardPayment = Number(selectedPM?.surchargePercent ?? selectedPM?.surcharge_percent ?? 0) > 0;
  const routedAcct = paymentMethodId ? routing.getReceivedInto(storeId, paymentMethodId) : null;

  useEffect(() => {
    if (paymentAccountOptions.length === 1 && !paymentAccountId) {
      setPaymentAccountId(String(paymentAccountOptions[0].id));
    }
  }, [paymentAccountOptions, paymentAccountId]);

  const selectedItem = items.find((i) => i.id === orderItemId) ?? null;

  const canSubmit =
    !!orderItemId &&
    locationId != null &&
    (paymentStatus === 'unpaid' || (!!paymentMethodId && (isCardPayment || !!routedAcct || !!paymentAccountId)));

  async function handleSubmit() {
    if (!canSubmit || locationId == null) return;
    setLoading(true);
    setError(null);
    try {
      const result = await addCollectionMut.mutateAsync({
        id: orderId,
        orderItemId,
        locationId,
        ...(locationAddress.trim() ? { locationAddress: locationAddress.trim() } : {}),
        ...(paymentStatus === 'paid' && paymentMethodId
          ? {
              paymentMethodId,
              accountId: isCardPayment ? null : (routedAcct ?? (paymentAccountId || null)),
              receivableAccountId: defaultReceivableId,
              isCardPayment,
              settlementRef: isCardPayment ? (settlementRef || null) : null,
            }
          : {}),
      });
      setSuccessResult(result);
    } catch (err) {
      setError((err as Error).message ?? 'Could not add collection. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Collection" size={successResult ? 'sm' : 'md'}>
      {successResult ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-gray-900">Collection Added!</p>
            <p className="text-sm text-gray-500">Return location</p>
            <p className="text-sm font-semibold text-teal-700">{successResult.locationName}</p>
          </div>
          <div className="rounded-lg bg-gray-50 py-2 text-center">
            {successResult.isFree ? (
              <span className="text-sm font-semibold text-teal-700">Free — {successResult.freeReason}</span>
            ) : (
              <>
                <span className="text-xs text-gray-500">Collection fee: </span>
                <span className={`text-sm font-semibold ${paymentStatus === 'paid' ? 'text-green-700' : 'text-amber-700'}`}>
                  {formatCurrency(successResult.fee)}{' '}
                  {paymentStatus === 'paid' ? '— Paid' : '— Pending'}
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-gray-400">Closing…</p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-charcoal-brand/60">
            Use this when the customer changes their mind after pickup and wants us to collect the vehicle
            instead of returning it to the store. The return date doesn't need to change.
          </p>

          <div className="rounded-lg bg-gray-50 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Customer</span>
              <span className="font-medium text-gray-900">{enrichedData.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Vehicle(s)</span>
              <span className="font-medium text-gray-900">{enrichedData.vehicleNames || '—'}</span>
            </div>
          </div>

          {items.length > 1 && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Which vehicle? <span className="text-red-500">*</span></span>
              <select
                required
                value={orderItemId}
                onChange={(e) => { setOrderItemId(e.target.value); setError(null); }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Select vehicle…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.vehicleName}{i.dropoffLocation ? ` — currently returns to ${i.dropoffLocation}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedItem?.dropoffLocation && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              This vehicle currently returns to <strong>{selectedItem.dropoffLocation}</strong>
              {Number(selectedItem.dropoffFee ?? 0) > 0 ? ` (${formatCurrency(Number(selectedItem.dropoffFee))} fee already applied)` : ''}.
              Choosing a new location below will replace it.
            </p>
          )}

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Collection location <span className="text-red-500">*</span></span>
            <select
              required
              value={locationId ?? ''}
              onChange={(e) => { setLocationId(e.target.value ? Number(e.target.value) : null); setLocationAddress(''); setError(null); }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="">Select location…</option>
              {collectionLocations.map((loc) => {
                const cost = Number(loc.collectionCost ?? loc.collection_cost ?? 0);
                const free = Boolean(partnerBenefit && partnerAllowsFreeDeliveryLocation(partnerBenefit, loc.id, null));
                return (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}{free && cost > 0 ? ` (Free — partner benefit, was ${formatCurrency(cost)})` : ` — ${formatCurrency(cost)} fee`}
                  </option>
                );
              })}
            </select>
            {collectionLocations.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">No off-site locations are configured for this store.</p>
            )}
          </label>

          {locationId != null && selectedLoc && (
            <input
              type="text"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              placeholder="Exact address / landmark (optional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          )}

          {locationId != null && (
            <div className={`rounded-lg px-3 py-2 text-sm font-medium ${isPartnerFree ? 'bg-teal-50 text-teal-700' : previewFee > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
              {isPartnerFree
                ? `Free — this booking's partner benefit covers collection here.`
                : previewFee > 0
                  ? `Collection fee: ${formatCurrency(previewFee)}`
                  : 'No collection fee for this location.'}
            </div>
          )}

          {previewFee > 0 && (
            <>
              <div>
                <span className="text-sm font-medium text-gray-700">Payment</span>
                <div className="mt-1.5 flex gap-2">
                  {(['unpaid', 'paid'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setPaymentStatus(s); setPaymentMethodId(''); setPaymentAccountId(''); }}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                        paymentStatus === s
                          ? s === 'paid'
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-amber-400 bg-amber-50 text-amber-700'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {s === 'unpaid' ? 'Mark as unpaid' : 'Paid now'}
                    </button>
                  ))}
                </div>
              </div>

              {paymentStatus === 'paid' && (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Payment method <span className="text-red-500">*</span></span>
                    <select
                      required
                      value={paymentMethodId}
                      onChange={(e) => { setPaymentMethodId(e.target.value); setPaymentAccountId(''); setSettlementRef(''); }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="">{PAYMENT_METHODS_FALLBACK_LABEL}</option>
                      {activePaymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>

                  {paymentMethodId && isCardPayment && (
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Card reference #</span>
                      <input
                        type="text"
                        value={settlementRef}
                        onChange={(e) => setSettlementRef(e.target.value)}
                        placeholder="Terminal receipt #"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </label>
                  )}

                  {paymentMethodId && !isCardPayment && !routedAcct && (
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Account <span className="text-red-500">*</span></span>
                      <select
                        required
                        value={paymentAccountId}
                        onChange={(e) => setPaymentAccountId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      >
                        <option value="">Select</option>
                        {paymentAccountOptions.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.name)}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-amber-600">No routing rule — select manually</p>
                    </label>
                  )}
                </>
              )}
            </>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !canSubmit}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Adding…' : 'Add Collection'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
