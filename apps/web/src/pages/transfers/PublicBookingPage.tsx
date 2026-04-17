import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { formatCurrency } from '../../utils/currency.js';
import { PageLayout } from '../../components/layout/PageLayout.js';

interface TransferRoute {
  id: number;
  route: string;
  vanType: string | null;
  price: number;
  pricingType?: string;
}

export default function PublicBookingPage() {
  const { token } = useParams<{ token: string }>();
  const [storeName, setStoreName] = useState('');
  const [routes, setRoutes] = useState<TransferRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [flightTime, setFlightTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [paxCount, setPaxCount] = useState(1);
  const [accommodation, setAccommodation] = useState('');
  const [opsNotes, setOpsNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [bookingRef, setBookingRef] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    Promise.all([
      api.get(`/public/transfer-routes?token=${token}`),
      api.get(`/public/store-info?token=${token}`),
    ]).then(([routesData, storeData]) => {
      setRoutes(routesData as TransferRoute[]);
      setStoreName((storeData as { name: string })?.name ?? '');
    }).catch(() => {
      setError('This booking link is not valid or has been disabled. Please ask the rental shop for a new link.');
    }).finally(() => setLoading(false));
  }, [token]);

  const selectedRoute = useMemo(
    () => routes.find((r) => String(r.id) === selectedRouteId),
    [routes, selectedRouteId],
  );

  const isPerHead = selectedRoute?.pricingType === 'per_head';
  const totalPrice = selectedRoute
    ? (isPerHead ? selectedRoute.price * paxCount : selectedRoute.price)
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!selectedRoute) { setError('Please select a route'); return; }
    setSubmitting(true);
    try {
      const result = await api.post<{ id: string }>('/public/transfer-booking', {
        serviceDate,
        customerName: customerName.trim(),
        contactNumber: contactNumber.trim() || null,
        customerEmail: customerEmail.trim() || null,
        route: selectedRoute.route,
        flightTime: flightTime.trim() || null,
        paxCount,
        vanType: selectedRoute.vanType,
        accommodation: accommodation.trim() || null,
        totalPrice,
        opsNotes: opsNotes.trim() || null,
        token,
      });
      setBookingRef(result.id?.slice(0, 8).toUpperCase() ?? '');
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 block w-full rounded-lg border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm text-charcoal-brand placeholder-charcoal-brand/40 focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand';
  const labelClass = 'block text-sm font-medium text-charcoal-brand font-lato';
  const todayManilaISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  if (loading) {
    return (
      <PageLayout title="Transfer Booking | Lola's Rentals" showFloralRight={false}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
        </div>
      </PageLayout>
    );
  }

  if (!token || (error && routes.length === 0)) {
    return (
      <PageLayout title="Transfer Booking | Lola's Rentals" showFloralRight={false}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
          <div className="mb-4 text-4xl">🚐</div>
          <h2 className="font-headline text-2xl font-bold text-charcoal-brand mb-2">Invalid booking link</h2>
          <p className="text-charcoal-brand/70 text-sm max-w-sm">
            {error || 'This booking link is not valid. Please contact the rental shop for a new link.'}
          </p>
        </div>
      </PageLayout>
    );
  }

  if (submitted) {
    return (
      <PageLayout title="Booking Confirmed | Lola's Rentals" showFloralRight={false}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-teal-brand/10">
            <svg className="h-10 w-10 text-teal-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-headline text-3xl font-bold text-teal-brand mb-2">Booking Confirmed!</h2>
          {bookingRef && (
            <p className="mb-2 text-sm text-charcoal-brand/60 font-lato">
              Reference: <span className="font-mono font-semibold text-charcoal-brand">{bookingRef}</span>
            </p>
          )}
          <p className="text-charcoal-brand/70 text-sm max-w-sm font-lato">
            Your transfer has been booked.{storeName ? ` ${storeName} will be in touch to confirm the details.` : ''}
          </p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Transfer Booking | Lola's Rentals" showFloralRight={false}>
      <div className="mx-auto max-w-2xl px-4 py-10">

        <div className="mb-8 text-center">
          <h1 className="font-headline text-4xl font-black text-teal-brand mb-2">
            Book a Transfer
          </h1>
          {storeName && (
            <p className="text-charcoal-brand/70 font-lato text-sm">{storeName}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          <div className="rounded-2xl bg-sand-brand p-6 space-y-4">
            <h2 className="font-headline text-xl font-bold text-charcoal-brand">Your Transfer</h2>

            <div>
              <label className={labelClass}>
                Route <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                required
                className={inputClass}
              >
                <option value="">Select a route…</option>
                {routes.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.route}{r.vanType ? ` — ${r.vanType}` : ''}{' '}
                    ({formatCurrency(r.price)}{r.pricingType === 'per_head' ? '/person' : ''})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Service Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                  required
                  min={todayManilaISO}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Passengers <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={paxCount}
                  onChange={(e) => setPaxCount(Number(e.target.value))}
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Flight Time</label>
              <input
                type="time"
                value={flightTime}
                onChange={(e) => setFlightTime(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-charcoal-brand/50 font-lato">
                If applicable — helps us time your pickup
              </p>
            </div>

            {selectedRoute && (
              <div className="rounded-xl bg-teal-brand/10 border border-teal-brand/20 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-teal-brand font-lato">Total</span>
                <span className="text-xl font-bold text-teal-brand font-headline">
                  {formatCurrency(totalPrice)}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-sand-brand p-6 space-y-4">
            <h2 className="font-headline text-xl font-bold text-charcoal-brand">Your Details</h2>

            <div>
              <label className={labelClass}>
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                autoComplete="name"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                WhatsApp / Contact Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                required
                autoComplete="tel"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Accommodation / Drop-off</label>
              <input
                type="text"
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
                placeholder="e.g. Harana Surf Resort"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Notes for the driver</label>
              <textarea
                value={opsNotes}
                onChange={(e) => setOpsNotes(e.target.value)}
                rows={3}
                placeholder="Any special requests or information…"
                className={inputClass}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-lato">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-teal-brand px-6 py-3.5 text-base font-bold text-white font-lato hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Booking…' : 'Confirm Transfer Booking'}
          </button>

        </form>
      </div>
    </PageLayout>
  );
}
