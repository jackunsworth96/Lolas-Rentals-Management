import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../common/Modal.js';
import { api } from '../../api/client.js';
import type { EnrichedOrder } from '../../types/api.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  open: boolean;
  onClose: () => void;
  enrichedData: EnrichedOrder;
}

interface PreviewData {
  extensionDays: number;
  dailyRate: number;
  extensionTotal: number;
  bracketLabel: string;
}

type Step = 'dates' | 'review' | 'success';

const TIME_SLOTS = [
  '09:15', '09:45', '10:15', '10:45',
  '11:15', '11:45', '12:15', '12:45',
  '13:15', '13:45', '14:15', '14:45',
  '15:15', '15:45', '16:15', '16:45',
  '17:15',
];

function formatSlotLabel(slot: string): string {
  const [hStr, mStr] = slot.split(':');
  const h = Number(hStr);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

function formatReturnDatetime(dt: string): string {
  return new Date(dt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function minDate(currentDropoff: string): string {
  return currentDropoff.slice(0, 10);
}

function defaultNewDate(currentDropoff: string): string {
  const d = new Date(currentDropoff);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'gcash', label: 'GCash' },
  { id: 'card', label: 'Card' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
];

function getAccountId(method: string, storeId: string): string {
  const isBass = storeId === 'store-bass';
  switch (method) {
    case 'cash': return isBass ? 'CASH-BASS' : 'CASH-LOLA';
    case 'gcash': return 'GCASH-store-lolas';
    case 'card': return 'CARD-TERMINAL-store-lolas';
    case 'bank_transfer': return 'BANK-UNION-BANK-store-lolas';
    default: return '';
  }
}

export function ExtendOrderModal({ open, onClose, enrichedData }: Props) {
  const qc = useQueryClient();

  const currentDropoff = enrichedData.returnDatetime ?? '';

  // Step 1 state
  const [step, setStep] = useState<Step>('dates');
  const [newDate, setNewDate] = useState(() => defaultNewDate(currentDropoff));
  const [newTime, setNewTime] = useState('');
  const [overrideEmail, setOverrideEmail] = useState('');

  // Step 2 state
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [overrideRate, setOverrideRate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('unpaid');
  const [paymentMethod, setPaymentMethod] = useState('');

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ datetime: string; extensionCost: number } | null>(null);

  const emailToUse = enrichedData.customerEmail?.trim() || overrideEmail.trim();

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('dates');
      setNewDate(defaultNewDate(currentDropoff));
      setNewTime('');
      setOverrideEmail('');
      setPreviewData(null);
      setOverrideRate('');
      setPaymentStatus('unpaid');
      setPaymentMethod('');
      setLoading(false);
      setError(null);
      setSuccessResult(null);
    }
  }, [open, currentDropoff]);

  // Auto-close after success
  useEffect(() => {
    if (!successResult) return;
    const t = setTimeout(() => onClose(), 2500);
    return () => clearTimeout(t);
  }, [successResult, onClose]);

  const newDropoffDatetime = newDate && newTime ? `${newDate}T${newTime}:00` : '';
  const orderReference = enrichedData.bookingToken ?? enrichedData.wooOrderId;

  async function handleCalculate() {
    if (!newDropoffDatetime || !emailToUse || !orderReference) return;

    if (currentDropoff && new Date(newDropoffDatetime) <= new Date(currentDropoff)) {
      setError('New return date/time must be after the current return date.');
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ orderReference, email: emailToUse, newDropoffDatetime });

    try {
      const data = await api.get<PreviewData>(`/public/extend/preview?${params}`);
      setPreviewData(data);
      setOverrideRate(String(data.dailyRate));
      setStep('review');
    } catch (err) {
      setError((err as Error).message ?? 'Could not calculate extension. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!previewData || !newDropoffDatetime || !emailToUse || !orderReference) return;
    if (paymentStatus === 'paid' && !paymentMethod) return;

    const rateNum = parseFloat(overrideRate);
    const effectiveRate = !isNaN(rateNum) && rateNum > 0 ? rateNum : previewData.dailyRate;
    const isOverride = Math.abs(effectiveRate - previewData.dailyRate) > 0.001;
    const accountId = paymentStatus === 'paid' && paymentMethod
      ? getAccountId(paymentMethod, enrichedData.storeId)
      : undefined;

    setLoading(true);
    setError(null);

    try {
      const res = await api.post<{ success: boolean; newDropoffDatetime?: string; extensionCost?: number; reason?: string }>(
        '/extend/confirm',
        {
          orderReference,
          email: emailToUse,
          newDropoffDatetime,
          ...(isOverride ? { overrideDailyRate: effectiveRate } : {}),
          paymentStatus,
          ...(paymentStatus === 'paid' && paymentMethod
            ? { paymentMethod, paymentAccountId: accountId }
            : {}),
        },
      );

      if (res.success) {
        await qc.invalidateQueries({ queryKey: ['orders'] });
        setSuccessResult({
          datetime: res.newDropoffDatetime ?? newDropoffDatetime,
          extensionCost: res.extensionCost ?? Math.round(effectiveRate * previewData.extensionDays * 100) / 100,
        });
        setStep('success');
      } else {
        setError(res.reason ?? 'Extension failed. Please try again.');
      }
    } catch (err) {
      setError((err as Error).message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Derived values for review step
  const rateNum = parseFloat(overrideRate);
  const effectiveRate = !isNaN(rateNum) && rateNum > 0 ? rateNum : (previewData?.dailyRate ?? 0);
  const computedTotal = previewData ? Math.round(effectiveRate * previewData.extensionDays * 100) / 100 : 0;

  const step1Valid = !!(newDate && newTime && emailToUse && orderReference);
  const step2Valid = paymentStatus === 'unpaid' || !!paymentMethod;

  const STEP_LABELS: Record<Step, string> = {
    dates: 'Extend Booking',
    review: 'Review & Payment',
    success: 'Extend Booking',
  };

  return (
    <Modal open={open} onClose={onClose} title={STEP_LABELS[step]} size="sm">

      {/* ── SUCCESS ── */}
      {step === 'success' && successResult && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-gray-900">Booking Extended!</p>
            <p className="text-sm text-gray-500">New return date</p>
            <p className="text-sm font-semibold text-teal-700">{formatReturnDatetime(successResult.datetime)}</p>
          </div>
          {successResult.extensionCost > 0 && (
            <div className="rounded-lg bg-gray-50 py-2 text-center">
              <span className="text-xs text-gray-500">Extension fee: </span>
              <span className={`text-sm font-semibold ${paymentStatus === 'paid' ? 'text-green-700' : 'text-amber-700'}`}>
                {formatCurrency(successResult.extensionCost)}{' '}
                {paymentStatus === 'paid' ? '— Paid' : '— Pending'}
              </span>
            </div>
          )}
          <p className="text-xs text-gray-400">Closing…</p>
        </div>
      )}

      {/* ── STEP 1: DATES ── */}
      {step === 'dates' && (
        <div className="space-y-5">
          {/* Read-only summary */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Customer</span>
              <span className="font-medium text-gray-900">{enrichedData.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Vehicle</span>
              <span className="font-medium text-gray-900">{enrichedData.vehicleNames || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Current return</span>
              <span className="font-medium text-gray-900">
                {currentDropoff ? formatReturnDatetime(currentDropoff) : '—'}
              </span>
            </div>
          </div>

          {/* Email override (only when not on record) */}
          {!enrichedData.customerEmail?.trim() && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Customer email <span className="text-red-500">*</span>
                <span className="ml-1 text-xs font-normal text-gray-400">(not on record — required)</span>
              </span>
              <input
                type="email"
                required
                value={overrideEmail}
                onChange={(e) => setOverrideEmail(e.target.value)}
                placeholder="customer@example.com"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </label>
          )}

          {/* No order reference warning */}
          {!orderReference && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No order reference on this booking — extension may not be available via this flow.
            </p>
          )}

          {/* New return date & time */}
          <div>
            <span className="text-sm font-medium text-gray-700">New return date &amp; time <span className="text-red-500">*</span></span>
            <div className="mt-1 flex gap-2">
              <input
                type="date"
                required
                value={newDate}
                min={minDate(currentDropoff)}
                onChange={(e) => { setNewDate(e.target.value); setError(null); }}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <select
                required
                value={newTime}
                onChange={(e) => { setNewTime(e.target.value); setError(null); }}
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Select time</option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{formatSlotLabel(slot)}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={loading || !step1Valid}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Calculating…' : 'Calculate Extension →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: REVIEW & PAYMENT ── */}
      {step === 'review' && previewData && (
        <div className="space-y-5">
          {/* Extension summary */}
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-600">Extension</span>
              <span className="font-medium text-gray-900">{previewData.extensionDays} day{previewData.extensionDays !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-600">Pricing bracket</span>
              <span className="text-gray-700">{previewData.bracketLabel}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <label className="text-gray-600">Rate per day</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">₱</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={overrideRate}
                  onChange={(e) => setOverrideRate(e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="font-medium text-gray-900">Extension total</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(computedTotal)}</span>
            </div>
          </div>

          {/* Payment toggle */}
          <div>
            <span className="text-sm font-medium text-gray-700">Payment</span>
            <div className="mt-1.5 flex gap-2">
              {(['unpaid', 'paid'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setPaymentStatus(s); setPaymentMethod(''); }}
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

          {/* Payment method (only when paid) */}
          {paymentStatus === 'paid' && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Payment method <span className="text-red-500">*</span></span>
              <select
                required
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Select method…</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-between border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => { setStep('dates'); setError(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || !step2Valid}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Confirming…' : 'Confirm Extension'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
