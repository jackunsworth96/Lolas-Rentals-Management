import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { useFleet } from '../../api/fleet.js';
import { useEmployees } from '../../api/hr.js';
import {
  useMaintenanceRecord,
  useLogMaintenance,
  useSaveMaintenance,
  useDeleteMaintenance,
} from '../../api/maintenance.js';
import { useChartOfAccounts, useMaintenanceWorkTypes } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';

interface MaintenanceLogModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'view';
  storeId: string;
  recordId?: string;
}

interface PartEntry {
  name: string;
  cost: number;
  isCustom: boolean;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Reported', label: 'Reported' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Completed' },
];

const STATUS_COLOR: Record<string, 'gray' | 'yellow' | 'green'> = {
  Reported: 'gray',
  'In Progress': 'yellow',
  Completed: 'green',
};

function moneyVal(v: number | { amount: number } | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : (v.amount ?? 0);
}

export function MaintenanceLogModal({ open, onClose, mode, storeId, recordId }: MaintenanceLogModalProps) {
  const { data: record, isLoading: loadingRecord } = useMaintenanceRecord(recordId ?? '');
  const { data: vehicles = [] } = useFleet(storeId);
  const { data: employees = [] } = useEmployees(storeId);
  const { data: accounts = [] } = useChartOfAccounts();
  const { data: workTypes = [] } = useMaintenanceWorkTypes();

  const logMaintenance = useLogMaintenance();
  const saveMaintenance = useSaveMaintenance();
  const deleteMaintenance = useDeleteMaintenance();

  const [editing, setEditing] = useState(mode === 'create');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [assetId, setAssetId] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [status, setStatus] = useState('Reported');
  const [mechanic, setMechanic] = useState('');
  const [mechanicMode, setMechanicMode] = useState<'employee' | 'custom'>('custom');
  const [odometer, setOdometer] = useState('');
  const [nextServiceDue, setNextServiceDue] = useState('');
  const [nextServiceDueDate, setNextServiceDueDate] = useState('');
  const [downtimeTracked, setDowntimeTracked] = useState(false);
  const [downtimeStart, setDowntimeStart] = useState('');
  const [downtimeEnd, setDowntimeEnd] = useState('');
  const [ongoing, setOngoing] = useState(false);
  const [workPerformed, setWorkPerformed] = useState('');
  const [laborCost, setLaborCost] = useState('0');
  const [paidFrom, setPaidFrom] = useState('');
  const [opsNotes, setOpsNotes] = useState('');
  const [payLater, setPayLater] = useState(false);

  const [parts, setParts] = useState<PartEntry[]>([]);
  const [customPartName, setCustomPartName] = useState('');

  const populateFromRecord = useCallback((rec: Record<string, unknown>) => {
    setAssetId((rec.assetId as string) ?? '');
    setIssueDescription((rec.issueDescription as string) ?? '');
    setStatus((rec.status as string) ?? 'Reported');
    setMechanic((rec.mechanic as string) ?? '');
    setOdometer(rec.odometer != null ? String(rec.odometer) : '');
    setNextServiceDue(rec.nextServiceDue != null ? String(rec.nextServiceDue) : '');
    setNextServiceDueDate((rec.nextServiceDueDate as string) ?? '');
    setDowntimeTracked((rec.downtimeTracked as boolean) ?? false);
    setDowntimeStart((rec.downtimeStart as string) ?? '');
    setDowntimeEnd((rec.downtimeEnd as string) ?? '');
    setOngoing(rec.downtimeTracked === true && !rec.downtimeEnd);
    setWorkPerformed((rec.workPerformed as string) ?? '');
    setLaborCost(String(moneyVal(rec.laborCost as number | { amount: number } | null)));
    setPaidFrom((rec.paidFrom as string) ?? '');
    setPayLater((rec.expenseStatus as string) === 'unpaid');
    setOpsNotes((rec.opsNotes as string) ?? '');

    const empList = employees as Array<{ id: string; fullName: string }>;
    const isEmployee = empList.some((e) => e.fullName === rec.mechanic);
    setMechanicMode(isEmployee ? 'employee' : 'custom');

    const savedParts = rec.partsReplaced as PartEntry[] | null;
    if (Array.isArray(savedParts) && savedParts.length > 0) {
      setParts(savedParts.map((p) => ({ name: p.name, cost: p.cost ?? 0, isCustom: p.isCustom ?? true })));
    } else {
      setParts([]);
    }
  }, [employees]);

  useEffect(() => {
    if (mode === 'view' && record) {
      populateFromRecord(record as unknown as Record<string, unknown>);
      setEditing(false);
    }
  }, [record, mode, populateFromRecord]);

  const assetAccList = (accounts as Array<{ id: string; name: string; accountType: string }>)
    .filter((a) => a.accountType === 'Asset');
  const vehList = vehicles as Array<{ id: string; name: string }>;
  const empList = employees as Array<{ id: string; fullName: string }>;
  const partOptions = workTypes as Array<{ id: number; name: string }>;

  const totalPartsCost = useMemo(() => parts.reduce((sum, p) => sum + (p.cost || 0), 0), [parts]);
  const totalCost = useMemo(() => totalPartsCost + (Number(laborCost) || 0), [totalPartsCost, laborCost]);

  const togglePart = (name: string) => {
    setParts((prev) => {
      const exists = prev.find((p) => p.name === name);
      if (exists) return prev.filter((p) => p.name !== name);
      return [...prev, { name, cost: 0, isCustom: false }];
    });
  };

  const updatePartCost = (name: string, cost: number) => {
    setParts((prev) => prev.map((p) => (p.name === name ? { ...p, cost } : p)));
  };

  const addCustomPart = () => {
    const name = customPartName.trim();
    if (!name) return;
    if (parts.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    setParts((prev) => [...prev, { name, cost: 0, isCustom: true }]);
    setCustomPartName('');
  };

  const removePart = (name: string) => {
    setParts((prev) => prev.filter((p) => p.name !== name));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId || !issueDescription.trim() || !storeId) return;
    logMaintenance.mutate(
      {
        assetId,
        issueDescription: issueDescription.trim(),
        mechanic: mechanic.trim() || null,
        odometer: odometer === '' ? null : Number(odometer),
        storeId,
        downtimeStart: downtimeStart || null,
        notes: opsNotes.trim() || null,
        partsReplaced: parts.length > 0 ? parts : null,
        partsCost: totalPartsCost,
        laborCost: Number(laborCost) || 0,
        paidFrom: payLater ? null : (paidFrom || null),
        expenseStatus: payLater ? 'unpaid' : 'paid',
      },
      { onSuccess: () => onClose() },
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordId) return;
    saveMaintenance.mutate(
      {
        id: recordId,
        issueDescription: issueDescription.trim(),
        status,
        mechanic: mechanic.trim() || null,
        odometer: odometer === '' ? null : Number(odometer),
        nextServiceDue: nextServiceDue === '' ? null : Number(nextServiceDue),
        nextServiceDueDate: nextServiceDueDate || null,
        downtimeTracked,
        downtimeStart: downtimeStart || null,
        downtimeEnd: ongoing ? null : (downtimeEnd || null),
        workPerformed: workPerformed.trim() || null,
        partsReplaced: parts.length > 0 ? parts : null,
        partsCost: totalPartsCost,
        laborCost: Number(laborCost) || 0,
        paidFrom: payLater ? null : (paidFrom || null),
        expenseStatus: payLater ? 'unpaid' : 'paid',
        notes: opsNotes.trim() || null,
      },
      {
        onSuccess: () => {
          setEditing(false);
        },
      },
    );
  };

  const handleDelete = () => {
    if (!recordId) return;
    deleteMaintenance.mutate(recordId, { onSuccess: () => onClose() });
  };

  if (!open) return null;

  if (mode === 'create') {
    return (
      <Modal open onClose={onClose} title="Log Maintenance" size="xl">
        <form onSubmit={handleCreate} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Vehicle *</span>
              <select value={assetId} onChange={(e) => setAssetId(e.target.value)} required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Select vehicle</option>
                {vehList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Odometer</span>
              <input type="number" min={0} step="0.1" value={odometer} onChange={(e) => setOdometer(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="km" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Issue description *</span>
            <textarea value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} required rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <div>
              <span className="text-sm font-medium text-gray-700">Mechanic</span>
              <div className="mt-1 flex items-center gap-2">
                <button type="button" onClick={() => setMechanicMode('employee')}
                  className={`rounded px-2 py-1 text-xs ${mechanicMode === 'employee' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  Employee
                </button>
                <button type="button" onClick={() => setMechanicMode('custom')}
                  className={`rounded px-2 py-1 text-xs ${mechanicMode === 'custom' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  External
                </button>
              </div>
              {mechanicMode === 'employee' ? (
                <select value={mechanic} onChange={(e) => setMechanic(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Select employee</option>
                  {empList.map((e) => <option key={e.id} value={e.fullName}>{e.fullName}</option>)}
                </select>
              ) : (
                <input type="text" value={mechanic} onChange={(e) => setMechanic(e.target.value)} placeholder="External mechanic name"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              )}
            </div>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Downtime start</span>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    if (downtimeStart === today) return;
                    setDowntimeStart(today);
                  }}
                  className="rounded px-2 py-1 text-xs bg-gray-100 text-gray-600"
                >
                  Today
                </button>
              </div>
              <input type="date" value={downtimeStart} onChange={(e) => setDowntimeStart(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-gray-400">Set this date if the vehicle is off the road for a full day or more</p>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Ops notes</span>
            <textarea value={opsNotes} onChange={(e) => setOpsNotes(e.target.value)} rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>

          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">Parts Replaced</legend>
            {partOptions.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {partOptions.map((pt) => {
                  const active = parts.some((p) => p.name === pt.name);
                  return (
                    <button key={pt.id} type="button" onClick={() => togglePart(pt.name)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {pt.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mb-3 flex gap-2">
              <input type="text" value={customPartName} onChange={(e) => setCustomPartName(e.target.value)}
                placeholder="Add custom part" className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomPart(); } }} />
              <button type="button" onClick={addCustomPart}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Add</button>
            </div>
            {parts.length > 0 && (
              <div className="space-y-2">
                {parts.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">{p.name} {p.isCustom && <span className="text-xs text-gray-400">(custom)</span>}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">₱</span>
                      <input type="number" min={0} step="0.01" value={p.cost || ''} onChange={(e) => updatePartCost(p.name, Number(e.target.value) || 0)}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right" placeholder="0.00" />
                    </div>
                    <button type="button" onClick={() => removePart(p.name)} className="text-red-400 hover:text-red-600">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1 text-sm">
                  <span className="text-gray-500">Parts subtotal</span>
                  <span className="font-medium">{formatCurrency(totalPartsCost)}</span>
                </div>
              </div>
            )}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Labour cost</span>
              <input type="number" min={0} step="0.01" value={laborCost} onChange={(e) => setLaborCost(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <div>
              <span className="text-sm font-medium text-gray-700">Total cost</span>
              <div className="mt-1 flex h-[38px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold">
                {formatCurrency(totalCost)}
              </div>
            </div>
            {!payLater && (
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Paid from</span>
                <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Default (store cash account)</option>
                  {assetAccList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            )}
          </div>

          {totalCost > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <span className="text-sm font-medium text-gray-700">Payment:</span>
              <button
                type="button"
                onClick={() => setPayLater(false)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition ${!payLater ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'}`}
              >
                Pay now
              </button>
              <button
                type="button"
                onClick={() => setPayLater(true)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition ${payLater ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'}`}
              >
                Pay later
              </button>
              {payLater && (
                <span className="text-xs text-amber-700">Expense will appear as unpaid in the Expenses page</span>
              )}
            </div>
          )}

          {logMaintenance.error && <p className="text-sm text-red-600">{(logMaintenance.error as Error).message}</p>}
          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={logMaintenance.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              {logMaintenance.isPending ? 'Saving...' : 'Log Maintenance'}
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  // ── View / Edit mode ──
  if (!recordId || loadingRecord) {
    return (
      <Modal open onClose={onClose} title="Maintenance" size="xl">
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </Modal>
    );
  }

  if (!record) {
    return (
      <Modal open onClose={onClose} title="Maintenance" size="xl">
        <div className="py-8 text-center text-gray-500">Record not found</div>
      </Modal>
    );
  }

  const rec = record as Record<string, unknown>;
  const recStatus = (rec.status as string) ?? 'Reported';
  const vehicleName = (rec.vehicleName as string) ?? (rec.assetId as string);

  if (!editing) {
    return (
      <Modal open onClose={onClose} title={`Maintenance — ${vehicleName}`} size="xl">
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="flex items-center gap-3">
            <Badge color={STATUS_COLOR[recStatus] ?? 'gray'}>{recStatus}</Badge>
            <span className="text-sm text-gray-500">Created {rec.createdAt ? formatDate(rec.createdAt as string) : '—'}</span>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="font-medium text-gray-500">Vehicle</dt><dd className="mt-0.5">{vehicleName}</dd></div>
            <div><dt className="font-medium text-gray-500">Mechanic</dt><dd className="mt-0.5">{rec.mechanic as string ?? '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="font-medium text-gray-500">Issue</dt><dd className="mt-0.5">{rec.issueDescription as string ?? '—'}</dd></div>
            {rec.workPerformed && (
              <div className="sm:col-span-2"><dt className="font-medium text-gray-500">Work performed</dt><dd className="mt-0.5">{rec.workPerformed as string}</dd></div>
            )}
            <div><dt className="font-medium text-gray-500">Odometer</dt><dd className="mt-0.5">{rec.odometer != null ? `${rec.odometer}` : '—'}</dd></div>
            <div><dt className="font-medium text-gray-500">Next service (km)</dt><dd className="mt-0.5">{rec.nextServiceDue != null ? `${rec.nextServiceDue}` : '—'}</dd></div>
            <div><dt className="font-medium text-gray-500">Next service (date)</dt><dd className="mt-0.5">{rec.nextServiceDueDate ? formatDate(rec.nextServiceDueDate as string) : '—'}</dd></div>
          </dl>

          {(rec.downtimeTracked as boolean) && (
            <div className="rounded-lg border border-gray-200 p-3">
              <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Downtime</h4>
              <p className="text-sm">
                {rec.downtimeStart ? formatDate(rec.downtimeStart as string) : '—'} → {rec.downtimeEnd ? formatDate(rec.downtimeEnd as string) : <span className="text-amber-600">Ongoing</span>}
                {rec.totalDowntimeDays != null && <span className="ml-2 text-gray-500">({rec.totalDowntimeDays as number}d)</span>}
              </p>
            </div>
          )}

          {(parts.length > 0 || moneyVal(rec.laborCost as number | { amount: number } | null) > 0) && (
            <div className="rounded-lg border border-gray-200 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">Costs</h4>
              {parts.length > 0 && (
                <table className="mb-2 w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500"><th className="pb-1">Part</th><th className="pb-1 text-right">Cost</th></tr></thead>
                  <tbody>
                    {parts.map((p) => (
                      <tr key={p.name}><td>{p.name}</td><td className="text-right">{formatCurrency(p.cost)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Parts total</span>
                <span>{formatCurrency(totalPartsCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Labour</span>
                <span>{formatCurrency(moneyVal(rec.laborCost as number | { amount: number } | null))}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-sm font-semibold">
                <span>Total</span>
                <span>{formatCurrency(moneyVal(rec.totalCost as number | { amount: number } | null))}</span>
              </div>
            </div>
          )}

          {rec.opsNotes && (
            <div>
              <h4 className="text-xs font-semibold uppercase text-gray-500">Ops Notes</h4>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{rec.opsNotes as string}</p>
            </div>
          )}

          <div className="flex justify-between border-t pt-4">
            <div className="flex gap-2">
              {!confirmDelete ? (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  Delete
                </button>
              ) : (
                <>
                  <button type="button" onClick={handleDelete}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700">
                    {deleteMaintenance.isPending ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Cancel</button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Close</button>
              <button type="button" onClick={() => setEditing(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">Edit</button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Edit form ──
  return (
    <Modal open onClose={onClose} title={`Edit — ${vehicleName}`} size="xl">
      <form onSubmit={handleSave} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Odometer</span>
            <input type="number" min={0} step="0.1" value={odometer} onChange={(e) => setOdometer(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="km" />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Issue description</span>
          <textarea value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} rows={2}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Work performed</span>
          <textarea value={workPerformed} onChange={(e) => setWorkPerformed(e.target.value)} rows={2}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>

        {/* Mechanic */}
        <div>
          <span className="text-sm font-medium text-gray-700">Mechanic</span>
          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={() => setMechanicMode('employee')}
              className={`rounded px-2 py-1 text-xs ${mechanicMode === 'employee' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
              Employee
            </button>
            <button type="button" onClick={() => setMechanicMode('custom')}
              className={`rounded px-2 py-1 text-xs ${mechanicMode === 'custom' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
              External
            </button>
          </div>
          {mechanicMode === 'employee' ? (
            <select value={mechanic} onChange={(e) => setMechanic(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select employee</option>
              {empList.map((e) => <option key={e.id} value={e.fullName}>{e.fullName}</option>)}
            </select>
          ) : (
            <input type="text" value={mechanic} onChange={(e) => setMechanic(e.target.value)} placeholder="External mechanic name"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          )}
        </div>

        {/* Downtime */}
        <fieldset className="rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-sm font-medium text-gray-700">Downtime Tracking</legend>
          <label className="mb-2 flex items-center gap-2">
            <input type="checkbox" checked={downtimeTracked} onChange={(e) => setDowntimeTracked(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">Track downtime</span>
          </label>
          {downtimeTracked && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-gray-600">Start date</span>
                  <input type="date" value={downtimeStart} onChange={(e) => setDowntimeStart(e.target.value)}
                    className="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                </label>
                {!ongoing && (
                  <label className="block">
                    <span className="text-xs text-gray-600">End date</span>
                    <input type="date" value={downtimeEnd} onChange={(e) => setDowntimeEnd(e.target.value)}
                      className="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                  </label>
                )}
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={ongoing} onChange={(e) => { setOngoing(e.target.checked); if (e.target.checked) setDowntimeEnd(''); }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-700">Ongoing (no end date)</span>
              </label>
            </div>
          )}
        </fieldset>

        {/* Parts */}
        <fieldset className="rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-sm font-medium text-gray-700">Parts Replaced</legend>
          {partOptions.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {partOptions.map((pt) => {
                const active = parts.some((p) => p.name === pt.name);
                return (
                  <button key={pt.id} type="button" onClick={() => togglePart(pt.name)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {pt.name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mb-3 flex gap-2">
            <input type="text" value={customPartName} onChange={(e) => setCustomPartName(e.target.value)}
              placeholder="Add custom part" className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomPart(); } }} />
            <button type="button" onClick={addCustomPart}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Add</button>
          </div>

          {parts.length > 0 && (
            <div className="space-y-2">
              {parts.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{p.name} {p.isCustom && <span className="text-xs text-gray-400">(custom)</span>}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">₱</span>
                    <input type="number" min={0} step="0.01" value={p.cost || ''} onChange={(e) => updatePartCost(p.name, Number(e.target.value) || 0)}
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right" placeholder="0.00" />
                  </div>
                  <button type="button" onClick={() => removePart(p.name)} className="text-red-400 hover:text-red-600">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 text-sm">
                <span className="text-gray-500">Parts subtotal</span>
                <span className="font-medium">{formatCurrency(totalPartsCost)}</span>
              </div>
            </div>
          )}
        </fieldset>

        {/* Costs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Labour cost</span>
            <input type="number" min={0} step="0.01" value={laborCost} onChange={(e) => setLaborCost(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div>
            <span className="text-sm font-medium text-gray-700">Total cost</span>
            <div className="mt-1 flex h-[38px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold">
              {formatCurrency(totalCost)}
            </div>
          </div>
          {!payLater && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Paid from</span>
              <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">—</option>
                {assetAccList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
        </div>

        {totalCost > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="text-sm font-medium text-gray-700">Payment:</span>
            <button
              type="button"
              onClick={() => setPayLater(false)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${!payLater ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'}`}
            >
              Pay now
            </button>
            <button
              type="button"
              onClick={() => setPayLater(true)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${payLater ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'}`}
            >
              Pay later
            </button>
            {payLater && (
              <span className="text-xs text-amber-700">Expense will appear as unpaid in the Expenses page</span>
            )}
          </div>
        )}

        {/* Next service */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Next service due (km)</span>
            <input type="number" min={0} step="0.1" value={nextServiceDue} onChange={(e) => setNextServiceDue(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Next service due (date)</span>
            <input type="date" value={nextServiceDueDate} onChange={(e) => setNextServiceDueDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Ops notes</span>
          <textarea value={opsNotes} onChange={(e) => setOpsNotes(e.target.value)} rows={2}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>

        {saveMaintenance.error && <p className="text-sm text-red-600">{(saveMaintenance.error as Error).message}</p>}
        <div className="flex justify-end gap-2 border-t pt-4">
          <button type="button" onClick={() => { setEditing(false); if (record) populateFromRecord(rec); }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={saveMaintenance.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            {saveMaintenance.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
