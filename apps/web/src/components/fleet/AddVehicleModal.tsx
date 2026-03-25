import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { useCreateVehicle } from '../../api/fleet.js';
import { useStores, useVehicleModels } from '../../api/config.js';

interface AddVehicleModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddVehicleModal({ open, onClose }: AddVehicleModalProps) {
  const createVehicle = useCreateVehicle();
  const { data: stores = [] } = useStores();
  const { data: models = [] } = useVehicleModels();

  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [storeId, setStoreId] = useState('');
  const [gpsId, setGpsId] = useState('');
  const [surfRack, setSurfRack] = useState(false);
  const [rentableStartDate, setRentableStartDate] = useState('');
  const [registrationDate, setRegistrationDate] = useState('');

  const storeList = stores as Array<{ id: string; name: string }>;
  const modelList = models as Array<{ id: string; name: string }>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !storeId) return;
    createVehicle.mutate(
      {
        name: name.trim(),
        modelId: modelId || null,
        plateNumber: plateNumber.trim() || null,
        storeId,
        gpsId: gpsId.trim() || null,
        surfRack,
        rentableStartDate: rentableStartDate || null,
        registrationDate: registrationDate || null,
      },
      { onSuccess: () => onClose() },
    );
  };

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Add vehicle" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Model</span>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">—</option>
              {modelList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Plate number</span>
            <input
              type="text"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Store *</span>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select store</option>
              {storeList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">GPS ID</span>
            <input
              type="text"
              value={gpsId}
              onChange={(e) => setGpsId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Rentable start date</span>
            <input
              type="date"
              value={rentableStartDate}
              onChange={(e) => setRentableStartDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Registration date</span>
            <input
              type="date"
              value={registrationDate}
              onChange={(e) => setRegistrationDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={surfRack}
              onChange={(e) => setSurfRack(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Surf rack</span>
          </label>
        </div>
        {createVehicle.error && (
          <p className="text-sm text-red-600">{(createVehicle.error as Error).message}</p>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createVehicle.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {createVehicle.isPending ? 'Saving...' : 'Add vehicle'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
