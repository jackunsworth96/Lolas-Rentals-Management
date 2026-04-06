import { useState, useMemo, useCallback, useRef } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useVehicleModels } from '../../api/config.js';
import {
  useLostOpportunities,
  useCreateLostOpportunity,
  useUpdateLostOpportunity,
  useDeleteLostOpportunity,
  type LostOpportunityRow,
} from '../../api/lost-opportunity.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDateTime } from '../../utils/date.js';
import { Button } from '../../components/common/Button.js';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const REASON_PRESETS = [
  'No availability',
  'Price too high',
  'Competition',
  'Walk-away',
  'Timing conflict',
  'Other',
] as const;

const OUTCOME_PRESETS = ['Booked elsewhere', 'Will try again', 'Unknown', 'Deferred'] as const;

const PRESET_SET = new Set<string>(REASON_PRESETS);
const OTHER = 'Other';

function parseReasonForForm(reason: string | null): { preset: string; custom: string } {
  if (!reason) return { preset: '', custom: '' };
  if (PRESET_SET.has(reason) && reason !== OTHER) return { preset: reason, custom: '' };
  return { preset: OTHER, custom: reason };
}

function timeInputValue(t: string | null): string {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function LostOpportunityPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const [date, setDate] = useState(todayStr());
  const { data: rows = [], isLoading } = useLostOpportunities(storeId, date);
  const { data: vehicleModels = [] } = useVehicleModels() as {
    data: Array<{ id: string; name: string; isActive?: boolean }> | undefined;
  };

  const createMut = useCreateLostOpportunity();
  const updateMut = useUpdateLostOpportunity();
  const deleteMut = useDeleteLostOpportunity();

  const modelNames = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const m of (vehicleModels ?? [])) {
      if (m.isActive === false) continue;
      const name = String(m.name ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(name);
      }
    }
    return result.sort((a, b) => a.localeCompare(b));
  }, [vehicleModels]);

  const datalistId = 'lost-opp-fleet-names';

  const formRef = useRef<HTMLFormElement>(null);
  const [reasonPreset, setReasonPreset] = useState('');
  const [reasonCustom, setReasonCustom] = useState('');
  const [vehicleRequested, setVehicleRequested] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [durationDays, setDurationDays] = useState('');
  const [estValue, setEstValue] = useState('');
  const [timeLocal, setTimeLocal] = useState('');
  const [outcome, setOutcome] = useState('');
  const [staffNotes, setStaffNotes] = useState('');

  const reasonEffective =
    reasonPreset === OTHER ? reasonCustom.trim() : reasonPreset === '' ? '' : reasonPreset;

  const canSubmitQuick =
    storeId && reasonEffective.length > 0 && quantity >= 1;

  const resetAfterSave = useCallback(() => {
    setOutcome('');
    setStaffNotes('');
    setEstValue('');
    setDurationDays('');
    setTimeLocal('');
    setQuantity(1);
  }, []);

  const submitQuick = useCallback(() => {
    if (!canSubmitQuick) return;
    const dur = durationDays === '' ? null : Math.max(1, parseInt(durationDays, 10) || 0);
    const est = estValue === '' ? null : Math.max(0, parseFloat(estValue) || 0);
    createMut.mutate(
      {
        storeId,
        date,
        time: timeLocal || null,
        vehicleRequested: vehicleRequested.trim() || null,
        quantity,
        durationDays: dur && dur > 0 ? dur : null,
        estValue: est,
        reason: reasonEffective,
        outcome: outcome.trim() || null,
        staffNotes: staffNotes.trim() || null,
      },
      {
        onSuccess: () => {
          resetAfterSave();
          formRef.current?.querySelector<HTMLElement>('[data-focus-root="reason"]')?.focus();
        },
      },
    );
  }, [
    canSubmitQuick,
    createMut,
    date,
    durationDays,
    estValue,
    outcome,
    quantity,
    reasonEffective,
    resetAfterSave,
    staffNotes,
    storeId,
    timeLocal,
    vehicleRequested,
  ]);

  const dayCount = rows.length;
  const dayEstTotal = useMemo(
    () => rows.reduce((s, r) => s + (r.estValue ?? 0), 0),
    [rows],
  );

  const [editing, setEditing] = useState<LostOpportunityRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  function openEdit(row: LostOpportunityRow) {
    setEditing(row);
  }

  function closeEdit() {
    setEditing(null);
  }

  if (!storeId) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Lost Opportunities</h1>
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <p className="text-gray-500">Select a store in the header to log lost opportunities.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lost Opportunities</h1>
        <p className="mt-1 text-sm text-gray-500">
          Log walk-aways and missed bookings in a few taps. Reason is required; everything else is optional.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, -1))}
          className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
          aria-label="Previous day"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 text-center">
          <p className="text-lg font-semibold text-gray-900">{formatDateLabel(date)}</p>
          {date === todayStr() && (
            <span className="text-xs font-medium text-amber-700">Today</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, 1))}
          className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
          aria-label="Next day"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Today (this date)</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{dayCount}</p>
          <p className="text-sm text-amber-800">Entries logged</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Estimated value at risk</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(dayEstTotal)}</p>
          <p className="text-sm text-amber-800">Sum of est. values (if entered)</p>
        </div>
      </div>

      <form
        ref={formRef}
        className="mb-8 rounded-xl border-2 border-amber-300/80 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          submitQuick();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submitQuick();
          }
        }}
      >
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Quick log</h2>

        <div className="mb-4" data-focus-root="reason" tabIndex={-1}>
          <p className="mb-2 text-xs font-medium text-gray-600">Reason *</p>
          <div className="flex flex-wrap gap-2">
            {REASON_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setReasonPreset(p === reasonPreset ? '' : p);
                  if (p !== OTHER) setReasonCustom('');
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  reasonPreset === p
                    ? 'border-amber-600 bg-amber-600 text-white'
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-amber-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {reasonPreset === OTHER && (
            <input
              type="text"
              value={reasonCustom}
              onChange={(e) => setReasonCustom(e.target.value)}
              placeholder="Describe the reason…"
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <label className="lg:col-span-4">
            <span className="mb-1 block text-xs font-medium text-gray-600">Vehicle (type or pick)</span>
            <input
              type="text"
              list={datalistId}
              value={vehicleRequested}
              onChange={(e) => setVehicleRequested(e.target.value)}
              placeholder="e.g. Honda Beat, TukTuk"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              autoComplete="off"
            />
            <datalist id={datalistId}>
              {modelNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label className="lg:col-span-1">
            <span className="mb-1 block text-xs font-medium text-gray-600">Qty</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">Days</span>
            <input
              type="number"
              min={1}
              placeholder="—"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">Est. value</span>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="0"
              value={estValue}
              onChange={(e) => setEstValue(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">Time</span>
            <div className="flex gap-1">
              <input
                type="time"
                value={timeLocal}
                onChange={(e) => setTimeLocal(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  setTimeLocal(
                    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                  );
                }}
                className="shrink-0 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                Now
              </button>
            </div>
          </label>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-gray-600">Outcome (optional)</p>
          <div className="flex flex-wrap gap-2">
            {OUTCOME_PRESETS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome(outcome === o ? '' : o)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  outcome === o
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Staff notes</span>
          <input
            type="text"
            value={staffNotes}
            onChange={(e) => setStaffNotes(e.target.value)}
            placeholder="Optional short note"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" loading={createMut.isPending} disabled={!canSubmitQuick}>
            Log entry
          </Button>
          <span className="text-xs text-gray-400">Ctrl+Enter to submit from anywhere in the form</span>
        </div>
        {createMut.error && (
          <p className="mt-2 text-sm text-red-600">{(createMut.error as Error).message}</p>
        )}
      </form>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Log for {formatDateLabel(date)}</h2>
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-gray-400">No entries yet for this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Logged</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Reason</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Vehicle</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Qty</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Days</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Est.</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Outcome</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Notes</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-2 text-gray-600">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="max-w-[10rem] px-4 py-2 font-medium text-gray-900">{r.reason}</td>
                      <td className="max-w-[8rem] truncate px-4 py-2 text-gray-600" title={r.vehicleRequested ?? ''}>
                        {r.vehicleRequested ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.quantity}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.durationDays ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.estValue != null ? formatCurrency(r.estValue) : '—'}
                      </td>
                      <td className="max-w-[8rem] truncate px-4 py-2 text-gray-600" title={r.outcome ?? ''}>
                        {r.outcome ?? '—'}
                      </td>
                      <td className="max-w-[10rem] truncate px-4 py-2 text-gray-500" title={r.staffNotes ?? ''}>
                        {r.staffNotes ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="mr-2 text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(r.id)}
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditLostOpportunityModal
          key={editing.id}
          row={editing}
          storeId={storeId}
          date={date}
          datalistId={datalistId}
          onClose={closeEdit}
          updateMut={updateMut}
        />
      )}

      {deleteId != null && (
        <ModalOverlay onClose={() => setDeleteId(null)}>
          <div className="mx-auto w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">Delete entry?</h2>
            <p className="mb-4 text-sm text-gray-600">This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={deleteMut.isPending}
                onClick={() =>
                  deleteMut.mutate(
                    { id: deleteId, storeId },
                    { onSuccess: () => setDeleteId(null) },
                  )
                }
              >
                Delete
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function EditLostOpportunityModal({
  row,
  storeId,
  date,
  datalistId,
  onClose,
  updateMut,
}: {
  row: LostOpportunityRow;
  storeId: string;
  date: string;
  datalistId: string;
  onClose: () => void;
  updateMut: ReturnType<typeof useUpdateLostOpportunity>;
}) {
  const pr = parseReasonForForm(row.reason);
  const [reasonPreset, setReasonPreset] = useState(() => pr.preset || OTHER);
  const [reasonCustom, setReasonCustom] = useState(() => pr.custom);
  const [vehicleRequested, setVehicleRequested] = useState(() => row.vehicleRequested ?? '');
  const [quantity, setQuantity] = useState(() => row.quantity);
  const [durationDays, setDurationDays] = useState(() =>
    row.durationDays != null ? String(row.durationDays) : '',
  );
  const [estValue, setEstValue] = useState(() =>
    row.estValue != null ? String(row.estValue) : '',
  );
  const [timeLocal, setTimeLocal] = useState(() => timeInputValue(row.time));
  const [outcome, setOutcome] = useState(() => row.outcome ?? '');
  const [staffNotes, setStaffNotes] = useState(() => row.staffNotes ?? '');

  const reasonEffective =
    reasonPreset === OTHER ? reasonCustom.trim() : reasonPreset === '' ? '' : reasonPreset;

  function saveEdit() {
    const re = reasonEffective;
    if (!re) return;
    const dur = durationDays === '' ? null : Math.max(1, parseInt(durationDays, 10) || 0);
    const est = estValue === '' ? null : Math.max(0, parseFloat(estValue) || 0);
    updateMut.mutate(
      {
        id: row.id,
        storeId,
        date,
        time: timeLocal || null,
        vehicleRequested: vehicleRequested.trim() || null,
        quantity,
        durationDays: dur && dur > 0 ? dur : null,
        estValue: est,
        reason: re,
        outcome: outcome.trim() || null,
        staffNotes: staffNotes.trim() || null,
      },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="mx-auto w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Edit entry</h2>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto">
          <div>
            <p className="mb-2 text-xs font-medium text-gray-600">Reason *</p>
            <div className="flex flex-wrap gap-2">
              {REASON_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setReasonPreset(p === reasonPreset ? '' : p);
                    if (p !== OTHER) setReasonCustom('');
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    reasonPreset === p
                      ? 'border-amber-600 bg-amber-600 text-white'
                      : 'border-gray-200 bg-gray-50 text-gray-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            {reasonPreset === OTHER && (
              <input
                type="text"
                value={reasonCustom}
                onChange={(e) => setReasonCustom(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            )}
          </div>
          <label className="block">
            <span className="text-xs text-gray-600">Vehicle</span>
            <input
              type="text"
              list={datalistId}
              value={vehicleRequested}
              onChange={(e) => setVehicleRequested(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className="text-xs text-gray-600">Qty</span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
            <label>
              <span className="text-xs text-gray-600">Days</span>
              <input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
            <label>
              <span className="text-xs text-gray-600">Est.</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={estValue}
                onChange={(e) => setEstValue(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-gray-600">Time</span>
            <input
              type="time"
              value={timeLocal}
              onChange={(e) => setTimeLocal(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div>
            <p className="mb-1 text-xs text-gray-600">Outcome</p>
            <div className="flex flex-wrap gap-1">
              {OUTCOME_PRESETS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(outcome === o ? '' : o)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    outcome === o ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-gray-600">Notes</span>
            <input
              type="text"
              value={staffNotes}
              onChange={(e) => setStaffNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={saveEdit}
            loading={updateMut.isPending}
            disabled={!reasonEffective || quantity < 1}
          >
            Save
          </Button>
        </div>
        {updateMut.error && (
          <p className="mt-2 text-sm text-red-600">{(updateMut.error as Error).message}</p>
        )}
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative z-10 max-h-[90vh] w-full overflow-y-auto px-4">{children}</div>
    </div>
  );
}
