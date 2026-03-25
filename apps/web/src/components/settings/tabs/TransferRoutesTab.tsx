import { useTransferRoutes, useSaveTransferRoute, useDeleteTransferRoute, useStores } from '../../../api/config.js';
import { useUIStore } from '../../../stores/ui-store.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

const columns = [
  { key: 'route', header: 'Route' },
  { key: 'vanType', header: 'Van type' },
  { key: 'price', header: 'Price' },
  { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
];

export function TransferRoutesTab() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: stores } = useStores();
  const { data, isLoading } = useTransferRoutes(storeId);
  const save = useSaveTransferRoute();
  const del = useDeleteTransferRoute();

  const storeOpts = ((stores ?? []) as Array<{ id: string; name: string }>).map((s) => ({ value: s.id, label: s.name }));

  const fields: FieldDef[] = [
    { key: 'route', label: 'Route', type: 'text', required: true },
    { key: 'vanType', label: 'Van type', type: 'text' },
    { key: 'price', label: 'Price', type: 'number', required: true },
    { key: 'storeId', label: 'Store', type: 'select', options: storeOpts },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  if (!storeId) return <p className="text-sm text-gray-500">Select a store to manage transfer routes.</p>;

  return (
    <ConfigSection
      title="Transfer Routes"
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
