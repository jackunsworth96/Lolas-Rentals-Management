import { useState, useCallback } from 'react';
import { useExpenseCategories, useSaveExpenseCategory, useDeleteExpenseCategory, useChartOfAccounts, useStores } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

export function ExpenseCategoriesTab() {
  const { data, isLoading } = useExpenseCategories();
  const { data: accounts } = useChartOfAccounts();
  const { data: stores = [] } = useStores();
  const save = useSaveExpenseCategory();
  const del = useDeleteExpenseCategory();

  const [applyToAllStores, setApplyToAllStores] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<Error | null>(null);

  const accountList = (accounts ?? []) as Array<{
    id: string;
    name: string;
    storeId?: string | null;
  }>;

  // Find names that appear more than once
  const nameCounts = accountList.reduce<Record<string, number>>(
    (acc, a) => ({ ...acc, [a.name]: (acc[a.name] ?? 0) + 1 }),
    {},
  );

  const accountOpts = accountList.map((a) => ({
    value: a.id,
    label: nameCounts[a.name] > 1
      ? `${a.name} (${
          a.storeId === 'store-lolas' ? "Lola's" :
          a.storeId === 'store-bass' ? 'Bass' :
          a.storeId === 'company' ? 'Company' :
          a.storeId ?? 'Shared'
        })`
      : a.name,
  }));

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'mainCategory', header: 'Main category' },
    {
      key: 'accountId',
      header: 'Account',
      render: (row: Record<string, unknown>) => {
        const found = accountList.find((a) => a.id === row.accountId);
        return found ? found.name : String(row.accountId ?? '—');
      },
    },
    { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'mainCategory', label: 'Main category', type: 'text' },
    { key: 'accountId', label: 'Account', type: 'select', options: accountOpts },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  const handleSave = useCallback(
    async (payload: Record<string, unknown>) => {
      const isCreating = !payload._method;
      setSaving(true);
      setSaveErr(null);
      try {
        if (isCreating && applyToAllStores) {
          const storeIds = (stores as Array<{ id: string }>)
            .map((s) => s.id)
            .filter((id) => id !== 'company');

          const selectedAccountId = payload.accountId as string | undefined;
          const selectedAccount = accountList.find((a) => a.id === selectedAccountId);
          const selectedAccountName = selectedAccount?.name ?? null;

          for (const storeId of storeIds) {
            const matchingAccount = selectedAccountName
              ? accountList.find(
                  (a) => a.name === selectedAccountName && a.storeId === storeId,
                )
              : null;

            await save.mutateAsync({
              ...payload,
              storeId,
              accountId: matchingAccount?.id ?? null,
            });
          }
        } else {
          await save.mutateAsync(payload);
        }
        setApplyToAllStores(false);
        setIsAdding(false);
      } catch (e) {
        setSaveErr(e as Error);
      } finally {
        setSaving(false);
      }
    },
    [applyToAllStores, stores, save, accountList],
  );

  return (
    <ConfigSection
      title="Expense Categories"
      data={(data ?? []) as Record<string, unknown>[]}
      isLoading={isLoading}
      columns={columns}
      fields={fields}
      extraContent={
        isAdding ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={applyToAllStores}
              onChange={(e) => setApplyToAllStores(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Apply to all stores</span>
          </label>
        ) : undefined
      }
      onSave={handleSave}
      onAdd={() => setIsAdding(true)}
      onModalClose={() => { setIsAdding(false); setApplyToAllStores(false); }}
      onDelete={(id) => del.mutate(id)}
      isSaving={saving}
      saveError={saveErr}
    />
  );
}
