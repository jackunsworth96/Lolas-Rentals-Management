import { useState } from 'react';
import { WhatsAppNumberInput } from '../../common/WhatsAppNumberInput.js';
import { inputClass, type CustomerData, type PaymentMethodOption } from './types.js';

interface CustomerStepProps {
  customer: CustomerData;
  onCustomerChange: (patch: Partial<CustomerData>) => void;
  hasTransfer: boolean;
  transferAccommodation: string;
  onTransferAccommodationChange: (value: string) => void;
  transferPaidByCustomer: boolean;
  onTransferPaidByCustomerChange: (value: boolean) => void;
  paymentMethods: PaymentMethodOption[];
  preActivationMethodId: string;
  onPreActivationMethodChange: (value: string) => void;
  preActivationAmount: number | '';
  onPreActivationAmountChange: (value: number | '') => void;
  preActivationRef: string;
  onPreActivationRefChange: (value: string) => void;
  preActivationIsCard: boolean;
  onRecordPreActivation: () => void;
  recording: boolean;
  error: string | null;
}

export function CustomerStep({
  customer,
  onCustomerChange,
  hasTransfer,
  transferAccommodation,
  onTransferAccommodationChange,
  transferPaidByCustomer,
  onTransferPaidByCustomerChange,
  paymentMethods,
  preActivationMethodId,
  onPreActivationMethodChange,
  preActivationAmount,
  onPreActivationAmountChange,
  preActivationRef,
  onPreActivationRefChange,
  preActivationIsCard,
  onRecordPreActivation,
  recording,
  error,
}: CustomerStepProps) {
  const [preActivationOpen, setPreActivationOpen] = useState(false);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 font-medium text-gray-900">Customer details</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm text-gray-600">Name</span>
            <input
              type="text"
              value={customer.name}
              onChange={(e) => onCustomerChange({ name: e.target.value })}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">Email</span>
            <input
              type="email"
              inputMode="email"
              value={customer.email}
              onChange={(e) => onCustomerChange({ email: e.target.value })}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">WhatsApp number</span>
            <WhatsAppNumberInput
              value={customer.phone}
              onChange={(value) => onCustomerChange({ phone: value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              showPreview={false}
            />
          </label>
        </div>
      </section>

      {hasTransfer && (
        <section className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 font-medium text-gray-900">Airport transfer</h3>
          <label className="block">
            <span className="text-sm text-gray-600">Accommodation</span>
            <input
              type="text"
              placeholder="Hotel / villa name…"
              value={transferAccommodation}
              onChange={(e) => onTransferAccommodationChange(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
              checked={transferPaidByCustomer}
              onChange={(e) => onTransferPaidByCustomerChange(e.target.checked)}
            />
            <span className="leading-snug">
              <span className="font-semibold">Customer pays driver directly</span>
              <span className="block text-amber-700">
                The transfer fee is settled between the customer and the driver and is excluded from the balance due.
              </span>
            </span>
          </label>
        </section>
      )}

      <section className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => setPreActivationOpen((o) => !o)}
          aria-expanded={preActivationOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900">Paying before collection?</span>
            <span className="block text-xs text-gray-500">Record a pre-activation payment, e.g. a card payment taken now.</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-blue-600">{preActivationOpen ? 'Hide' : 'Record payment'}</span>
        </button>
        {preActivationOpen && (
          <div className="border-t border-gray-200 bg-blue-50/50 px-4 pb-4 pt-3">
            <p className="mb-3 text-xs text-gray-600">
              The order still needs to be processed through the remaining steps.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm text-gray-600">Payment method</span>
                <select
                  value={preActivationMethodId}
                  onChange={(e) => onPreActivationMethodChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  {paymentMethods.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Amount</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={preActivationAmount}
                  onChange={(e) => onPreActivationAmountChange(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className={inputClass}
                />
              </label>
              {preActivationIsCard && (
                <label className="block">
                  <span className="text-sm text-gray-600">Card reference #</span>
                  <input
                    type="text"
                    value={preActivationRef}
                    onChange={(e) => onPreActivationRefChange(e.target.value)}
                    placeholder="Terminal receipt #"
                    className={inputClass}
                  />
                </label>
              )}
            </div>
            {preActivationIsCard && (
              <p className="mt-2 text-xs text-amber-700">
                Card payment — a pending settlement will be created for reconciliation.
              </p>
            )}
            <button
              type="button"
              onClick={onRecordPreActivation}
              disabled={recording || !preActivationMethodId || !preActivationAmount}
              className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
            >
              {recording ? 'Recording...' : 'Record pre-activation payment'}
            </button>
            {error && <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
          </div>
        )}
      </section>
    </div>
  );
}
