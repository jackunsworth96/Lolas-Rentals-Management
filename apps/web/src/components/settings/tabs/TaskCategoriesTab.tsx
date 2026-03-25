import { useTaskCategories, useSaveTaskCategory, useDeleteTaskCategory } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

export function TaskCategoriesTab() {
  const { data, isLoading } = useTaskCategories();
  const save = useSaveTaskCategory();
  const del = useDeleteTaskCategory();

  const columns = [
    { key: 'name', header: 'Name' },
    {
      key: 'colour',
      header: 'Colour',
      render: (r: Record<string, unknown>) => (
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-full border border-gray-200"
            style={{ backgroundColor: (r.colour as string) || '#6B7280' }}
          />
          {r.colour as string}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Active',
      render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes'),
    },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'colour', label: 'Colour (hex)', type: 'text' },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  return (
    <ConfigSection
      title="Task Categories"
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
