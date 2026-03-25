import { useState, useMemo, useCallback } from 'react';
import {
  useTimesheets,
  useEmployees,
  useSubmitTimesheet,
  useApproveTimesheets,
  useCheckDuplicates,
  type TimesheetRow,
  type EmployeeRow,
} from '../../api/hr.js';
import { useDayTypes, useStores } from '../../api/config.js';
import { useUIStore } from '../../stores/ui-store.js';
import { Badge } from '../../components/common/Badge.js';
import { formatCurrency } from '../../utils/currency.js';

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function todayStr(): string {
  return toISODate(new Date());
}

function periodDefaults() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    start: toISODate(new Date(y, m, 1)),
    end: toISODate(new Date(y, m + 1, 0)),
  };
}

function formatTime24(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}

function calcHours(timeIn: string, timeOut: string): { regular: number; overtime: number } {
  if (!timeIn || !timeOut) return { regular: 0, overtime: 0 };
  const [hIn, mIn] = timeIn.split(':').map(Number);
  const [hOut, mOut] = timeOut.split(':').map(Number);
  const inMins = hIn * 60 + (mIn || 0);
  const outMins = hOut * 60 + (mOut || 0);
  const total = (outMins > inMins ? outMins - inMins : outMins + 1440 - inMins) / 60;
  return {
    regular: Math.round(Math.min(total, 8) * 100) / 100,
    overtime: Math.round(Math.max(total - 8, 0) * 100) / 100,
  };
}

const STATUS_COLORS: Record<string, 'yellow' | 'blue' | 'green'> = {
  Pending: 'yellow',
  Approved: 'blue',
  Paid: 'green',
};

interface EntryRow {
  employeeId: string;
  employeeName: string;
  timeIn: string;
  timeOut: string;
  ninePmReturns: number;
  notes: string;
}

const LEAVE_DAY_TYPES = ['Holiday', 'Sick'];

