import { useAddons, useSaveAddon, useDeleteAddon, useStores, useVehicleModels } from '../../../api/config.js';
import { useUIStore } from '../../../stores/ui-store.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

export function AddonsTab() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: stores } = useStores();
  const { data, isLoading } = useAddons(storeId);
  const save = useSaveAddon();
  const del = useDeleteAddon();
  const { data: vehicleModels } = useVehicleModels();

  const storesList = (stores ?? []) as Array<{ id: string; name: string }>;
  const storeIdToName = Object.fromEntries(storesList.map((s) => [s.id, s.name]));
  const storeOpts = [
    { value: '__all__', label: 'All stores' },
    ...storesList.map((s) => ({ value: s.id, label: s.name })),
  ];

  const modelsList = (vehicleModels ?? []) as Array<{ id: string; name: string }>;
  const modelIdToName = Object.fromEntries(modelsList.map((m) => [m.id, m.name]));
  const modelOpts = modelsList.map((m) => ({ value: m.id, label: m.name }));

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'addonType', header: 'Type' },
    { key: 'pricePerDay', header: 'Price/day' },
    { key: 'priceOneTime', header: 'Price one-time' },
    { key: 'mutualExclusivityGroup', header: 'Exclusivity group' },
    {
      key: 'applicableModelIds',
      header: 'Applies to',
      render: (r: Record<string, unknown>) => {
        const ids = r.applicableModelIds as string[] | null;
        if (!ids || ids.length === 0) return 'All models';
        return ids.map((id) => modelIdToName[id] ?? id).join(', ');
      },
    },
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
    { key: 'addonType', label: 'Type', type: 'select', options: [{ value: 'per_day', label: 'Per day' }, { value: 'one_time', label: 'One time' }], required: true },
    { key: 'pricePerDay', label: 'Price per day', type: 'number' },
    { key: 'priceOneTime', label: 'Price one-time', type: 'number' },
    { key: 'storeId', label: 'Store', type: 'select', options: storeOpts, default: storeId },
    { key: 'applicableModelIds', label: 'Applicable Vehicle Models (leave blank for all)', type: 'multiselect', options: modelOpts },
    { key: 'mutualExclusivityGroup', label: 'Mutual exclusivity group', type: 'text', placeholder: 'e.g. peace_of_mind' },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  function transformEditingToForm(row: Record<string, unknown>): Record<string, unknown> {
    const sid = row.storeId;
    return {
      ...row,
      storeId: sid == null || sid === '' ? (storesList[0]?.id ?? '') : sid,
      applicableModelIds: (row.applicableModelIds as string[] | null) ?? [],
    };
  }

  function handleSaveAddon(row: Record<string, unknown>) {
    const storeIdValue = row.storeId as string;
    const modelIds = row.applicableModelIds as string[];
    const payload = {
      ...row,
      applicableModelIds: modelIds.length > 0 ? modelIds : null,
    };

    if (storeIdValue === '__all__') {
      for (const store of storesList) {
        save.mutate({ ...payload, storeId: store.id });
      }
    } else {
      save.mutate({ ...payload, storeId: storeIdValue });
    }
  }

  if (!storeId) return <p className="text-sm text-gray-500">Select a store to manage add-ons.</p>;

  return (
    <ConfigSection
      title="Add-ons"
      data={(data ?? []) as Record<string, unknown>[]}
      isLoading={isLoading}
      columns={columns}
      fields={fields}
      transformEditingToForm={transformEditingToForm}
      onSave={handleSaveAddon}
      onDelete={(id) => del.mutate(id)}
      isSaving={save.isPending}
      saveError={save.error as Error | null}
    />
  );
}
