import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { useVehicleServiceHistory } from '../../api/maintenance.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';

interface ServiceHistoryModalProps {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleName: string;
  storeId: string;
}

interface PartEntry {
  name: string;
  cost: number;
}

interface MaintenanceRow {
  id: string;
  status: string;
  issueDescription: string | null;
  workPerformed: string | null;
  mechanic: string | null;
  partsReplaced: PartEntry[] | null;
  partsCost: number | { amount: number };
  laborCost: number | { amount: number };
  totalCost: number | { amount: number };
  downtimeStart: string | null;
  downtimeEnd: string | null;
  odometer: number | null;
  createdAt: string;
}

function moneyVal(v: number | { amount: number } | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : (v.amount ?? 0);
}

const STATUS_COLOR: Record<string, 'gray' | 'yellow' | 'green'> = {
  Reported: 'gray',
  'In Progress': 'yellow',
  Completed: 'green',
};

export function ServiceHistoryModal({ open, onClose, vehicleId, vehicleName, storeId }: ServiceHistoryModalProps) {
  const { data, isLoading } = useVehicleServiceHistory(vehicleId, storeId);
  const records = (data ?? []) as MaintenanceRow[];

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title={`Service History — ${vehicleName}`} size="xl">
      <div className="max-h-[70vh] overflow-y-auto">
        {isLoading ? (
          <div className="py-8 text-center text-gray-500">Loading...</div>
        ) : records.length === 0 ? (
          <div className="py-8 text-center text-gray-500">No service history for this vehicle</div>
        ) : (
          <div className="space-y-4">
            {records.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge color={STATUS_COLOR[r.status] ?? 'gray'}>{r.status}</Badge>
                    <span className="text-sm text-gray-500">{formatDate(r.createdAt)}</span>
                  </div>
                  {moneyVal(r.totalCost) > 0 && (
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(moneyVal(r.totalCost))}
                    </span>
                  )}
                </div>

                <p className="text-sm font-medium text-gray-900">{r.issueDescription ?? '—'}</p>

                {r.workPerformed && (
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-medium text-gray-500">Work: </span>
                    {r.workPerformed}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                  {r.mechanic && (
                    <span>Mechanic: <span className="text-gray-700">{r.mechanic}</span></span>
                  )}
                  {r.odometer != null && (
                    <span>Odometer: <span className="text-gray-700">{r.odometer}</span></span>
                  )}
                  {r.downtimeStart && (
                    <span>
                      Downtime: <span className="text-gray-700">
                        {formatDate(r.downtimeStart)} → {r.downtimeEnd ? formatDate(r.downtimeEnd) : 'ongoing'}
                      </span>
                    </span>
                  )}
                </div>

                {Array.isArray(r.partsReplaced) && r.partsReplaced.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-gray-500">Parts: </span>
                    <span className="text-xs text-gray-700">
                      {r.partsReplaced.map((p) => `${p.name}${p.cost > 0 ? ` (${formatCurrency(p.cost)})` : ''}`).join(', ')}
                    </span>
                  </div>
                )}

                {(moneyVal(r.partsCost) > 0 || moneyVal(r.laborCost) > 0) && (
                  <div className="mt-1 flex gap-4 text-xs text-gray-500">
                    {moneyVal(r.partsCost) > 0 && <span>Parts: {formatCurrency(moneyVal(r.partsCost))}</span>}
                    {moneyVal(r.laborCost) > 0 && <span>Labour: {formatCurrency(moneyVal(r.laborCost))}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
