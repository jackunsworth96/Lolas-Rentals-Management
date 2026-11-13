import { useState } from 'react';
import { formatCurrency } from '../../../utils/currency.js';
import { inputClass, type PaymentMethodOption } from './types.js';
import { TipField } from '../TipField.js';

type AccountOption = Record<string, unknown>;

interface PaymentStepProps {
  customerChoseMethod: string | null;
  paymentMethods: PaymentMethodOption[];
  depositMethods: PaymentMethodOption[];
  paymentMethodId: string;
  onPaymentMethodChange: (value: string) => void;
  surchargePercent: number;
  cardSurchargeAmount: number;
  waiveCardFee: boolean;
  onWaiveCardFeeChange: (value: boolean) => void;
  finalTotal: number;
  collectNowAmount: number | '';
  onCollectNowAmountChange: (value: number | '') => void;
  previewBalanceDue: number;
  settlementRef: string;
  onSettlementRefChange: (value: string) => void;
  showPaymentAccount: boolean;
  paymentAccountId: string;
  onPaymentAccountChange: (value: string) => void;
  paymentAccountOptions: AccountOption[];
  securityDeposit: number | '';
  onSecurityDepositChange: (value: number | '') => void;
  waiveDeposit: boolean;
  onWaiveDepositChange: (value: boolean) => void;
  depositMethodId: string;
  onDepositMethodChange: (value: string) => void;
  showDepositLiability: boolean;
  depositLiabilityAccountId: string;
  onDepositLiabilityAccountChange: (value: string) => void;
  depositLiabilityAccountOptions: AccountOption[];
  needsMeetingPoint: boolean;
  dropoffLocationNote: string;
  onDropoffLocationNoteChange: (value: string) => void;
  tipAmount: number | '';
  onTipAmountChange: (value: number | '') => void;
  tipAccountId: string;
  onTipAccountChange: (value: string) => void;
  missingChartOfAccounts: boolean;
  error: string | null;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <h3 className="mb-3 font-medium text-gray-900">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function PaymentStep(props: PaymentStepProps) {
  const {
    customerChoseMethod, paymentMethods, depositMethods, paymentMethodId, onPaymentMethodChange,
    surchargePercent, cardSurchargeAmount, waiveCardFee, onWaiveCardFeeChange, finalTotal,
    collectNowAmount, onCollectNowAmountChange, previewBalanceDue, settlementRef, onSettlementRefChange,
    showPaymentAccount, paymentAccountId, onPaymentAccountChange, paymentAccountOptions,
    securityDeposit, onSecurityDepositChange, waiveDeposit, onWaiveDepositChange,
    depositMethodId, onDepositMethodChange, showDepositLiability, depositLiabilityAccountId,
    onDepositLiabilityAccountChange, depositLiabilityAccountOptions, needsMeetingPoint,
    dropoffLocationNote, onDropoffLocationNoteChange, missingChartOfAccounts, error,
    tipAmount, onTipAmountChange, tipAccountId, onTipAccountChange,
  } = props;
  const [meetingPointOpen, setMeetingPointOpen] = useState(false);
  const collectNow = collectNowAmount === '' ? finalTotal : Number(collectNowAmount);
  const showMeetingPoint = needsMeetingPoint || meetingPointOpen || dropoffLocationNote.trim() !== '';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-center lg:hidden">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Total</div>
          <div className="text-sm font-bold tabular-nums text-gray-900">{formatCurrency(finalTotal)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Collect now</div>
          <div className="text-sm font-semibold tabular-nums text-gray-900">{paymentMethodId ? formatCurrency(collectNow) : '—'}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Balance</div>
          <div className={`text-sm font-semibold tabular-nums ${previewBalanceDue > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {formatCurrency(previewBalanceDue)}
          </div>
        </div>
      </div>

      <Group title="Rental payment">
        <label className="block">
          <span className="text-sm text-gray-600">Payment method</span>
          {customerChoseMethod && (
            <span className="ml-2 text-xs text-gray-500">
              Customer chose <span className="font-medium text-gray-700">{customerChoseMethod}</span>
            </span>
          )}
          <select value={paymentMethodId} onChange={(e) => onPaymentMethodChange(e.target.value)} className={inputClass}>
            <option value="">Select payment method...</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        {surchargePercent > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className={waiveCardFee ? 'text-gray-400 line-through' : 'text-amber-700'}>
              {surchargePercent}% card surcharge ({formatCurrency(cardSurchargeAmount || 0)})
            </span>
            <label className="flex items-center gap-2 text-gray-600">
              <input
                type="checkbox"
                checked={waiveCardFee}
                onChange={(e) => onWaiveCardFeeChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Waive card fee
            </label>
          </div>
        )}

        {paymentMethodId && (
          <label className="block">
            <span className="text-sm text-gray-600">Amount to collect now</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={finalTotal}
              step={1}
              value={collectNowAmount}
              onChange={(e) => onCollectNowAmountChange(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={String(finalTotal)}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-gray-500">
              Leave blank to collect the full total. Reduce it if the customer settles the rest later.
            </span>
            {previewBalanceDue > 0 && (
              <span className="mt-1 block text-sm font-medium text-amber-700">
                Balance due after activation: {formatCurrency(previewBalanceDue)}
              </span>
            )}
            {previewBalanceDue === 0 && collectNowAmount !== '' && (
              <span className="mt-1 block text-xs text-green-700">Full amount collected — no balance due.</span>
            )}
          </label>
        )}

        {paymentMethodId && surchargePercent > 0 && (
          <label className="block">
            <span className="text-sm text-gray-600">Card reference number</span>
            <input
              type="text"
              value={settlementRef}
              onChange={(e) => onSettlementRefChange(e.target.value)}
              placeholder="e.g. terminal receipt #"
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-gray-500">Payment routes to Card Settlements for reconciliation.</span>
          </label>
        )}

        {showPaymentAccount && (
          <label className="block">
            <span className="text-sm text-gray-600">Payment account (cash/bank)</span>
            <select value={paymentAccountId} onChange={(e) => onPaymentAccountChange(e.target.value)} className={inputClass}>
              <option value="">Select account...</option>
              {paymentAccountOptions.map((a) => (
                <option key={String(a.id)} value={String(a.id)}>{String(a.name ?? '')}</option>
              ))}
            </select>
            {paymentMethodId && <span className="mt-1 block text-xs text-amber-600">No routing rule configured — select manually.</span>}
          </label>
        )}
      </Group>

      <Group title="Security deposit">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-gray-600">
              Amount {!waiveDeposit && <span className="text-red-500">*</span>}
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={waiveDeposit ? '' : securityDeposit}
              onChange={(e) => onSecurityDepositChange(e.target.value === '' ? '' : Number(e.target.value))}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="0"
              disabled={waiveDeposit}
              className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">Deposit payment method</span>
            <select
              value={depositMethodId}
              onChange={(e) => onDepositMethodChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Select deposit method...</option>
              {depositMethods.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={waiveDeposit}
            onChange={(e) => onWaiveDepositChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Waive deposit
        </label>
        {showDepositLiability && (
          <label className="block">
            <span className="text-sm text-gray-600">Deposit liability account</span>
            <select
              value={depositLiabilityAccountId}
              onChange={(e) => onDepositLiabilityAccountChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Select account...</option>
              {depositLiabilityAccountOptions.map((a) => (
                <option key={String(a.id)} value={String(a.id)}>{String(a.name ?? '')}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500">Required when security deposit &gt; 0</span>
          </label>
        )}
      </Group>

      {showMeetingPoint ? (
        <section className="rounded-lg border border-gray-200 p-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-900">Dropoff meeting point</span>
            <span className="block text-xs text-gray-500">Where to meet the customer for the return — e.g. &quot;Bravo Resort&quot; for a General Luna return.</span>
            <input
              type="text"
              value={dropoffLocationNote}
              onChange={(e) => onDropoffLocationNoteChange(e.target.value)}
              placeholder="e.g. Bravo Resort"
              maxLength={500}
              className={inputClass}
            />
          </label>
        </section>
      ) : (
        <button type="button" onClick={() => setMeetingPointOpen(true)} className="text-sm font-medium text-blue-600 hover:underline">
          + Add a dropoff meeting point
        </button>
      )}

      <TipField
        amount={tipAmount}
        onAmountChange={onTipAmountChange}
        accountId={tipAccountId}
        onAccountChange={onTipAccountChange}
        accountOptions={paymentAccountOptions.map((a) => ({ id: String(a.id), name: String(a.name ?? '') }))}
      />

      {missingChartOfAccounts && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No chart of accounts configured. Set up a Receivable account (Asset) and Rental Income account in Settings &gt; Chart of Accounts to enable full accounting integration. You can still activate orders without them.
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    </div>
  );
}
