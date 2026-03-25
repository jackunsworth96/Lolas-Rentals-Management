import { usePawCardEstablishments, useSaveEstablishment, useDeleteEstablishment } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
];

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'isActive', label: 'Active', type: 'boolean' },
];

export function PawCardTab() {
  const { data, isLoading } = usePawCardEstablishments();
  const save = useSaveEstablishment();
  const del = useDeleteEstablishment();

  return (
    <ConfigSection
      title="Paw Card Establishments"
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
