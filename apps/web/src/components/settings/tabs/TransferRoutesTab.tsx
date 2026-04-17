import { useTransferRoutes, useSaveTransferRoute, useDeleteTransferRoute, useStores } from '../../../api/config.js';
import { useUIStore } from '../../../stores/ui-store.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

export function TransferRoutesTab() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: stores } = useStores();
  const { data, isLoading } = useTransferRoutes(storeId);
  const save = useSaveTransferRoute();
  const del = useDeleteTransferRoute();

  const storeOpts = ((stores ?? []) as Array<{ id: string; name: string }>).map((s) => ({ value: s.id, label: s.name }));

  const columns = [
    { key: 'route', header: 'Route' },
    { key: 'storeId', header: 'Store', render: (r: Record<string, unknown>) => {
      const store = storeOpts.find((s) => s.value === r.storeId);
      return store?.label ?? (r.storeId as string | null) ?? '—';
    } },
    { key: 'vanType', header: 'Van type' },
    { key: 'pricingType', header: 'Pricing', render: (r: Record<string, unknown>) =>
      r.pricingType === 'per_head' ? 'Per Person' : 'Fixed'
    },
    { key: 'price', header: 'Price' },
    { key: 'driverCut', header: 'Driver Cut (₱)' },
    { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
  ];

  const fields: FieldDef[] = [
    { key: 'route', label: 'Route', type: 'text', required: true },
    { key: 'vanType', label: 'Van type', type: 'text' },
    { key: 'price', label: 'Price (₱)', type: 'number', required: true },
    { key: 'driverCut', label: 'Driver Cut (₱)', type: 'number' },
    { key: 'pricingType', label: 'Pricing Type', type: 'select', options: [
      { value: 'fixed', label: 'Fixed (total price)' },
      { value: 'per_head', label: 'Per Person' },
    ], default: 'fixed' },
    { key: 'storeId', label: 'Store', type: 'select', options: storeOpts },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  const helperNote = (
    <p className="text-xs text-gray-500 mb-2">
      Fixed amount paid to driver per booking. For shared van, this is per person.
    </p>
  );

  if (!storeId) return <p className="text-sm text-gray-500">Select a store to manage transfer routes.</p>;

  return (
    <ConfigSection
      title="Transfer Routes"
      data={(data ?? []) as Record<string, unknown>[]}
      isLoading={isLoading}
      columns={columns}
      fields={fields}
      extraContent={helperNote}
      onSave={(row) => save.mutate(row)}
      onDelete={(id) => del.mutate(id)}
      isSaving={save.isPending}
      saveError={save.error as Error | null}
    />
  );
}
