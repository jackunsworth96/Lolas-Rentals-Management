import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { useVehicleServiceHistory } from '../../api/maintenance.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import { generateServiceHistoryPdf } from '../../utils/serviceHistoryPdf.js';

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
  totalDowntimeDays: number | null;
  odometer: number | null;
  nextServiceDue: number | null;
  nextServiceDueDate: string | null;
  opsNotes: string | null;
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
                    <span>Odometer: <span className="text-gray-700">{r.odometer.toLocaleString('en-PH')} km</span></span>
                  )}
                  {r.downtimeStart && (
                    <span>
                      Downtime: <span className="text-gray-700">
                        {formatDate(r.downtimeStart)} → {r.downtimeEnd ? formatDate(r.downtimeEnd) : 'ongoing'}
                      </span>
                    </span>
                  )}
                  {r.nextServiceDueDate && (
                    <span>
                      Next service: <span className="text-gray-700">{formatDate(r.nextServiceDueDate)}</span>
                    </span>
                  )}
                  {r.nextServiceDue != null && (
                    <span>
                      Next service (km): <span className="text-gray-700">{r.nextServiceDue.toLocaleString('en-PH')} km</span>
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

                {r.opsNotes && (
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-medium">Notes: </span>
                    {r.opsNotes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!isLoading && records.length > 0 && (
        <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={() => generateServiceHistoryPdf(vehicleName, records)}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-700 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M7 10V7a5 5 0 0 1 10 0v3" />
            </svg>
            Export PDF
          </button>
        </div>
      )}
    </Modal>
  );
}
