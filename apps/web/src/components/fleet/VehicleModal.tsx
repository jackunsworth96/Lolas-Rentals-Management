import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useVehicle, useUpdateVehicle } from '../../api/fleet.js';
import { useStores, useVehicleModels } from '../../api/config.js';

const STATUS_OPTIONS = ['Available', 'Active', 'Under Maintenance', 'Service Vehicle', 'Pending ORCR', 'Sold', 'Closed'];
const PROTECTED_STATUSES = ['Sold', 'Closed'];

interface VehicleModalProps {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
}

export function VehicleModal({ open, onClose, vehicleId }: VehicleModalProps) {
  const { data: vehicle, isLoading } = useVehicle(vehicleId);
  const updateVehicle = useUpdateVehicle();
  const { data: stores = [] } = useStores();
  const { data: models = [] } = useVehicleModels();

  const [name, setName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [gpsId, setGpsId] = useState('');
  const [status, setStatus] = useState('');
  const [storeId, setStoreId] = useState('');
  const [modelId, setModelId] = useState('');
  const [currentMileage, setCurrentMileage] = useState('');
  const [orcrExpiryDate, setOrcrExpiryDate] = useState('');
  const [surfRack, setSurfRack] = useState(false);
  const [owner, setOwner] = useState('');

  const storeList = stores as Array<{ id: string; name: string }>;
  const modelList = models as Array<{ id: string; name: string }>;
  const isProtected = vehicle && PROTECTED_STATUSES.includes(vehicle.status ?? '');

  useEffect(() => {
    if (vehicle) {
      setName(vehicle.name ?? '');
      setPlateNumber(vehicle.plateNumber ?? '');
      setGpsId(vehicle.gpsId ?? '');
      setStatus(vehicle.status ?? 'Available');
      setStoreId(vehicle.storeId ?? '');
      setModelId(vehicle.modelId ?? '');
      setCurrentMileage(String(vehicle.currentMileage ?? ''));
      setOrcrExpiryDate(vehicle.orcrExpiryDate ?? '');
      setSurfRack(vehicle.surfRack ?? false);
      setOwner(vehicle.owner ?? '');
    }
  }, [vehicle]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateVehicle.mutate(
      {
        id: vehicleId,
        name: name.trim() || undefined,
        plateNumber: plateNumber.trim() || null,
        gpsId: gpsId.trim() || null,
        status: isProtected ? undefined : (status || undefined),
        storeId: storeId || undefined,
        modelId: modelId || null,
        currentMileage: currentMileage === '' ? undefined : Number(currentMileage),
        orcrExpiryDate: orcrExpiryDate.trim() || null,
        surfRack,
        owner: owner.trim() || null,
      },
      { onSuccess: () => onClose() },
    );
  };

  if (!open) return null;
  if (isLoading || !vehicle) {
    return (
      <Modal open onClose={onClose} title="Vehicle" size="md">
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${vehicle.name}`} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Plate number</span>
            <input type="text" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">GPS ID</span>
            <input type="text" value={gpsId} onChange={(e) => setGpsId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Store</span>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">—</option>
              {storeList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Model</span>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">—</option>
              {modelList.map((m) => (
                <option key={m.id} value={m.id}>{m.name ?? m.id}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={isProtected}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {isProtected && <p className="mt-1 text-xs text-amber-600">Sold and Closed status cannot be changed.</p>}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Current mileage</span>
            <input type="number" min={0} value={currentMileage} onChange={(e) => setCurrentMileage(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">ORCR expiry date</span>
            <input type="date" value={orcrExpiryDate} onChange={(e) => setOrcrExpiryDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Owner</span>
            <input type="text" value={owner} onChange={(e) => setOwner(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input type="checkbox" checked={surfRack} onChange={(e) => setSurfRack(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-700">Surf rack</span>
          </label>
        </div>
        {updateVehicle.error && <p className="text-sm text-red-600">{(updateVehicle.error as Error).message}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={updateVehicle.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Save</button>
        </div>
      </form>
    </Modal>
  );
}
