import { useExpenseCategories, useSaveExpenseCategory, useDeleteExpenseCategory, useChartOfAccounts } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

export function ExpenseCategoriesTab() {
  const { data, isLoading } = useExpenseCategories();
  const { data: accounts } = useChartOfAccounts();
  const save = useSaveExpenseCategory();
  const del = useDeleteExpenseCategory();

  const accountOpts = ((accounts ?? []) as Array<{ id: string; name: string }>).map((a) => ({ value: a.id, label: a.name }));

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'mainCategory', header: 'Main category' },
    { key: 'accountId', header: 'Account' },
    { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'mainCategory', label: 'Main category', type: 'text' },
    { key: 'accountId', label: 'Account', type: 'select', options: accountOpts },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  return (
    <ConfigSection
      title="Expense Categories"
      data={(data ?? []) as Record<string, unknown>[]}
      isLoading={isLoading}
      columns={columns}
      fields={fields}
      onSave={(row) => save.mutate(row)}
      onDelete={(id) => del.mutate(id)}
      isSaving={save.isPending}
      saveError={save.error as Error | null}
    />
  );
}
