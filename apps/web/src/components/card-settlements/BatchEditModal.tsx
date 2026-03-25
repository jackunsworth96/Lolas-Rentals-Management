import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { useBatchEditSettlements } from '../../api/card-settlements.js';

interface BatchEditModalProps {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
}

export function BatchEditModal({ open, onClose, selectedIds }: BatchEditModalProps) {
  const batchEdit = useBatchEditSettlements();
  const [forecastedDate, setForecastedDate] = useState('');
  const [settlementRef, setSettlementRef] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { ids: selectedIds };
    if (forecastedDate) body.forecastedDate = forecastedDate;
    if (settlementRef.trim()) body.settlementRef = settlementRef.trim();
    batchEdit.mutate(body, { onSuccess: () => onClose() });
  };

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Batch edit" size="md">
      <p className="mb-4 text-sm text-gray-600">{selectedIds.length} settlement{selectedIds.length > 1 ? 's' : ''} selected</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Forecasted settlement date</span>
          <input type="date" value={forecastedDate} onChange={(e) => setForecastedDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Merchant reference</span>
          <input type="text" value={settlementRef} onChange={(e) => setSettlementRef(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <p className="text-xs text-gray-500">Leave a field empty to keep it unchanged.</p>
        {batchEdit.error && <p className="text-sm text-red-600">{(batchEdit.error as Error).message}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={batchEdit.isPending || (!forecastedDate && !settlementRef.trim())}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {batchEdit.isPending ? 'Updating...' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
