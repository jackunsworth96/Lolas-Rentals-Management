import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../common/Modal.js';
import { useCreateTransfer, useRecordTransferPayment } from '../../api/transfers.js';
import { useTransferRoutes, usePaymentMethods, useChartOfAccounts } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string;
}

export function AddTransferModal({ open, onClose, storeId }: Props) {
  const createMutation = useCreateTransfer();
  const paymentMutation = useRecordTransferPayment();
  const { data: routes = [] } = useTransferRoutes(storeId);
  const { data: paymentMethods = [] } = usePaymentMethods();
  const { data: accounts = [] } = useChartOfAccounts();

  const routeList = routes as Array<{ id: number; route: string; vanType: string | null; price: number }>;
  const pmList = paymentMethods as Array<{ id: string; name: string }>;
  const accList = accounts as Array<{ id: string; name: string; accountType?: string; storeId?: string | null }>;

  const storeAccounts = useMemo(
    () => accList.filter((a) => !a.storeId || a.storeId === storeId),
    [accList, storeId],
  );
  const assetAccounts = storeAccounts.filter((a) => (a.accountType ?? '').toLowerCase() === 'asset');
  const incomeAccounts = storeAccounts.filter((a) => (a.accountType ?? '').toLowerCase() === 'income');

  const [serviceDate, setServiceDate] = useState('');
  const [flightTime, setFlightTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerType, setCustomerType] = useState<'Walk-in' | 'Online'>('Walk-in');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [paxCount, setPaxCount] = useState(1);
  const [vanType, setVanType] = useState('');
  const [accommodation, setAccommodation] = useState('');
  const [bookingSource, setBookingSource] = useState('');
  const [opsNotes, setOpsNotes] = useState('');
  const [totalPrice, setTotalPrice] = useState<number | ''>('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [payNow, setPayNow] = useState(false);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setServiceDate(new Date().toISOString().slice(0, 10));
      setFlightTime('');
      setCustomerName('');
      setContactNumber('');
      setCustomerEmail('');
      setCustomerType('Walk-in');
      setSelectedRouteId('');
      setPaxCount(1);
      setVanType('');
      setAccommodation('');
      setBookingSource('');
      setOpsNotes('');
      setTotalPrice('');
      setPaymentMethodId('');
      setPayNow(false);
      setPayAmount('');
      setCashAccountId('');
      setIncomeAccountId('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (selectedRouteId) {
      const route = routeList.find((r) => String(r.id) === selectedRouteId);
      if (route) {
        setTotalPrice(route.price);
        if (route.vanType) setVanType(route.vanType);
      }
    }
  }, [selectedRouteId, routeList]);

  const routing = usePaymentRouting();
  const routedCashAcct = routing.getReceivedInto(storeId, paymentMethodId);

  useEffect(() => {
    if (routedCashAcct && !cashAccountId) setCashAccountId(routedCashAcct);
  }, [routedCashAcct, cashAccountId]);

  const isCard = useMemo(() => {
    const pm = pmList.find((p) => p.id === paymentMethodId);
    return pm ? pm.name.toLowerCase().includes('card') : false;
  }, [paymentMethodId, pmList]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!customerName.trim()) { setError('Customer name is required'); return; }
    if (!selectedRouteId) { setError('Please select a route'); return; }
    if (!totalPrice || totalPrice <= 0) { setError('Total price must be positive'); return; }

    const selectedRoute = routeList.find((r) => String(r.id) === selectedRouteId);

    try {
      const result = await createMutation.mutateAsync({
        serviceDate,
        customerName: customerName.trim(),
        contactNumber: contactNumber.trim() || null,
        customerEmail: customerEmail.trim() || null,
        customerType,
        route: selectedRoute?.route ?? '',
        flightTime: flightTime.trim() || null,
        paxCount,
        vanType: vanType.trim() || null,
        accommodation: accommodation.trim() || null,
        opsNotes: opsNotes.trim() || null,
        totalPrice: Number(totalPrice),
        paymentMethod: paymentMethodId || null,
        bookingSource: bookingSource.trim() || null,
        bookingToken: null,
        storeId,
        orderId: null,
      });

      const transferId = (result as Record<string, unknown>)?.id as string | undefined;

      if (payNow && !isCard && transferId && Number(payAmount) > 0 && cashAccountId && incomeAccountId) {
        await paymentMutation.mutateAsync({
          transferId,
          amount: Number(payAmount),
          paymentMethod: paymentMethodId,
          date: serviceDate,
          cashAccountId,
          transferIncomeAccountId: incomeAccountId,
        });
      }

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create transfer');
    }
  }

  if (!open) return null;

  const isSaving = createMutation.isPending || paymentMutation.isPending;

  return (
    <Modal open onClose={onClose} title="Add Transfer" size="xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Customer Info */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-700">Customer</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Name *</span>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Contact Number</span>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Email</span>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Customer Type</span>
              <select
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value as 'Walk-in' | 'Online')}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="Walk-in">Walk-in</option>
                <option value="Online">Online</option>
              </select>
            </label>
          </div>
        </fieldset>

        {/* Booking Details */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-700">Booking Details</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Route *</span>
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select route...</option>
                {routeList.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.route}{r.vanType ? ` (${r.vanType})` : ''} — {formatCurrency(r.price)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Service Date *</span>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Flight / Pickup Time</span>
              <input
                type="time"
                value={flightTime}
                onChange={(e) => setFlightTime(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Pax Count</span>
              <input
                type="number"
                min={1}
                value={paxCount}
                onChange={(e) => setPaxCount(Number(e.target.value) || 1)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Van Type</span>
              <input
                type="text"
                value={vanType}
                onChange={(e) => setVanType(e.target.value)}
                placeholder="Auto-filled from route"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Accommodation / Hotel</span>
              <input
                type="text"
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Booking Source</span>
              <input
                type="text"
                value={bookingSource}
                onChange={(e) => setBookingSource(e.target.value)}
                placeholder="e.g. Viator, Klook, Direct"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Total Price *</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={totalPrice}
                onChange={(e) => setTotalPrice(e.target.value ? Number(e.target.value) : '')}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Ops Notes</span>
            <textarea
              value={opsNotes}
              onChange={(e) => setOpsNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </fieldset>

        {/* Payment */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-700">Payment</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Payment Method</span>
              <select
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">None (unpaid)</option>
                {pmList.map((pm) => (
                  <option key={pm.id} value={pm.id}>{pm.name}</option>
                ))}
              </select>
            </label>
          </div>

          {paymentMethodId && !isCard && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={payNow}
                  onChange={(e) => setPayNow(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">Record payment now</span>
              </label>
              {payNow && (
                <div className="grid grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Amount</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value ? Number(e.target.value) : '')}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  {!routedCashAcct && (
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Debit Account (Cash/GCash) *</span>
                    <select
                      value={cashAccountId}
                      onChange={(e) => setCashAccountId(e.target.value)}
                      required={payNow}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select...</option>
                      {assetAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    {paymentMethodId && <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>}
                  </label>
                  )}
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Credit Account (Income) *</span>
                    <select
                      value={incomeAccountId}
                      onChange={(e) => setIncomeAccountId(e.target.value)}
                      required={payNow}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select...</option>
                      {incomeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          {paymentMethodId && isCard && (
            <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              Card payments are recorded via the Transfer Payment modal after creation.
            </p>
          )}
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Create Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