export default function TimesheetsPage() {
  const globalStoreId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: stores = [] } = useStores();
  const storeList = stores as Array<{ id: string; name: string }>;

  const [storeId, setStoreId] = useState(globalStoreId || '');
  const [periodStart, setPeriodStart] = useState(periodDefaults().start);
  const [periodEnd, setPeriodEnd] = useState(periodDefaults().end);

  const { data: timesheets = [], isLoading: tsLoading } = useTimesheets(storeId, periodStart, periodEnd);
  const { data: employees = [] } = useEmployees(storeId);
  const { data: dayTypes = [] } = useDayTypes() as { data: Array<{ id: string; name: string }> | undefined };
  const dayTypeList = (dayTypes ?? []) as Array<{ id: string; name: string }>;
  const activeEmployees = useMemo(
    () => (employees ?? []).filter((e: EmployeeRow) => e.status === 'Active'),
    [employees],
  );

  const submitMutation = useSubmitTimesheet();
  const approveMutation = useApproveTimesheets();

  // ── Entry form state ──
  const [entryDate, setEntryDate] = useState(todayStr());
  const [entryDayType, setEntryDayType] = useState('Regular');
  const [entryRows, setEntryRows] = useState<EntryRow[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Approval state ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Duplicate detection
  const selectedEmployeeIds = useMemo(() => entryRows.map((r) => r.employeeId), [entryRows]);
  const { data: duplicates = [] } = useCheckDuplicates(storeId, entryDate, selectedEmployeeIds);
  const duplicateSet = useMemo(() => new Set((duplicates ?? []).map((d) => d.employeeId)), [duplicates]);

  const isLeaveDayType = LEAVE_DAY_TYPES.includes(entryDayType);

  function addEmployee(empId: string) {
    if (!empId || entryRows.some((r) => r.employeeId === empId)) return;
    const emp = activeEmployees.find((e) => e.id === empId);
    if (!emp) return;
    setEntryRows((prev) => [...prev, {
      employeeId: empId,
      employeeName: emp.fullName,
      timeIn: '',
      timeOut: '',
      ninePmReturns: 0,
      notes: '',
    }]);
  }

  function removeEmployee(idx: number) {
    setEntryRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<EntryRow>) {
    setEntryRows((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...patch };
      return updated;
    });
  }

  function applyCommonTime(timeIn: string, timeOut: string) {
    setEntryRows((prev) => prev.map((r) => ({ ...r, timeIn, timeOut })));
  }

  const [commonTimeIn, setCommonTimeIn] = useState('');
  const [commonTimeOut, setCommonTimeOut] = useState('');

  async function handleSubmit() {
    if (entryRows.length === 0) return;
    setErrorMsg('');

    const entries = entryRows.map((r) => {
      const hours = isLeaveDayType ? { regular: 8, overtime: 0 } : calcHours(r.timeIn, r.timeOut);
      return {
        date: entryDate,
        employeeId: r.employeeId,
        name: r.employeeName,
        dayType: entryDayType,
        timeIn: isLeaveDayType ? null : (r.timeIn || null),
        timeOut: isLeaveDayType ? null : (r.timeOut || null),
        ninePmReturnsCount: r.ninePmReturns,
        dailyNotes: r.notes || null,
        silInflation: 0,
        storeId,
      };
    });

    submitMutation.mutate(
      { entries },
      {
        onSuccess: (data: any) => {
          setSuccessMsg(`${data.created ?? entryRows.length} timesheet(s) submitted.`);
          setEntryRows([]);
          setTimeout(() => setSuccessMsg(''), 3000);
        },
        onError: (err: Error) => setErrorMsg(err.message),
      },
    );
  }

  // ── Approval ──
  const pendingTimesheets = useMemo(
    () => (timesheets ?? []).filter((t) => t.payrollStatus === 'Pending'),
    [timesheets],
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pending = filteredTimesheets.filter((t) => t.payrollStatus === 'Pending');
    const allSelected = pending.every((t) => selectedIds.has(t.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pending.map((t) => t.id)));
    }
  }

  function handleApprove() {
    if (selectedIds.size === 0) return;
    approveMutation.mutate(
      { timesheetIds: [...selectedIds] },
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          setSuccessMsg(`${selectedIds.size} timesheet(s) approved.`);
          setTimeout(() => setSuccessMsg(''), 3000);
        },
      },
    );
  }

  const filteredTimesheets = useMemo(() => {
    let list = timesheets ?? [];
    if (statusFilter !== 'all') {
      list = list.filter((t) => t.payrollStatus === statusFilter);
    }
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [timesheets, statusFilter]);

  // ── Employee quick-add list (not already in entryRows) ──
  const availableForEntry = useMemo(
    () => activeEmployees.filter((e) => !entryRows.some((r) => r.employeeId === e.id)),
    [activeEmployees, entryRows],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
        <div className="flex items-center gap-3">
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select store...</option>
            {storeList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <span className="text-gray-400">–</span>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>

      {successMsg && <div className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700">{successMsg}</div>}
      {errorMsg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}

      {!storeId ? (
        <div className="py-12 text-center text-gray-500">Select a store to view timesheets.</div>
      ) : (
        <>
          {/* ── Entry Form ── */}
          <div className="rounded-lg bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="font-medium text-gray-900">Submit Timesheets</h2>
            </div>
            <div className="p-4 space-y-4">
              {/* Common fields */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <label className="block">
                  <span className="text-sm text-gray-600">Date</span>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-600">Day Type</span>
                  <select
                    value={entryDayType}
                    onChange={(e) => setEntryDayType(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {dayTypeList.length > 0 ? (
                      dayTypeList.map((dt) => (
                        <option key={dt.id} value={dt.name}>{dt.name}</option>
                      ))
                    ) : (
                      <>
                        <option value="Regular">Regular</option>
                        <option value="Rest Day">Rest Day</option>
                        <option value="Holiday">Holiday</option>
                        <option value="Sick">Sick Day</option>
                      </>
                    )}
                  </select>
                </label>
                {!isLeaveDayType && (
                  <>
                    <label className="block">
                      <span className="text-sm text-gray-600">Common Time In</span>
                      <input
                        type="time"
                        value={commonTimeIn}
                        onChange={(e) => setCommonTimeIn(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-600">Common Time Out</span>
                      <input
                        type="time"
                        value={commonTimeOut}
                        onChange={(e) => setCommonTimeOut(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        onClick={() => applyCommonTime(commonTimeIn, commonTimeOut)}
                        disabled={!commonTimeIn || !commonTimeOut || entryRows.length === 0}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Apply to all
                      </button>
                    </div>
                  </>
                )}
              </div>

              {isLeaveDayType && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  {entryDayType} — 8 hours recorded automatically, no time entry required.
                </div>
              )}

              {/* Employee selector */}
              <div className="flex items-center gap-3">
                <select
                  onChange={(e) => { addEmployee(e.target.value); e.target.value = ''; }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value=""
                >
                  <option value="">+ Add employee...</option>
                  {availableForEntry.map((e) => (
                    <option key={e.id} value={e.id}>{e.fullName}</option>
                  ))}
                </select>
                {availableForEntry.length > 0 && (
                  <button
                    onClick={() => availableForEntry.forEach((e) => addEmployee(e.id))}
                    className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
                  >
                    Add all ({availableForEntry.length})
                  </button>
                )}
              </div>

              {/* Entry rows */}
              {entryRows.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">Employee</th>
                      {!isLeaveDayType && (
                        <>
                          <th className="px-3 py-2 font-medium text-gray-600">Time In</th>
                          <th className="px-3 py-2 font-medium text-gray-600">Time Out</th>
                          <th className="px-3 py-2 font-medium text-gray-600">Reg Hrs</th>
                          <th className="px-3 py-2 font-medium text-gray-600">OT Hrs</th>
                        </>
                      )}
                      <th className="px-3 py-2 font-medium text-gray-600">9PM Returns</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Notes</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entryRows.map((row, idx) => {
                      const hours = isLeaveDayType ? { regular: 8, overtime: 0 } : calcHours(row.timeIn, row.timeOut);
                      const isDuplicate = duplicateSet.has(row.employeeId);
                      return (
                        <tr key={row.employeeId} className={`border-b border-gray-100 ${isDuplicate ? 'bg-red-50' : ''}`}>
                          <td className="px-3 py-2">
                            <span className="font-medium text-gray-900">{row.employeeName}</span>
                            {isDuplicate && <span className="ml-2 text-xs text-red-600 font-medium">Duplicate entry exists</span>}
                          </td>
                          {!isLeaveDayType && (
                            <>
                              <td className="px-3 py-2">
                                <input type="time" value={row.timeIn} onChange={(e) => updateRow(idx, { timeIn: e.target.value })} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="time" value={row.timeOut} onChange={(e) => updateRow(idx, { timeOut: e.target.value })} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" />
                              </td>
                              <td className="px-3 py-2 tabular-nums text-gray-700">{hours.regular || '—'}</td>
                              <td className="px-3 py-2 tabular-nums text-gray-700">{hours.overtime || '—'}</td>
                            </>
                          )}
                          <td className="px-3 py-2">
                            <input type="number" min={0} value={row.ninePmReturns} onChange={(e) => updateRow(idx, { ninePmReturns: Number(e.target.value) })} className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-center" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="text" value={row.notes} onChange={(e) => updateRow(idx, { notes: e.target.value })} placeholder="Notes..." className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                          </td>
                          <td className="px-3 py-2">
                            {isDuplicate ? (
                              <Badge color="red">Duplicate</Badge>
                            ) : (
                              <Badge color="gray">Ready</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeEmployee(idx)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Submit */}
              {entryRows.length > 0 && (
                <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                  <p className="text-sm text-gray-500">
                    {entryRows.length} employee{entryRows.length !== 1 ? 's' : ''} selected
                    {duplicateSet.size > 0 && (
                      <span className="ml-2 text-red-600 font-medium">
                        ({duplicateSet.size} duplicate{duplicateSet.size !== 1 ? 's' : ''} — will be overwritten)
                      </span>
                    )}
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={submitMutation.isPending}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitMutation.isPending ? 'Submitting...' : `Submit ${entryRows.length} Timesheet${entryRows.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Existing Timesheets Table ── */}
          <div className="rounded-lg bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="font-medium text-gray-900">Timesheets</h2>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                  {['all', 'Pending', 'Approved', 'Paid'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1.5 transition ${
                        statusFilter === s
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      } ${s !== 'all' ? 'border-l border-gray-300' : ''}`}
                    >
                      {s === 'all' ? 'All' : s}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-400">{filteredTimesheets.length} record{filteredTimesheets.length !== 1 ? 's' : ''}</span>
              </div>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Approving...' : `Approve ${selectedIds.size} Selected`}
                </button>
              )}
            </div>

            {tsLoading ? (
              <div className="py-8 text-center text-gray-500">Loading timesheets...</div>
            ) : filteredTimesheets.length === 0 ? (
              <div className="py-8 text-center text-gray-500">No timesheets for this period.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={filteredTimesheets.filter((t) => t.payrollStatus === 'Pending').length > 0 && filteredTimesheets.filter((t) => t.payrollStatus === 'Pending').every((t) => selectedIds.has(t.id))}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium text-gray-600">Date</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Employee</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Day Type</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Time In</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Time Out</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">Reg Hrs</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">OT Hrs</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">9PM</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Notes</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTimesheets.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-3 py-2">
                        {t.payrollStatus === 'Pending' ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(t.id)}
                            onChange={() => toggleSelect(t.id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600"
                          />
                        ) : <span className="w-4" />}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{t.date}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{t.name || t.employeeId}</td>
                      <td className="px-3 py-2 text-gray-700">{t.dayType}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{formatTime24(t.timeIn) || '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{formatTime24(t.timeOut) || '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-right text-gray-700">{t.regularHours}</td>
                      <td className="px-3 py-2 tabular-nums text-right text-gray-700">{t.overtimeHours > 0 ? t.overtimeHours : '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-right text-gray-600">{t.ninePmReturnsCount || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">{t.dailyNotes || '—'}</td>
                      <td className="px-3 py-2">
                        <Badge color={STATUS_COLORS[t.payrollStatus] ?? 'gray'}>{t.payrollStatus}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
