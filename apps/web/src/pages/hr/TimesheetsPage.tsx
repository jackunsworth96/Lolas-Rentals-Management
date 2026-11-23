import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useTimesheets,
  useEmployees,
  useAllEmployees,
  useSubmitTimesheet,
  useApproveTimesheets,
  useCheckDuplicates,
  useDeleteTimesheet,
  useRotaCheck,
  fetchTimesheetPrefill,
  needsRotaCheck,
  type RotaFlag,
  type TimesheetRow,
  type EmployeeRow,
} from '../../api/hr.js';
import { useDayTypes, useStores } from '../../api/config.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import { formatCurrency } from '../../utils/currency.js';
import { EditTimesheetModal } from '../../components/hr/EditTimesheetModal.js';
import { Permission } from '@lolas/shared';

function toISODate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
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
  workedAtStoreId: string;
  timeIn: string;
  timeOut: string;
  ninePmReturns: number;
  notes: string;
  /** Set when loaded from the rota with a different day type (e.g. Rest Day). */
  dayType?: string;
}

function RotaFlagBadge({ t }: { t: TimesheetRow }) {
  const flags = t.rotaFlags ?? [];
  if (flags.length === 0) return null;
  const title = flags.map((f) => f.message).join('\n');
  if (needsRotaCheck(t)) return <span title={title}><Badge color="amber">Check</Badge></span>;
  if (flags.some((f) => f.level === 'warning')) return <span title={`Checked\n${title}`}><Badge color="gray">Checked</Badge></span>;
  return <span title={title} className="text-xs text-gray-400">Info</span>;
}

function FlagList({ flags }: { flags: RotaFlag[] }) {
  const warnings = flags.filter((f) => f.level === 'warning');
  if (warnings.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {warnings.map((f) => <li key={f.code} className="text-xs text-amber-700">{f.message}</li>)}
    </ul>
  );
}

const LEAVE_DAY_TYPES = ['Holiday', 'Sick'];
const HOLIDAY_PAY_RATES: Record<string, { label: string; extra: number }> = {
  'Special Holiday': { label: 'Special Holiday', extra: 30 },
  'Regular Holiday': { label: 'Regular Holiday', extra: 100 },
};

