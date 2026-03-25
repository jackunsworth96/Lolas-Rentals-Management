import { useState } from 'react';
import { useVehicleModels, useSaveVehicleModel, useDeleteVehicleModel, useModelPricing, useSaveModelPricing, useDeleteModelPricing, useStores } from '../../../api/config.js';
import { useUIStore } from '../../../stores/ui-store.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';
import { Modal } from '../../common/Modal.js';

const modelColumns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
];

const modelFields: FieldDef[] = [
  { key: 'id', label: 'Model ID', type: 'text', required: true, readOnlyOnEdit: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'isActive', label: 'Active', type: 'boolean' },
];

export function VehicleModelsTab() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: models, isLoading } = useVehicleModels();
  const saveModel = useSaveVehicleModel();
  const delModel = useDeleteVehicleModel();
  const [pricingModelId, setPricingModelId] = useState<string | null>(null);

  const extendedColumns = [
    ...modelColumns,
    {
      key: '_pricing',
      header: 'Pricing',
      render: (r: Record<string, unknown>) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPricingModelId(r.id as string); }} className="text-blue-600 hover:underline text-sm">Day rates</button>
      ),
    },
  ];

  if (!storeId) return <p className="text-sm text-gray-500">Select a store to manage vehicle models and pricing.</p>;

  return (
    <div>
      <ConfigSection
        title="Vehicle Models"
        data={(models ?? []) as Record<string, unknown>[]}
        isLoading={isLoading}
        columns={extendedColumns}
        fields={modelFields}
        onSave={(row) => saveModel.mutate(row)}
        onDelete={(id) => delModel.mutate(id)}
        isSaving={saveModel.isPending}
        saveError={saveModel.error as Error | null}
      />
      {pricingModelId && (
        <PricingSubPanel modelId={pricingModelId} storeId={storeId} onClose={() => setPricingModelId(null)} />
      )}
    </div>
  );
}

function PricingSubPanel({ modelId, storeId, onClose }: { modelId: string; storeId: string; onClose: () => void }) {
  const { data: stores } = useStores();
  const [selectedStoreId, setSelectedStoreId] = useState(storeId);
  const { data, isLoading } = useModelPricing(modelId, selectedStoreId);
  const save = useSaveModelPricing();
  const del = useDeleteModelPricing();

  const storesList = (stores ?? []) as Array<{ id: string; name: string }>;
  const storeName = storesList.find((s) => s.id === selectedStoreId)?.name ?? selectedStoreId;

  const pricingFields: FieldDef[] = [
    { key: 'minDays', label: 'Min days', type: 'number', required: true },
    { key: 'maxDays', label: 'Max days', type: 'number', required: true },
    { key: 'dailyRate', label: 'Daily rate', type: 'number', required: true },
  ];

  const pricingColumns = [
    { key: 'minDays', header: 'Min days' },
    { key: 'maxDays', header: 'Max days' },
    { key: 'dailyRate', header: 'Daily rate' },
  ];

  return (
    <Modal open onClose={onClose} title={`Day rates — ${modelId} (${storeName})`} size="lg">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Editing rates for</label>
        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {storesList.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <ConfigSection
        title="Pricing tiers"
        data={(data ?? []) as Record<string, unknown>[]}
        isLoading={isLoading}
        columns={pricingColumns}
        fields={pricingFields}
        onSave={(row) => save.mutate({ ...row, modelId, storeId: selectedStoreId })}
        onDelete={(id) => del.mutate(id)}
        isSaving={save.isPending}
        saveError={save.error as Error | null}
      />
    </Modal>
  );
}
