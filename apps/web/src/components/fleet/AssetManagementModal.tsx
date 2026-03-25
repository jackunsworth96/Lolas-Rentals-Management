import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { useVehicle, useRecordPurchase, useRecordSale, useBatchDepreciation } from '../../api/fleet.js';
import { useChartOfAccounts } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';

interface AssetManagementModalProps {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
}

export function AssetManagementModal({ open, onClose, vehicleId }: AssetManagementModalProps) {
  const { data: vehicle, isLoading } = useVehicle(vehicleId);
  const { data: accounts = [] } = useChartOfAccounts();
  const recordPurchase = useRecordPurchase();
  const recordSale = useRecordSale();
  const batchDepreciation = useBatchDepreciation();

  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [setUpCosts, setSetUpCosts] = useState('0');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState('36');
  const [salvageValue, setSalvageValue] = useState('0');
  const [fixedAssetAccountId, setFixedAssetAccountId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');

  const [saleDate, setSaleDate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleCashAccountId, setSaleCashAccountId] = useState('');
  const [saleFixedAssetAccountId, setSaleFixedAssetAccountId] = useState('');
  const [saleAccDepreciationAccountId, setSaleAccDepreciationAccountId] = useState('');
  const [gainLossAccountId, setGainLossAccountId] = useState('');

  const [depreciationAccountId, setDepreciationAccountId] = useState('');
  const [accumulatedAccountId, setAccumulatedAccountId] = useState('');

  const handleRecordPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchasePrice || !purchaseDate || !fixedAssetAccountId || !cashAccountId) return;
    recordPurchase.mutate(
      {
        vehicleId,
        purchasePrice: Number(purchasePrice),
        purchaseDate,
        setUpCosts: Number(setUpCosts) || 0,
        usefulLifeMonths: Number(usefulLifeMonths) || 36,
        salvageValue: Number(salvageValue) || 0,
        fixedAssetAccountId,
        cashAccountId,
      },
      { onSuccess: () => onClose() },
    );
  };

  const handleRecordSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleDate || !saleCashAccountId || !saleFixedAssetAccountId || !saleAccDepreciationAccountId || !gainLossAccountId) return;
    recordSale.mutate(
      {
        vehicleId,
        saleDate,
        salePrice: Number(salePrice) || 0,
        cashAccountId: saleCashAccountId,
        fixedAssetAccountId: saleFixedAssetAccountId,
        accDepreciationAccountId: saleAccDepreciationAccountId,
        gainLossAccountId,
      },
      { onSuccess: () => onClose() },
    );
  };

  const handleBatchDepreciation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depreciationAccountId || !accumulatedAccountId) return;
    batchDepreciation.mutate(
      { vehicleIds: [vehicleId], depreciationAccountId, accumulatedAccountId },
      { onSuccess: () => onClose() },
    );
  };

  if (!open) return null;
  if (isLoading || !vehicle) {
    return (
      <Modal open onClose={onClose} title="Asset" size="md">
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </Modal>
    );
  }

  const accList = accounts as Array<{ id: string; name: string; type?: string; accountType?: string }>;
  const accType = (a: (typeof accList)[0]) => a.type ?? a.accountType ?? '';

  return (
    <Modal open onClose={onClose} title={`Asset — ${vehicle.name}`} size="lg">
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 font-medium text-gray-900">Current values</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-gray-500">Purchase price</dt><dd>{formatCurrency(vehicle.purchasePrice ?? 0)}</dd></div>
            <div><dt className="text-gray-500">Purchase date</dt><dd>{vehicle.purchaseDate ? formatDate(vehicle.purchaseDate) : '—'}</dd></div>
            <div><dt className="text-gray-500">Set-up costs</dt><dd>{formatCurrency(vehicle.setUpCosts ?? 0)}</dd></div>
            <div><dt className="text-gray-500">Total bike cost</dt><dd>{formatCurrency(vehicle.totalBikeCost ?? 0)}</dd></div>
            <div><dt className="text-gray-500">Useful life (months)</dt><dd>{vehicle.usefulLifeMonths ?? '—'}</dd></div>
            <div><dt className="text-gray-500">Salvage value</dt><dd>{formatCurrency(vehicle.salvageValue ?? 0)}</dd></div>
            <div><dt className="text-gray-500">Accumulated depreciation</dt><dd>{formatCurrency(vehicle.accumulatedDepreciation ?? 0)}</dd></div>
            <div><dt className="text-gray-500">Book value</dt><dd className="font-medium">{formatCurrency(vehicle.bookValue ?? 0)}</dd></div>
            <div><dt className="text-gray-500">Date sold</dt><dd>{vehicle.dateSold ? formatDate(vehicle.dateSold) : '—'}</dd></div>
            <div><dt className="text-gray-500">Sold price</dt><dd>{vehicle.soldPrice != null ? formatCurrency(vehicle.soldPrice) : '—'}</dd></div>
            <div><dt className="text-gray-500">Profit / loss</dt><dd>{vehicle.profitLoss != null ? formatCurrency(vehicle.profitLoss) : '—'}</dd></div>
          </dl>
        </section>

        <section className="border-t border-gray-200 pt-4">
          <h3 className="mb-3 font-medium text-gray-900">Record purchase</h3>
          <form onSubmit={handleRecordPurchase} className="flex flex-wrap gap-4">
            <label className="block">
              <span className="text-sm text-gray-600">Purchase price</span>
              <input type="number" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} required className="mt-1 block w-32 rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Date</span>
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required className="mt-1 block rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Set-up costs</span>
              <input type="number" step="0.01" value={setUpCosts} onChange={(e) => setSetUpCosts(e.target.value)} className="mt-1 block w-24 rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Useful life (months)</span>
              <input type="number" value={usefulLifeMonths} onChange={(e) => setUsefulLifeMonths(e.target.value)} className="mt-1 block w-20 rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Salvage value</span>
              <input type="number" step="0.01" value={salvageValue} onChange={(e) => setSalvageValue(e.target.value)} className="mt-1 block w-24 rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Fixed asset account</span>
              <select value={fixedAssetAccountId} onChange={(e) => setFixedAssetAccountId(e.target.value)} required className="mt-1 block w-40 rounded border px-2 py-1.5 text-sm">
                <option value="">Select</option>
                {accList.filter((a) => (accType(a) || '').toLowerCase() === 'asset').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Cash account</span>
              <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)} required className="mt-1 block w-40 rounded border px-2 py-1.5 text-sm">
                <option value="">Select</option>
                {accList.filter((a) => (accType(a) || '').toLowerCase() === 'asset').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={recordPurchase.isPending} className="self-end rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">Record purchase</button>
          </form>
          {recordPurchase.error && <p className="mt-2 text-sm text-red-600">{(recordPurchase.error as Error).message}</p>}
        </section>

        <section className="border-t border-gray-200 pt-4">
          <h3 className="mb-3 font-medium text-gray-900">Record sale</h3>
          <form onSubmit={handleRecordSale} className="flex flex-wrap gap-4">
            <label className="block">
              <span className="text-sm text-gray-600">Sale date</span>
              <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required className="mt-1 block rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Sale price</span>
              <input type="number" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="mt-1 block w-32 rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Cash account</span>
              <select value={saleCashAccountId} onChange={(e) => setSaleCashAccountId(e.target.value)} required className="mt-1 block w-40 rounded border px-2 py-1.5 text-sm">
                <option value="">Select</option>
                {accList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Fixed asset account</span>
              <select value={saleFixedAssetAccountId} onChange={(e) => setSaleFixedAssetAccountId(e.target.value)} required className="mt-1 block w-40 rounded border px-2 py-1.5 text-sm">
                <option value="">Select</option>
                {accList.filter((a) => (accType(a) || '').toLowerCase() === 'asset').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Accumulated depreciation account</span>
              <select value={saleAccDepreciationAccountId} onChange={(e) => setSaleAccDepreciationAccountId(e.target.value)} required className="mt-1 block w-40 rounded border px-2 py-1.5 text-sm">
                <option value="">Select</option>
                {accList.filter((a) => (accType(a) || '').toLowerCase() === 'asset').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Gain/loss account</span>
              <select value={gainLossAccountId} onChange={(e) => setGainLossAccountId(e.target.value)} required className="mt-1 block w-40 rounded border px-2 py-1.5 text-sm">
                <option value="">Select</option>
                {accList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={recordSale.isPending} className="self-end rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">Record sale</button>
          </form>
          {recordSale.error && <p className="mt-2 text-sm text-red-600">{(recordSale.error as Error).message}</p>}
        </section>

        <section className="border-t border-gray-200 pt-4">
          <h3 className="mb-3 font-medium text-gray-900">Run depreciation (this vehicle)</h3>
          <form onSubmit={handleBatchDepreciation} className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="text-sm text-gray-600">Depreciation expense account</span>
              <select value={depreciationAccountId} onChange={(e) => setDepreciationAccountId(e.target.value)} required className="mt-1 block w-48 rounded border px-2 py-1.5 text-sm">
                <option value="">Select</option>
                {accList.filter((a) => (accType(a) || '').toLowerCase() === 'expense').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Accumulated depreciation account</span>
              <select value={accumulatedAccountId} onChange={(e) => setAccumulatedAccountId(e.target.value)} required className="mt-1 block w-48 rounded border px-2 py-1.5 text-sm">
                <option value="">Select</option>
                {accList.filter((a) => (accType(a) || '').toLowerCase() === 'asset').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={batchDepreciation.isPending} className="rounded bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50">
              {batchDepreciation.isPending ? 'Running...' : 'Run depreciation'}
            </button>
          </form>
          {batchDepreciation.error && <p className="mt-2 text-sm text-red-600">{(batchDepreciation.error as Error).message}</p>}
        </section>
      </div>
    </Modal>
  );
}