export default function TimesheetsPage() {
  const globalStoreId = useUIStore((s) => s.selectedStoreId) ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit = hasPermission(Permission.EditTimesheets);
  const { data: stores = [] } = useStores();
  const storeList = stores as Array<{ id: string; name: string }>;

  const [storeId, setStoreId] = useState(globalStoreId || 'all');
  const [periodStart, setPeriodStart] = useState(periodDefaults().start);
  const [periodEnd, setPeriodEnd] = useState(periodDefaults().end);

  const { data: timesheets = [], isLoading: tsLoading } = useTimesheets(storeId, periodStart, periodEnd);
  const { data: storeEmployees = [] } = useEmployees(storeId !== 'all' ? storeId : '');
  const { data: allEmployees = [] } = useAllEmployees();
  const employees = storeId === 'all' ? allEmployees : storeEmployees;
  const { data: dayTypes = [] } = useDayTypes() as { data: Array<{ id: string; name: string }> | undefined };
  const dayTypeList = (dayTypes ?? []) as Array<{ id: string; name: string }>;
  const activeEmployees = useMemo(
    () => (employees ?? []).filter((e: EmployeeRow) => e.status === 'Active'),
    [employees],
  );
  const storeLookup = useMemo(
    () => new Map(storeList.map((s) => [s.id, s.name])),
    [storeList],
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

  // ── Edit modal state ──
  const [editingTimesheet, setEditingTimesheet] = useState<TimesheetRow | null>(null);

  // ── Delete and rota-check state ──
  const deleteMutation = useDeleteTimesheet();
  const [deleting, setDeleting] = useState<TimesheetRow | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [ackPrompt, setAckPrompt] = useState<{ rows: TimesheetRow[]; selectIds: string[] } | null>(null);
  const [loadingRota, setLoadingRota] = useState(false);

  // Duplicate detection
  const selectedEmployeeIds = useMemo(() => entryRows.map((r) => r.employeeId), [entryRows]);
  const { data: duplicates = [] } = useCheckDuplicates(storeId, entryDate, selectedEmployeeIds);
  const duplicateSet = useMemo(() => new Set((duplicates ?? []).map((d) => d.employeeId)), [duplicates]);

  const isLeaveDayType = LEAVE_DAY_TYPES.includes(entryDayType);

  const rotaCheckEntries = useMemo(() => entryRows.map((r) => {
    const dayType = r.dayType ?? entryDayType;
    const leave = LEAVE_DAY_TYPES.includes(dayType);
    return {
      employeeId: r.employeeId,
      date: entryDate,
      name: r.employeeName,
      dayType,
      timeIn: leave ? null : r.timeIn || null,
      timeOut: leave ? null : r.timeOut || null,
      ninePmReturnsCount: r.ninePmReturns,
    };
  }), [entryRows, entryDate, entryDayType]);
  const { data: rotaCheck = [] } = useRotaCheck(rotaCheckEntries);
  const entryFlags = useMemo(() => new Map(rotaCheck.map((c) => [c.employeeId, c.flags])), [rotaCheck]);

  async function loadFromRota() {
    setErrorMsg('');
    setLoadingRota(true);
    try {
      const lines = await fetchTimesheetPrefill(entryDate, storeId);
      if (lines.length === 0) {
        setErrorMsg('Nobody on the rota left to add for this date.');
        return;
      }
      setEntryRows((prev) => {
        const next = [...prev];
        for (const l of lines) {
          if (next.some((r) => r.employeeId === l.employeeId)) continue;
          const emp = activeEmployees.find((e) => e.id === l.employeeId);
          next.push({
            employeeId: l.employeeId,
            employeeName: l.name,
            workedAtStoreId: emp?.storeId ?? (storeId !== 'all' ? storeId : ''),
            timeIn: l.row.timeIn ?? '',
            timeOut: l.row.timeOut ?? '',
            ninePmReturns: l.row.ninePmReturnsCount,
            notes: l.row.dailyNotes ?? '',
            dayType: l.row.dayType !== entryDayType ? l.row.dayType : undefined,
          });
        }
        return next;
      });
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoadingRota(false);
    }
  }

  function addEmployee(empId: string) {
    if (!empId || entryRows.some((r) => r.employeeId === empId)) return;
    const emp = activeEmployees.find((e) => e.id === empId);
    if (!emp) return;
    setEntryRows((prev) => [...prev, {
      employeeId: empId,
      employeeName: emp.fullName,
      workedAtStoreId: emp.storeId ?? storeId,
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

  const [commonTimeIn, setCommonTimeIn] = useState<string>(
    () => localStorage.getItem('lolas-common-time-in') ?? '',
  );
  const [commonTimeOut, setCommonTimeOut] = useState<string>(
    () => localStorage.getItem('lolas-common-time-out') ?? '',
  );

  useEffect(() => {
    localStorage.setItem('lolas-common-time-in', commonTimeIn);
  }, [commonTimeIn]);

  useEffect(() => {
    localStorage.setItem('lolas-common-time-out', commonTimeOut);
  }, [commonTimeOut]);

  async function handleSubmit() {
    if (entryRows.length === 0) return;
    setErrorMsg('');

    const entries = entryRows.map((r) => {
      const dayType = r.dayType ?? entryDayType;
      const leave = LEAVE_DAY_TYPES.includes(dayType);
      return {
        date: entryDate,
        employeeId: r.employeeId,
        name: r.employeeName,
        dayType,
        timeIn: leave ? null : (r.timeIn || null),
        timeOut: leave ? null : (r.timeOut || null),
        ninePmReturnsCount: r.ninePmReturns,
        dailyNotes: r.notes || null,
        silInflation: 0,
        storeId: r.workedAtStoreId,
      };
    });

    submitMutation.mutate(
      { entries },
      {
        onSuccess: (data) => {
          // 9pm returns are paid through payroll, not from the till.
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

  /** Selecting a row that doesn't match the rota asks for confirmation first. */
  function selectRows(rows: TimesheetRow[]) {
    const unchecked = rows.filter((t) => needsRotaCheck(t) && !acknowledgedIds.has(t.id));
    if (unchecked.length > 0) {
      setAckPrompt({ rows: unchecked, selectIds: rows.map((t) => t.id) });
      return;
    }
    setSelectedIds((prev) => new Set([...prev, ...rows.map((t) => t.id)]));
  }

  function confirmAck() {
    if (!ackPrompt) return;
    setAcknowledgedIds((prev) => new Set([...prev, ...ackPrompt.rows.map((t) => t.id)]));
    setSelectedIds((prev) => new Set([...prev, ...ackPrompt.selectIds]));
    setAckPrompt(null);
  }

  function toggleSelect(t: TimesheetRow) {
    if (selectedIds.has(t.id)) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(t.id);
        return next;
      });
      return;
    }
    selectRows([t]);
  }

  function toggleSelectAll() {
    const pending = filteredTimesheets.filter((t) => t.payrollStatus === 'Pending');
    const allSelected = pending.every((t) => selectedIds.has(t.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      selectRows(pending);
    }
  }

  const flaggedSelected = useMemo(
    () => (timesheets ?? []).filter((t) => selectedIds.has(t.id) && needsRotaCheck(t)).length,
    [timesheets, selectedIds],
  );

  function handleApprove() {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    approveMutation.mutate(
      { timesheetIds: [...selectedIds], acknowledgedIds: [...selectedIds].filter((id) => acknowledgedIds.has(id)) },
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          setAcknowledgedIds(new Set());
          setSuccessMsg(`${count} timesheet(s) approved.`);
          setTimeout(() => setSuccessMsg(''), 3000);
        },
        onError: (err: Error) => setErrorMsg(err.message),
      },
    );
  }

  function handleDelete() {
    if (!deleting) return;
    deleteMutation.mutate(
      { id: deleting.id, reason: deleteReason.trim() },
      {
        onSuccess: () => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(deleting.id);
            return next;
          });
          setSuccessMsg(`Timesheet for ${deleting.name ?? 'employee'} on ${deleting.date} deleted.`);
          setTimeout(() => setSuccessMsg(''), 3000);
          setDeleting(null);
          setDeleteReason('');
        },
      },
    );
  }

  const flaggedCount = useMemo(() => (timesheets ?? []).filter(needsRotaCheck).length, [timesheets]);

  const filteredTimesheets = useMemo(() => {
    let list = timesheets ?? [];
    if (statusFilter === 'Flagged') {
      list = list.filter(needsRotaCheck);
    } else if (statusFilter !== 'all') {
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
        <div className="flex items-start gap-3">
          <div className="border-l-2 border-teal-500 pl-3">
            <p className="mb-1 text-xs text-gray-400">Viewing:</p>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select store...</option>
              <option value="all">All Stores</option>
              {storeList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Overrides your default store for this page</p>
          </div>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <span className="mt-2 text-gray-400">–</span>
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
                        step={900}
                        value={commonTimeIn}
                        onChange={(e) => setCommonTimeIn(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-600">Common Time Out</span>
                      <input
                        type="time"
                        step={900}
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
              {HOLIDAY_PAY_RATES[entryDayType] && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
                  {HOLIDAY_PAY_RATES[entryDayType].label} — employees earn an additional{' '}
                  <strong>+{HOLIDAY_PAY_RATES[entryDayType].extra}%</strong> on top of their regular daily rate.
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
                <button
                  onClick={loadFromRota}
                  disabled={loadingRota}
                  className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                  title="Add everyone the rota has working on this date, with hours worked if entered on the rota"
                >
                  {loadingRota ? 'Loading…' : 'Load from rota'}
                </button>
              </div>

              {/* Entry rows */}
              {entryRows.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">Employee</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Worked At</th>
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
                            {row.dayType && (
                              <button
                                type="button"
                                onClick={() => updateRow(idx, { dayType: undefined })}
                                title={`From the rota. Click to use ${entryDayType} instead.`}
                                className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-[11px] font-semibold text-teal-800"
                              >
                                {row.dayType}
                              </button>
                            )}
                            {isDuplicate && <span className="ml-2 text-xs text-red-600 font-medium">Duplicate entry exists</span>}
                            <FlagList flags={entryFlags.get(row.employeeId) ?? []} />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={row.workedAtStoreId}
                              onChange={(e) => updateRow(idx, { workedAtStoreId: e.target.value })}
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            >
                              {storeList.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </td>
                          {!isLeaveDayType && (
                            <>
                              <td className="px-3 py-2">
                                <input type="time" step={900} value={row.timeIn} onChange={(e) => updateRow(idx, { timeIn: e.target.value })} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="time" step={900} value={row.timeOut} onChange={(e) => updateRow(idx, { timeOut: e.target.value })} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" />
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
                            ) : (entryFlags.get(row.employeeId) ?? []).some((f) => f.level === 'warning') ? (
                              <Badge color="amber">Check</Badge>
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
                  {['all', 'Pending', 'Approved', 'Paid', 'Flagged'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1.5 transition ${
                        statusFilter === s
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      } ${s !== 'all' ? 'border-l border-gray-300' : ''}`}
                      title={s === 'Flagged' ? 'Rows that don’t match the rota and haven’t been checked' : undefined}
                    >
                      {s === 'all' ? 'All' : s === 'Flagged' ? `Flagged (${flaggedCount})` : s}
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
                  {approveMutation.isPending
                    ? 'Approving...'
                    : `Approve ${selectedIds.size} Selected${flaggedSelected > 0 ? ` (${flaggedSelected} checked against rota)` : ''}`}
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
                    <th className="px-3 py-2 font-medium text-gray-600">Worked At</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Day Type</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Time In</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Time Out</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">Reg Hrs</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">OT Hrs</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">9PM</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Notes</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Rota</th>
                    {canEdit && <th className="px-3 py-2 w-16" />}
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
                            onChange={() => toggleSelect(t)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600"
                          />
                        ) : <span className="w-4" />}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{t.date}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{t.name || t.employeeId}</td>
                      <td className="px-3 py-2 text-gray-600">{storeLookup.get(t.storeId) ?? t.storeId}</td>
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
                      <td className="px-3 py-2"><RotaFlagBadge t={t} /></td>
                      {canEdit && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          {t.payrollStatus === 'Pending' && (
                            <button
                              onClick={() => { setDeleting(t); setDeleteReason(''); deleteMutation.reset(); }}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 transition"
                              title="Delete timesheet"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                          {t.payrollStatus !== 'Paid' && (
                            <button
                              onClick={() => setEditingTimesheet(t)}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition"
                              title={t.payrollStatus === 'Approved' ? 'Edit timesheet (already approved)' : 'Edit timesheet'}
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <EditTimesheetModal
        open={editingTimesheet !== null}
        onClose={() => setEditingTimesheet(null)}
        timesheet={editingTimesheet}
        stores={storeList}
        dayTypes={dayTypeList}
      />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete timesheet?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleting(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleDelete}
              disabled={deleteReason.trim().length < 3 || deleteMutation.isPending}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        }
      >
        {deleting && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              <strong>{deleting.name ?? deleting.employeeId}</strong> · {deleting.date} · {deleting.dayType}
              {deleting.timeIn ? ` · ${formatTime24(deleting.timeIn)}–${formatTime24(deleting.timeOut)}` : ''}
              {deleting.ninePmReturnsCount > 0 ? ` · ${deleting.ninePmReturnsCount} × 9pm` : ''}
            </p>
            <label className="block text-sm text-gray-600">
              Reason (kept in the audit log)
              <input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                maxLength={300}
                placeholder="e.g. Entered for the wrong date"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            {deleteMutation.error && <p className="text-sm text-red-600">{(deleteMutation.error as Error).message}</p>}
          </div>
        )}
      </Modal>

      <Modal
        open={ackPrompt !== null}
        onClose={() => setAckPrompt(null)}
        title="Check against the rota"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setAckPrompt(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={confirmAck} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600">
              I&apos;ve checked {ackPrompt && ackPrompt.rows.length > 1 ? 'these' : 'this'}
            </button>
          </div>
        }
      >
        {ackPrompt && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              {ackPrompt.rows.length === 1 ? 'This timesheet doesn’t' : `${ackPrompt.rows.length} timesheets don’t`} match the rota.
              Confirm the hours are right before approving. Your name is recorded against {ackPrompt.rows.length === 1 ? 'it' : 'them'}.
            </p>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {ackPrompt.rows.map((t) => (
                <li key={t.id} className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{t.name ?? t.employeeId} · {t.date}</p>
                  <FlagList flags={t.rotaFlags} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
