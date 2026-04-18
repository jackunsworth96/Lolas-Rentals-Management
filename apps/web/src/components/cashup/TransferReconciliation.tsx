import { Button } from '../common/Button.js';
import { formatCurrency } from '../../utils/currency.js';

function varianceColor(v: number): string {
  if (v === 0) return 'text-green-600';
  if (Math.abs(v) <= 100) return 'text-amber-600';
  return 'text-red-600';
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: number;
  color?: string;
  bold?: boolean;
}) {
  const colorCls =
    color === 'green' ? 'text-green-700' :
    color === 'red' ? 'text-red-700' :
    color === 'blue' ? 'text-blue-700' :
    color === 'cyan' ? 'text-cyan-700' : '';
  return (
    <div className="flex justify-between">
      <span className={bold ? 'font-semibold' : 'text-gray-600'}>{label}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${colorCls}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

export interface ReconcileTotalsSummary {
  openingFloat: { amount: number };
  totals: {
    cashSalesTotal: number;
    miscCashTotal?: number;
    cashDepositsHeldTotal: number;
    interStoreIn: number;
    interStoreOut: number;
    expenseTotal: number;
    depositTotal: number;
  };
}

export interface ReconcileModalProps {
  summary: ReconcileTotalsSummary;
  dateLabel: string;
  tillTotal: number;
  depEnvTotal: number;
  tillVariance: number;
  depVariance: number;
  expectedCashSales: number;
  expectedDepositsHeld: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ReconcileModal({
  summary,
  dateLabel,
  tillTotal,
  depEnvTotal,
  tillVariance,
  depVariance,
  expectedCashSales,
  expectedDepositsHeld,
  isPending,
  onConfirm,
  onCancel,
}: ReconcileModalProps) {
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          Confirm Reconciliation
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          This will lock the cash up record for{' '}
          <span className="font-medium">{dateLabel}</span>.
        </p>
        <div className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
          <Row label="Opening Float" value={summary.openingFloat.amount} />
          <Row label="Cash Sales (income)" value={summary.totals.cashSalesTotal} color="green" />
          {(summary.totals.miscCashTotal ?? 0) > 0 && (
            <Row label="Misc Sales — Cash (income)" value={summary.totals.miscCashTotal ?? 0} color="green" />
          )}
          <Row label="Cash Deposits Held (liability)" value={summary.totals.cashDepositsHeldTotal} color="cyan" />
          {summary.totals.interStoreIn > 0 && (
            <Row label="Inter-store Cash In" value={summary.totals.interStoreIn} color="green" />
          )}
          <Row label="Expenses Paid" value={-summary.totals.expenseTotal} color="red" />
          <Row label="Cash Deposited" value={-summary.totals.depositTotal} color="blue" />
          {summary.totals.interStoreOut > 0 && (
            <Row label="Inter-store Cash Out" value={-summary.totals.interStoreOut} color="red" />
          )}
          <div className="border-t border-gray-200 pt-2">
            <Row label="Expected Cash (sales)" value={expectedCashSales} bold />
            <Row label="Expected Deposits Held" value={expectedDepositsHeld} bold />
          </div>
          <Row label="Till Counted" value={tillTotal} bold />
          <Row label="Deposit Envelope" value={depEnvTotal} bold />
          <div className="border-t border-gray-200 pt-2">
            <div className="flex justify-between">
              <span className="font-semibold">Till Variance</span>
              <span className={`font-bold ${varianceColor(tillVariance)}`}>
                {tillVariance > 0 ? '+' : ''}{formatCurrency(tillVariance)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Deposit Variance</span>
              <span className={`font-bold ${varianceColor(depVariance)}`}>
                {depVariance > 0 ? '+' : ''}{formatCurrency(depVariance)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm} loading={isPending}>
            Confirm & Lock
          </Button>
        </div>
      </div>
    </ModalOverlay>
  );
}

interface AssetAccountOption {
  id: string;
  name: string;
}

export interface InterStoreTransferModalProps {
  isLolasStore: boolean;
  currentStoreName: string;
  otherStoreName: string;
  transferAmount: string;
  onTransferAmountChange: (v: string) => void;
  transferNotes: string;
  onTransferNotesChange: (v: string) => void;
  transferFromAcct: string;
  onTransferFromAcctChange: (v: string) => void;
  transferToAcct: string;
  onTransferToAcctChange: (v: string) => void;
  assetAccounts: AssetAccountOption[];
  otherStoreAccounts: AssetAccountOption[];
  routedCashAcct: string | null | undefined;
  routedOtherCashAcct: string | null | undefined;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function InterStoreTransferModal({
  isLolasStore,
  currentStoreName,
  otherStoreName,
  transferAmount,
  onTransferAmountChange,
  transferNotes,
  onTransferNotesChange,
  transferFromAcct,
  onTransferFromAcctChange,
  transferToAcct,
  onTransferToAcctChange,
  assetAccounts,
  otherStoreAccounts,
  routedCashAcct,
  routedOtherCashAcct,
  isPending,
  onConfirm,
  onCancel,
}: InterStoreTransferModalProps) {
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          {isLolasStore
            ? `Issue Float to ${otherStoreName}`
            : `Send Cash to ${otherStoreName}`}
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          {isLolasStore
            ? `Transfer opening float from ${currentStoreName} to ${otherStoreName}.`
            : `Send end-of-day cash from ${currentStoreName} to ${otherStoreName}.`}
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Amount *</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={transferAmount}
              onChange={(e) => onTransferAmountChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </div>
          {!routedCashAcct && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              From — {currentStoreName} Cash Account *
            </label>
            <select
              value={transferFromAcct}
              onChange={(e) => onTransferFromAcctChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select account...</option>
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>
          </div>
          )}
          {!routedOtherCashAcct && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              To — {otherStoreName} Cash Account *
            </label>
            <select
              value={transferToAcct}
              onChange={(e) => onTransferToAcctChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select account...</option>
              {otherStoreAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>
          </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <input
              type="text"
              value={transferNotes}
              onChange={(e) => onTransferNotesChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={onConfirm}
            loading={isPending}
            disabled={!transferAmount || parseFloat(transferAmount) <= 0 || !transferFromAcct || !transferToAcct}
          >
            {isLolasStore ? 'Issue Float' : 'Send Cash'}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  );
}
