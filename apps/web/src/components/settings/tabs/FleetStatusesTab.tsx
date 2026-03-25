import { useFleetStatuses, useSaveFleetStatus, useDeleteFleetStatus } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

const columns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  {
    key: 'isRentable',
    header: 'Rentable',
    render: (row: Record<string, unknown>) => (row.isRentable ? 'Yes' : 'No'),
  },
];

const fields: FieldDef[] = [
  { key: 'id', label: 'ID (e.g. available, under_maintenance)', type: 'text', required: true, readOnlyOnEdit: true },
  { key: 'name', label: 'Display Name', type: 'text', required: true },
  { key: 'isRentable', label: 'Vehicle is available for hire in this status', type: 'boolean' },
];

export function FleetStatusesTab() {
  const { data, isLoading } = useFleetStatuses();
  const save = useSaveFleetStatus();
  const del = useDeleteFleetStatus();
  return (
    <ConfigSection
      title="Fleet Statuses"
      data={(data ?? []) as Record<string, unknown>[]}
      isLoading={isLoading}
      columns={columns}
      fields={fields}
      onSave={(row) => save.mutate(row)}
      onDelete={(id) => del.mutate(String(id))}
      isSaving={save.isPending}
      saveError={save.error as Error | null}
    />
  );
}
