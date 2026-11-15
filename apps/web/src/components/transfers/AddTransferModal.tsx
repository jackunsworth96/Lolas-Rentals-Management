import { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from '../common/Modal.js';
import { useCreateTransfer, type TransferCollector, type TransferRow } from '../../api/transfers.js';
import { useTransferRoutes } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import { ReceivePaymentModal } from './ReceivePaymentModal.js';

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string;
  onSuccess?: (msg: string) => void;
}

interface RouteOption {
  id: number;
  route: string;
  vanType: string | null;
  price: number;
  pricingType?: 'fixed' | 'per_head' | null;
  driverCut?: number | null;
}

type Collection = 'now' | 'later' | 'driver';

const COLLECTION_OPTIONS: Array<{ value: Collection; title: string; body: string }> = [
  { value: 'now', title: "Lola's — paying now", body: 'Walk-in paying at reception.' },
  { value: 'later', title: "Lola's — later", body: 'Collect at delivery, pickup or return.' },
  { value: 'driver', title: 'Driver collects', body: 'Customer pays the driver; cut deducted at settlement.' },
];

const FIELD = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

export function AddTransferModal({ open, onClose, storeId, onSuccess }: Props) {
  const createMutation = useCreateTransfer();
  const { data: routes = [] } = useTransferRoutes(storeId);
  const routeList = routes as RouteOption[];

  const [serviceDate, setServiceDate] = useState('');
  const [flightTime, setFlightTime] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerType, setCustomerType] = useState<'Walk-in' | 'Online'>('Walk-in');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [paxCount, setPaxCount] = useState(1);
  const [accommodation, setAccommodation] = useState('');
  const [bookingSource, setBookingSource] = useState('');
  const [opsNotes, setOpsNotes] = useState('');
  const [priceOverride, setPriceOverride] = useState<number | ''>('');
  const [collection, setCollection] = useState<Collection>('now');
  const [created, setCreated] = useState<TransferRow | null>(null);
  const [error, setError] = useState('');
  const paidRef = useRef(false);

  useEffect(() => {
    if (open) {
      paidRef.current = false;
      setServiceDate(manilaToday());
      setFlightTime('');
      setFlightNumber('');
      setCustomerName('');
      setContactNumber('');
      setCustomerEmail('');
      setCustomerType('Walk-in');
      setSelectedRouteId('');
      setPaxCount(1);
      setAccommodation('');
      setBookingSource('');
      setOpsNotes('');
      setPriceOverride('');
      setCollection('now');
      setCreated(null);
      setError('');
    }
  }, [open]);

  const route = routeList.find((r) => String(r.id) === selectedRouteId);
  const perHead = route?.pricingType === 'per_head';
  const pax = Math.max(paxCount, 1);
  const routeTotal = route ? (perHead ? route.price * pax : route.price) : 0;
  const total = priceOverride === '' ? routeTotal : Number(priceOverride);
  const cut = route?.driverCut != null ? (perHead ? route.driverCut * pax : route.driverCut) : 0;
  const lolasShare = total - cut;
  const pickupFromHotel = useMemo(() => {
    const first = (route?.route ?? '').split(/\s*(?:→|->|\bto\b)\s*/i)[0]?.toLowerCase() ?? '';
    return first.includes('luna') || first.includes('general');
  }, [route]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!customerName.trim()) { setError('Enter the customer name'); return; }
    if (!route) { setError('Select a route'); return; }
    if (!total || total <= 0) { setError('The fare must be more than ₱0'); return; }

    const collectVia: TransferCollector = collection === 'driver' ? 'driver' : 'lolas';
    try {
      const transfer = await createMutation.mutateAsync({
        serviceDate,
        customerName: customerName.trim(),
        contactNumber: contactNumber.trim() || null,
        customerEmail: customerEmail.trim() || null,
        customerType,
        route: route.route,
        flightTime: flightTime.trim() || null,
        flightNumber: flightNumber.trim() || null,
        paxCount: pax,
        vanType: route.vanType,
        accommodation: accommodation.trim() || null,
        opsNotes: opsNotes.trim() || null,
        totalPrice: total,
        paymentMethod: null,
        bookingSource: bookingSource.trim() || null,
        bookingToken: null,
        storeId,
        orderId: null,
        collectVia,
      });
      if (collection === 'now') {
        setCreated(transfer);
        return;
      }
      onSuccess?.('Transfer added');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create transfer');
    }
  }

  if (!open) return null;

  if (created) {
    return (
      <ReceivePaymentModal
        transfer={created}
        initialCollector="lolas"
        onClose={() => {
          if (!paidRef.current) onSuccess?.('Transfer added — payment still to collect');
          onClose();
        }}
        onSuccess={(msg) => {
          paidRef.current = true;
          onSuccess?.(`Transfer added · ${msg.toLowerCase()}`);
        }}
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add transfer"
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600 tabular-nums">
            {route ? (
              <>
                Fare <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>
                {' · '}driver cut {formatCurrency(cut)}
                {' · '}Lola&apos;s keeps <span className="font-semibold text-gray-900">{formatCurrency(lolasShare)}</span>
              </>
            ) : 'Select a route to see the fare'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              form="add-transfer-form"
              disabled={createMutation.isPending}
              className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Saving…' : collection === 'now' ? 'Create & take payment' : 'Create transfer'}
            </button>
          </div>
        </div>
      }
    >
      <form id="add-transfer-form" onSubmit={handleSubmit} className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-700">Trip</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-600">Route *</span>
              <select value={selectedRouteId} onChange={(e) => setSelectedRouteId(e.target.value)} required className={FIELD}>
                <option value="">Select route…</option>
                {routeList.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.route}{r.vanType ? ` (${r.vanType})` : ''} — {formatCurrency(r.price)}{r.pricingType === 'per_head' ? ' per person' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Date *</span>
              <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} required className={FIELD} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Passengers</span>
              <input
                type="number"
                min={1}
                value={paxCount}
                onChange={(e) => setPaxCount(Number(e.target.value) || 1)}
                className={`${FIELD} tabular-nums`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Flight time</span>
              <input type="time" value={flightTime} onChange={(e) => setFlightTime(e.target.value)} className={FIELD} />
              <span className="mt-1 block text-xs text-gray-500">Pickup time is worked out from this.</span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Flight number</span>
              <input type="text" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} placeholder="e.g. PR123" className={FIELD} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                Accommodation{pickupFromHotel ? ' (pickup point) *' : ''}
              </span>
              <input
                type="text"
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
                required={pickupFromHotel}
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Fare</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceOverride}
                placeholder={route ? String(routeTotal) : ''}
                onChange={(e) => setPriceOverride(e.target.value ? Number(e.target.value) : '')}
                className={`${FIELD} tabular-nums`}
              />
              <span className="mt-1 block text-xs text-gray-500 tabular-nums">
                {route
                  ? perHead
                    ? `${formatCurrency(route.price)} × ${pax} pax = ${formatCurrency(routeTotal)}. Leave blank to use this.`
                    : `Route price ${formatCurrency(routeTotal)}. Leave blank to use this.`
                  : 'Filled from the route.'}
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-700">Customer</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Name *</span>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required className={FIELD} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Contact number</span>
              <input type="tel" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} className={FIELD} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Email</span>
              <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={FIELD} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Customer type</span>
              <select value={customerType} onChange={(e) => setCustomerType(e.target.value as 'Walk-in' | 'Online')} className={FIELD}>
                <option value="Walk-in">Walk-in</option>
                <option value="Online">Online</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Booking source</span>
              <input type="text" value={bookingSource} onChange={(e) => setBookingSource(e.target.value)} placeholder="e.g. Viator, Klook, Direct" className={FIELD} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Ops notes</span>
              <input type="text" value={opsNotes} onChange={(e) => setOpsNotes(e.target.value)} className={FIELD} />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-700">Who collects payment?</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {COLLECTION_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer gap-2 rounded-lg border p-3 ${
                  collection === opt.value ? 'border-teal-brand bg-teal-brand/5' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="collection"
                  value={opt.value}
                  checked={collection === opt.value}
                  onChange={() => setCollection(opt.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">{opt.title}</span>
                  <span className="block text-pretty text-xs text-gray-500">{opt.body}</span>
                </span>
              </label>
            ))}
          </div>
          {collection === 'driver' && route && (
            <p className="text-pretty rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 tabular-nums">
              The driver collects {formatCurrency(total)} and hands Lola&apos;s {formatCurrency(lolasShare)} at settlement.
            </p>
          )}
        </fieldset>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}
