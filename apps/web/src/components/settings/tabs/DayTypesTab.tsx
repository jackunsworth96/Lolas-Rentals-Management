import { useDayTypes, useSaveDayType, useDeleteDayType } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

const columns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
];

const fields: FieldDef[] = [
  { key: 'id', label: 'ID (e.g. regular, rest_day)', type: 'text', required: true, readOnlyOnEdit: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
];

export function DayTypesTab() {
  const { data, isLoading } = useDayTypes();
  const save = useSaveDayType();
  const del = useDeleteDayType();
  return (
    <ConfigSection
      title="Day Types"
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
