import { useLocations, useSaveLocation, useDeleteLocation, useStores } from '../../../api/config.js';
import { useUIStore } from '../../../stores/ui-store.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

export function LocationsTab() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: stores } = useStores();
  const { data, isLoading } = useLocations(storeId);
  const save = useSaveLocation();
  const del = useDeleteLocation();

  const storesList = (stores ?? []) as Array<{ id: string; name: string }>;
  const storeIdToName = Object.fromEntries(storesList.map((s) => [s.id, s.name]));
  const storeOpts = [
    { value: '__all__', label: 'All stores' },
    ...storesList.map((s) => ({ value: s.id, label: s.name })),
  ];

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'deliveryCost', header: 'Delivery cost' },
    { key: 'collectionCost', header: 'Collection cost' },
    { key: 'locationType', header: 'Type' },
    {
      key: 'storeId',
      header: 'Store',
      render: (r: Record<string, unknown>) =>
        r.storeId == null || r.storeId === '' ? 'All stores' : (storeIdToName[String(r.storeId)] ?? r.storeId),
    },
    { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'deliveryCost', label: 'Delivery cost', type: 'number' },
    { key: 'collectionCost', label: 'Collection cost', type: 'number' },
    { key: 'locationType', label: 'Type (e.g. hotel, airport)', type: 'text' },
    { key: 'storeId', label: 'Store', type: 'select', options: storeOpts },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  function transformEditingToForm(row: Record<string, unknown>): Record<string, unknown> {
    const sid = row.storeId;
    return {
      ...row,
      storeId: sid == null || sid === '' ? '__all__' : sid,
    };
  }

  function handleSaveLocation(row: Record<string, unknown>) {
    const storeIdValue = row.storeId as string;
    const existingId = row.id as number | undefined;

    if (storeIdValue === '__all__') {
      if (existingId) {
        // Editing existing row — update it with storeId = null
        // (null means available to all stores)
        save.mutate({ ...row, id: existingId, storeId: null });
      } else {
        // New row — create one entry per store
        for (const store of storesList) {
          save.mutate({ ...row, storeId: store.id });
        }
      }
    } else {
      save.mutate({ ...row, storeId: storeIdValue });
    }
  }

  if (!storeId) return <p className="text-sm text-gray-500">Select a store to manage locations.</p>;

  return (
    <ConfigSection
      title="Locations"
      data={(data ?? []) as Record<string, unknown>[]}
      isLoading={isLoading}
      columns={columns}
      fields={fields}
      transformEditingToForm={transformEditingToForm}
      onSave={handleSaveLocation}
      onDelete={(id) => del.mutate(id)}
      isSaving={save.isPending}
      saveError={save.error as Error | null}
    />
  );
}
