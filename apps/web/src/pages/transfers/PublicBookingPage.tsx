import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { formatCurrency } from '../../utils/currency.js';

interface TransferRoute {
  id: number;
  route: string;
  vanType: string | null;
  price: number;
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

  const totalPrice = selectedRoute?.price ?? 0;

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

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-xl font-bold text-red-600">Invalid Booking Link</h1>
          <p className="mt-2 text-gray-600">This link is missing information. Please ask the rental shop for the correct link.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading booking form...</p>
      </div>
    );
  }

  if (!routes.length && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Link Not Found</h1>
          <p className="mt-2 text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-green-600">Booking Confirmed!</h1>
          <p className="mt-2 text-gray-600">Thank you, {customerName}. We'll be in touch with your transfer details.</p>
          {bookingRef && (
            <div className="mt-4 rounded-lg bg-blue-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-500">Booking Reference</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-blue-700">{bookingRef}</p>
              <p className="mt-1 text-xs text-gray-500">Quote this reference when contacting us</p>
            </div>
          )}
          {selectedRoute && (
            <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              <p><strong>Route:</strong> {selectedRoute.route}</p>
              <p><strong>Date:</strong> {serviceDate}</p>
              <p><strong>Total:</strong> {formatCurrency(totalPrice)}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6">
          {storeName && <p className="text-sm font-medium text-blue-600">{storeName}</p>}
          <h1 className="text-2xl font-bold text-gray-900">Book a Transfer</h1>
          <p className="mt-1 text-sm text-gray-500">Fill in the details below and we'll confirm your booking.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Route *</span>
            <select
              value={selectedRouteId}
              onChange={(e) => setSelectedRouteId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            >
              <option value="">Select your route...</option>
              {routes.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.route}{r.vanType ? ` (${r.vanType})` : ''} — {formatCurrency(r.price)}
                </option>
              ))}
            </select>
          </label>

          {selectedRoute && (
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-sm text-gray-600">
                Route: <strong>{selectedRoute.route}</strong>
                {selectedRoute.vanType && <> · {selectedRoute.vanType}</>}
              </p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(totalPrice)}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Service Date *</span>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                required
                min={new Date().toISOString().slice(0, 10)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Flight / Pickup Time</span>
              <input
                type="time"
                value={flightTime}
                onChange={(e) => setFlightTime(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Full Name *</span>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Contact Number</span>
              <input
                type="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Email</span>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Passengers</span>
              <input
                type="number"
                min={1}
                value={paxCount}
                onChange={(e) => setPaxCount(Number(e.target.value) || 1)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Hotel / Accommodation</span>
              <input
                type="text"
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Notes</span>
            <textarea
              value={opsNotes}
              onChange={(e) => setOpsNotes(e.target.value)}
              rows={2}
              placeholder="Special requests, luggage info, etc."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
          </label>

          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !selectedRouteId}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : `Submit Booking${totalPrice > 0 ? ` — ${formatCurrency(totalPrice)}` : ''}`}
          </button>
        </form>
      </div>
    </div>
  );
}
