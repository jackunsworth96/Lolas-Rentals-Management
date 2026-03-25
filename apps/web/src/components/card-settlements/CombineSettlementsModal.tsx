import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { useCombineSettlements } from '../../api/card-settlements.js';
import { formatCurrency } from '../../utils/currency.js';

interface Settlement {
  id: string;
  orderId: string | null;
  name: string | null;
  amount: number;
}

interface CombineSettlementsModalProps {
  open: boolean;
  onClose: () => void;
  selected: Settlement[];
}

export function CombineSettlementsModal({ open, onClose, selected }: CombineSettlementsModalProps) {
  const combine = useCombineSettlements();
  const [batchNo, setBatchNo] = useState('');

  const total = selected.reduce((s, r) => s + r.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchNo.trim()) return;
    combine.mutate(
      { ids: selected.map((s) => s.id), batchNo: batchNo.trim() },
      { onSuccess: () => onClose() },
    );
  };

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Combine settlements" size="md">
      <div className="mb-4 rounded-lg bg-gray-50 p-3">
        <p className="text-sm text-gray-600">{selected.length} settlements · {formatCurrency(total)} total</p>
        <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-500">
          {selected.map((s) => (
            <li key={s.id}>{s.orderId ?? '—'} · {s.name ?? 'Unknown'} · {formatCurrency(s.amount)}</li>
          ))}
        </ul>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Batch number</span>
          <input type="text" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required
            placeholder="e.g. BATCH-2026-03-19"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        {combine.error && <p className="text-sm text-red-600">{(combine.error as Error).message}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={combine.isPending || !batchNo.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {combine.isPending ? 'Combining...' : 'Combine'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
