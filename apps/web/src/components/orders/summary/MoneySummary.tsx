import { formatCurrency } from '../../../utils/currency.js';

interface MoneySummaryProps {
  rentalSubtotal: number;
  extensionCharges: number;
  addonTotal: number;
  addonExtensionAdjustment: number;
  securityDeposit: number;
  surcharge: number;
  total: number;
  totalPaid: number;
  pendingExtensionsTotal: number;
  balance: number;
  depositMethodLabel: string | null;
  /** Shown as a "change" link next to the deposit when the deposit method can be corrected. */
  onChangeDepositMethod?: () => void;
}

function Line({ label, value, className = '', title }: { label: string; value: string; className?: string; title?: string }) {
  return (
    <div className={`flex justify-between gap-3 px-3 py-1.5 ${className}`}>
      <span className="text-gray-600" title={title}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function MoneySummary({
  rentalSubtotal,
  extensionCharges,
  addonTotal,
  addonExtensionAdjustment,
  securityDeposit,
  surcharge,
  total,
  totalPaid,
  pendingExtensionsTotal,
  balance,
  depositMethodLabel,
  onChangeDepositMethod,
}: MoneySummaryProps) {
  const owed = balance > 0;
  return (
    <section className="rounded-lg border border-gray-200">
      <div className={`rounded-t-lg px-3 py-3 ${owed ? 'bg-red-50' : 'bg-green-50'}`}>
        <div className={`text-[10px] font-medium uppercase tracking-wide ${owed ? 'text-red-700' : 'text-green-700'}`}>Balance due</div>
        <div className={`text-2xl font-bold tabular-nums ${owed ? 'text-red-700' : 'text-green-700'}`}>{formatCurrency(balance)}</div>
        {securityDeposit > 0 && (
          <div className="mt-0.5 text-xs text-charcoal-brand/70">
            Deposit held {formatCurrency(securityDeposit)}
            <span className={depositMethodLabel ? '' : ' text-amber-700'}> ({depositMethodLabel ?? 'method not recorded'})</span>
            {onChangeDepositMethod && (
              <button type="button" onClick={onChangeDepositMethod} className="ml-1.5 font-medium text-teal-brand hover:underline">
                change
              </button>
            )}
          </div>
        )}
      </div>
      <div className="divide-y divide-sand-brand text-sm">
        <Line label="Rental" value={formatCurrency(rentalSubtotal)} />
        {extensionCharges > 0 && <Line label="Extensions" value={formatCurrency(extensionCharges)} />}
        {addonTotal > 0 && <Line label="Add-ons" value={formatCurrency(addonTotal)} />}
        {extensionCharges > 0 && addonExtensionAdjustment > 0.005 && (
          <Line
            label="Add-on adjustments (ext.)"
            title="Per-day add-ons adjusted for extended rental days (e.g. Peace of Mind)"
            value={formatCurrency(addonExtensionAdjustment)}
          />
        )}
        {securityDeposit > 0 && <Line label="Security deposit" value={formatCurrency(securityDeposit)} />}
        {surcharge > 0 && <Line label="Card surcharge" value={formatCurrency(surcharge)} />}
        <Line label="Total" value={formatCurrency(total)} className="font-semibold [&>span:first-child]:text-gray-900" />
        <Line label="Paid (rental)" value={`−${formatCurrency(totalPaid)}`} className="[&>span:last-child]:text-green-600" />
        {pendingExtensionsTotal > 0 && (
          <Line label="Unpaid extensions (IOU)" value={formatCurrency(pendingExtensionsTotal)} className="bg-amber-50 font-medium [&>span]:text-amber-800" />
        )}
      </div>
    </section>
  );
}
