import { useState } from 'react';
import {
  useAllVehicleModels, useSaveVehicleModel, useDeleteVehicleModel, useModelPricing, useSaveModelPricing, useDeleteModelPricing, useStores,
  useVehicleModelImages, useUploadVehicleModelImage, useReorderVehicleModelImages, useDeleteVehicleModelImage,
} from '../../../api/config.js';
import { useUIStore } from '../../../stores/ui-store.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';
import { Modal } from '../../common/Modal.js';
import { ImageDropzone } from '../../common/ImageDropzone.js';

const modelColumns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'showOnCustomerWebsite', header: 'Show on website', render: (r: Record<string, unknown>) => (r.showOnCustomerWebsite === false ? 'No' : 'Yes') },
  { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
];

const modelFields: FieldDef[] = [
  { key: 'id', label: 'Model ID', type: 'text', required: true, readOnlyOnEdit: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'showOnCustomerWebsite', label: 'Show on customer website', type: 'boolean' },
  { key: 'isActive', label: 'Active', type: 'boolean' },
];

export function VehicleModelsTab() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: models, isLoading } = useAllVehicleModels();
  const saveModel = useSaveVehicleModel();
  const delModel = useDeleteVehicleModel();
  const [pricingModelId, setPricingModelId] = useState<string | null>(null);
  const [picturesModel, setPicturesModel] = useState<{ id: string; name: string } | null>(null);

  const extendedColumns = [
    ...modelColumns,
    {
      key: '_pricing',
      header: 'Pricing',
      render: (r: Record<string, unknown>) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPricingModelId(r.id as string); }} className="text-blue-600 hover:underline text-sm">Day rates</button>
      ),
    },
    {
      key: '_pictures',
      header: 'Pictures',
      render: (r: Record<string, unknown>) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPicturesModel({ id: r.id as string, name: r.name as string }); }} className="text-blue-600 hover:underline text-sm">Pictures</button>
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
      {picturesModel && (
        <PicturesPanel modelId={picturesModel.id} modelName={picturesModel.name} onClose={() => setPicturesModel(null)} />
      )}
    </div>
  );
}

function PicturesPanel({ modelId, modelName, onClose }: { modelId: string; modelName: string; onClose: () => void }) {
  const { data: images = [], isLoading } = useVehicleModelImages(modelId);
  const upload = useUploadVehicleModelImage(modelId);
  const reorder = useReorderVehicleModelImages(modelId);
  const remove = useDeleteVehicleModelImage(modelId);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function uploadAll(files: File[]) {
    for (const file of files) await upload.mutateAsync(file);
  }

  function move(index: number, delta: number) {
    const ids = images.map((img) => img.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  }

  return (
    <Modal open onClose={onClose} title={`Pictures — ${modelName}`} size="lg">
      <p className="mb-4 text-sm text-gray-500">
        The first picture is shown on the booking website. With no pictures here, the website keeps using its built-in image.
      </p>
      <ImageDropzone multiple busy={upload.isPending} onFiles={uploadAll} label="Drag pictures here, or click to choose" />
      {(upload.error || reorder.error || remove.error) && (
        <p className="mt-2 text-sm text-red-600">{((upload.error ?? reorder.error ?? remove.error) as Error).message}</p>
      )}
      {isLoading ? (
        <p className="mt-4 text-sm text-gray-500">Loading pictures…</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, index) => (
            <li key={img.id} className="overflow-hidden rounded-lg border border-gray-200">
              <div className="relative aspect-[4/3] bg-gray-50">
                <img src={img.url} alt={`${modelName} ${index + 1}`} className="h-full w-full object-contain" loading="lazy" />
                {index === 0 && (
                  <span className="absolute left-2 top-2 rounded bg-teal-600 px-2 py-0.5 text-xs font-medium text-white">Main</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                <div className="flex gap-1">
                  <button type="button" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)} className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-40" aria-label="Move earlier">←</button>
                  <button type="button" disabled={index === images.length - 1 || reorder.isPending} onClick={() => move(index, 1)} className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-40" aria-label="Move later">→</button>
                </div>
                {confirmDeleteId === img.id ? (
                  <span className="flex gap-1">
                    <button type="button" onClick={() => { remove.mutate(img.id); setConfirmDeleteId(null); }} className="rounded px-2 py-1 font-medium text-red-600 hover:bg-red-50">Delete</button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteId(img.id)} className="rounded px-2 py-1 text-red-600 hover:bg-red-50">Remove</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!isLoading && images.length === 0 && <p className="mt-4 text-sm text-gray-400">No pictures uploaded yet.</p>}
    </Modal>
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
