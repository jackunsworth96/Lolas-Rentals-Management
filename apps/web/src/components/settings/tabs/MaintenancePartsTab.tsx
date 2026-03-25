import { useMaintenanceWorkTypes, useSaveMaintenancePart, useDeleteMaintenancePart } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

export function MaintenancePartsTab() {
  const { data, isLoading } = useMaintenanceWorkTypes();
  const save = useSaveMaintenancePart();
  const del = useDeleteMaintenancePart();

  const columns = [
    { key: 'name', header: 'Part Name' },
    { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Part Name', type: 'text', required: true },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  return (
    <ConfigSection
      title="Maintenance Parts"
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
