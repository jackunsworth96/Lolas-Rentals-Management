import { formatCurrency } from '../../../utils/currency.js';

interface MoneySummaryProps {
  rentalSubtotal: number;
  extensionCharges: number;
  deliveryFee: number;
  deliveryLocation: string | null;
  collectionFee: number;
  collectionLocation: string | null;
  discount: number;
  addonTotal: number;
  /** final_total minus every itemised line; per-day add-on top-ups when the rental was extended. */
  addonExtensionAdjustment: number;
  transferAmount: number;
  charityDonation: number;
  returnCharges: number;
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
  deliveryFee,
  deliveryLocation,
  collectionFee,
  collectionLocation,
  discount,
  addonTotal,
  addonExtensionAdjustment,
  transferAmount,
  charityDonation,
  returnCharges,
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
        {deliveryFee > 0 && (
          <Line label={deliveryLocation ? `${deliveryLocation} delivery` : 'Delivery'} value={formatCurrency(deliveryFee)} />
        )}
        {collectionFee > 0 && (
          <Line label={collectionLocation ? `${collectionLocation} collection` : 'Collection'} value={formatCurrency(collectionFee)} />
        )}
        {discount > 0 && <Line label="Discount" value={`−${formatCurrency(discount)}`} className="[&>span:last-child]:text-green-600" />}
        {addonTotal > 0 && <Line label="Add-ons" value={formatCurrency(addonTotal)} />}
        {extensionCharges > 0 && addonExtensionAdjustment > 0.005 ? (
          <Line
            label="Add-on adjustments (ext.)"
            title="Per-day add-ons adjusted for extended rental days (e.g. Peace of Mind)"
            value={formatCurrency(addonExtensionAdjustment)}
          />
        ) : Math.abs(addonExtensionAdjustment) >= 0.01 && (
          <Line
            label="Other adjustments"
            title="Difference between the order total and the itemised lines (e.g. a manual price change)"
            value={addonExtensionAdjustment < 0 ? `−${formatCurrency(-addonExtensionAdjustment)}` : formatCurrency(addonExtensionAdjustment)}
          />
        )}
        {transferAmount > 0 && <Line label="Airport transfer" value={formatCurrency(transferAmount)} />}
        {surcharge > 0 && <Line label="Card surcharge" value={formatCurrency(surcharge)} />}
        {charityDonation > 0 && <Line label="Charity donation" value={formatCurrency(charityDonation)} className="[&>span:last-child]:text-teal-700" />}
        {returnCharges > 0 && <Line label="Return charges" value={formatCurrency(returnCharges)} />}
        {securityDeposit > 0 && <Line label="Security deposit" value={formatCurrency(securityDeposit)} />}
        <Line label="Total" value={formatCurrency(total)} className="font-semibold [&>span:first-child]:text-gray-900" />
        <Line label="Paid (rental)" value={`−${formatCurrency(totalPaid)}`} className="[&>span:last-child]:text-green-600" />
        {pendingExtensionsTotal > 0 && (
          <Line label="Unpaid extensions (IOU)" value={formatCurrency(pendingExtensionsTotal)} className="bg-amber-50 font-medium [&>span]:text-amber-800" />
        )}
      </div>
    </section>
  );
}
