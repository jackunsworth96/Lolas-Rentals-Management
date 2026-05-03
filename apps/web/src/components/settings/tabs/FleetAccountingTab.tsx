import { useState, useEffect, useMemo } from 'react';
import { useStores, useChartOfAccounts, useFleetAccountingConfig, useSaveFleetAccountingConfig } from '../../../api/config.js';

interface AccountRow {
  id: string;
  name: string;
  account_type?: string;
  accountType?: string;
  store_id?: string | null;
  storeId?: string | null;
}

function accType(a: AccountRow) {
  return (a.accountType ?? a.account_type ?? '').toLowerCase();
}

function AccountSelect({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <p className="mb-1 text-xs text-gray-400">{hint}</p>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">— not set —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function FleetAccountingTab() {
  const { data: rawStores = [] } = useStores() as { data: Array<{ id: string; name: string }> | undefined };
  const { data: allAccounts = [] } = useChartOfAccounts() as { data: AccountRow[] | undefined };
  const { data: configs = [], isLoading } = useFleetAccountingConfig();
  const saveMut = useSaveFleetAccountingConfig();

  const stores = rawStores.filter((s) => s.id !== 'company');
  const [selectedStoreId, setSelectedStoreId] = useState('');

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) setSelectedStoreId(stores[0].id);
  }, [stores, selectedStoreId]);

  const storeConfig = configs.find((c) => c.storeId === selectedStoreId);

  const [fixedAsset, setFixedAsset] = useState('');
  const [accDep, setAccDep] = useState('');
  const [depExpense, setDepExpense] = useState('');
  const [gainLoss, setGainLoss] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFixedAsset(storeConfig?.fixedAssetAccountId ?? '');
    setAccDep(storeConfig?.accDepreciationAccountId ?? '');
    setDepExpense(storeConfig?.depreciationExpenseAccountId ?? '');
    setGainLoss(storeConfig?.gainLossAccountId ?? '');
    setSaved(false);
  }, [storeConfig, selectedStoreId]);

  const storeAccounts = useMemo(() => {
    const relevant = allAccounts.filter((a) => {
      const sid = a.storeId ?? a.store_id ?? null;
      return sid === null || sid === 'company' || sid === selectedStoreId;
    });
    const nameCount = new Map<string, number>();
    for (const a of relevant) nameCount.set(a.name, (nameCount.get(a.name) ?? 0) + 1);
    const storeName = (sid: string | null | undefined) =>
      rawStores.find((s) => s.id === sid)?.name ?? sid ?? '';
    return relevant.map((a) => {
      const sid = a.storeId ?? a.store_id ?? null;
      return {
        ...a,
        label: (nameCount.get(a.name) ?? 0) > 1 ? `${a.name} (${storeName(sid)})` : a.name,
      };
    });
  }, [allAccounts, rawStores, selectedStoreId]);

  const assetAccounts = storeAccounts.filter((a) => accType(a) === 'asset');
  const expenseAccounts = storeAccounts.filter((a) => accType(a) === 'expense');
  const incomeExpenseAccounts = storeAccounts.filter((a) => ['income', 'expense', 'revenue'].includes(accType(a)));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;
    saveMut.mutate(
      {
        storeId: selectedStoreId,
        fixedAssetAccountId: fixedAsset || null,
        accDepreciationAccountId: accDep || null,
        depreciationExpenseAccountId: depExpense || null,
        gainLossAccountId: gainLoss || null,
      },
      {
        onSuccess: () => setSaved(true),
      },
    );
  };

  if (isLoading) return <div className="py-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Fleet Accounting Defaults</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure the GL accounts used when recording vehicle purchases, sales, and depreciation.
          These are set once per store — you won't need to select them each time you record a transaction.
        </p>
      </div>

      {stores.length > 1 && (
        <div className="flex gap-2">
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedStoreId(s.id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                selectedStoreId === s.id
                  ? 'bg-teal-600 text-white'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {selectedStoreId && (
        <form onSubmit={handleSave} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <AccountSelect
            label="Fixed asset account"
            hint="The balance sheet account where vehicle costs are capitalised (e.g. 'Vehicles')."
            value={fixedAsset}
            onChange={setFixedAsset}
            options={assetAccounts}
          />
          <AccountSelect
            label="Accumulated depreciation account"
            hint="The contra-asset account that accumulates depreciation against the vehicle fleet."
            value={accDep}
            onChange={setAccDep}
            options={assetAccounts}
          />
          <AccountSelect
            label="Depreciation expense account"
            hint="The P&L account charged each month when running depreciation (e.g. 'Vehicle Depreciation')."
            value={depExpense}
            onChange={setDepExpense}
            options={expenseAccounts}
          />
          <AccountSelect
            label="Gain / loss on disposal account"
            hint="The P&L account for profit or loss when a vehicle is sold."
            value={gainLoss}
            onChange={setGainLoss}
            options={incomeExpenseAccounts}
          />

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={saveMut.isPending}
              className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saveMut.isPending ? 'Saving…' : 'Save defaults'}
            </button>
            {saved && (
              <span className="text-sm text-green-600">Saved ✓</span>
            )}
            {saveMut.error && (
              <span className="text-sm text-red-600">{(saveMut.error as Error).message}</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
