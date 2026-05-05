import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useEditTimesheet, type TimesheetRow } from '../../api/hr.js';

interface Props {
  open: boolean;
  onClose: () => void;
  timesheet: TimesheetRow | null;
  stores: Array<{ id: string; name: string }>;
  dayTypes: Array<{ id: string; name: string }>;
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500';
const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

const LEAVE_DAY_TYPES = ['Holiday', 'Sick'];

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

export function EditTimesheetModal({ open, onClose, timesheet, stores, dayTypes }: Props) {
  const editMut = useEditTimesheet();

  const [dayType, setDayType] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [regularHours, setRegularHours] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [ninePmReturns, setNinePmReturns] = useState('');
  const [notes, setNotes] = useState('');
  const [storeId, setStoreId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (open && timesheet) {
      setDayType(timesheet.dayType);
      setTimeIn(timesheet.timeIn?.slice(0, 5) ?? '');
      setTimeOut(timesheet.timeOut?.slice(0, 5) ?? '');
      setRegularHours(String(timesheet.regularHours));
      setOvertimeHours(String(timesheet.overtimeHours));
      setNinePmReturns(String(timesheet.ninePmReturnsCount));
      setNotes(timesheet.dailyNotes ?? '');
      setStoreId(timesheet.storeId);
      setErrorMsg('');
    }
  }, [open, timesheet]);

  const isLeave = LEAVE_DAY_TYPES.includes(dayType);

  function handleTimeChange(field: 'in' | 'out', value: string) {
    if (field === 'in') setTimeIn(value);
    else setTimeOut(value);

    const newIn = field === 'in' ? value : timeIn;
    const newOut = field === 'out' ? value : timeOut;
    if (newIn && newOut && !isLeave) {
      const { regular, overtime } = calcHours(newIn, newOut);
      setRegularHours(String(regular));
      setOvertimeHours(String(overtime));
    }
  }

  function handleDayTypeChange(value: string) {
    setDayType(value);
    if (LEAVE_DAY_TYPES.includes(value)) {
      setTimeIn('');
      setTimeOut('');
      setRegularHours('8');
      setOvertimeHours('0');
    }
  }

  function handleClose() {
    editMut.reset();
    setErrorMsg('');
    onClose();
  }

  function handleSave() {
    if (!timesheet) return;
    setErrorMsg('');

    editMut.mutate(
      {
        id: timesheet.id,
        dayType,
        timeIn: isLeave ? null : (timeIn || null),
        timeOut: isLeave ? null : (timeOut || null),
        regularHours: Number(regularHours) || 0,
        overtimeHours: Number(overtimeHours) || 0,
        ninePmReturnsCount: Number(ninePmReturns) || 0,
        dailyNotes: notes || null,
        storeId,
      },
      {
        onSuccess: () => handleClose(),
        onError: (err: Error) => setErrorMsg(err.message),
      },
    );
  }

  if (!timesheet) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Edit Timesheet" size="lg">
      <div className="space-y-4">
        {/* Read-only context */}
        <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <span className="font-medium text-gray-900">{timesheet.name || timesheet.employeeId}</span>
          <span className="mx-2 text-gray-400">·</span>
          {timesheet.date}
        </div>

        {errorMsg && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Day Type */}
          <div>
            <label className={labelCls}>Day Type</label>
            <select
              value={dayType}
              onChange={(e) => handleDayTypeChange(e.target.value)}
              className={inputCls}
            >
              {dayTypes.length > 0 ? (
                dayTypes.map((dt) => (
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
          </div>

          {/* Worked At */}
          <div>
            <label className={labelCls}>Worked At</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className={inputCls}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {isLeave ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            {dayType} — 8 hours recorded automatically, no time entry required.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Time In</label>
              <input
                type="time"
                step={900}
                value={timeIn}
                onChange={(e) => handleTimeChange('in', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Time Out</label>
              <input
                type="time"
                step={900}
                value={timeOut}
                onChange={(e) => handleTimeChange('out', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Regular Hrs</label>
              <input
                type="number"
                min={0}
                max={8}
                step={0.25}
                value={regularHours}
                onChange={(e) => setRegularHours(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>OT Hrs</label>
              <input
                type="number"
                min={0}
                step={0.25}
                value={overtimeHours}
                onChange={(e) => setOvertimeHours(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>9PM Returns</label>
            <input
              type="number"
              min={0}
              value={ninePmReturns}
              onChange={(e) => setNinePmReturns(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            onClick={handleClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={editMut.isPending}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {editMut.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
