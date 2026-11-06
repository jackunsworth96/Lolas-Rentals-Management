import { Button } from '../common/Button.js';

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
