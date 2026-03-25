import { useChartOfAccounts, useSaveAccount, useDeleteAccount, useStores } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Income', 'Expense', 'Equity'];

export function ChartOfAccountsTab() {
  const { data, isLoading } = useChartOfAccounts();
  const { data: stores } = useStores();
  const save = useSaveAccount();
  const del = useDeleteAccount();

  const storesList = (stores ?? []) as Array<{ id: string; name: string }>;
  const appliesToOpts = [
    { value: '__all__', label: 'All stores' },
    ...storesList.map((s) => ({ value: s.id, label: s.name })),
  ];
  const storeIdToName = Object.fromEntries(storesList.map((s) => [s.id, s.name]));

  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    { key: 'accountType', header: 'Type' },
    {
      key: 'storeId',
      header: 'Store',
      render: (r: Record<string, unknown>) => (r.storeId == null || r.storeId === '' ? 'All stores' : (storeIdToName[String(r.storeId)] ?? r.storeId)),
    },
    { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
  ];

  const fields: FieldDef[] = [
    { key: 'id', label: 'Account ID', type: 'text', required: true, readOnlyOnEdit: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'accountType', label: 'Type', type: 'select', options: ACCOUNT_TYPES.map((t) => ({ value: t, label: t })), required: true },
    { key: 'appliesTo', label: 'Applies to', type: 'select', options: appliesToOpts, default: '__all__' },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  function transformEditingToForm(row: Record<string, unknown>): Record<string, unknown> {
    const storeId = row.storeId;
    return {
      ...row,
      appliesTo: storeId == null || storeId === '' ? (storesList[0]?.id ?? '') : String(storeId),
    };
  }

  function handleSaveAccount(row: Record<string, unknown>) {
    const appliesTo = row.appliesTo as string;
    const { appliesTo: _a, ...rest } = row;
    const baseId = String(rest.id ?? '').trim();

    if (appliesTo === '__all__') {
      for (const store of storesList) {
        save.mutate({ ...rest, id: `${baseId}-${store.id}`, storeId: store.id });
      }
    } else {
      save.mutate({ ...rest, storeId: appliesTo });
    }
  }

  return (
    <ConfigSection
      title="Chart of Accounts"
      data={(data ?? []) as Record<string, unknown>[]}
      isLoading={isLoading}
      columns={columns}
      fields={fields}
      transformEditingToForm={transformEditingToForm}
      onSave={handleSaveAccount}
      onDelete={(id) => del.mutate(id)}
      isSaving={save.isPending}
      saveError={save.error as Error | null}
    />
  );
}
