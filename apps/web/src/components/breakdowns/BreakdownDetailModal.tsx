import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import {
  useBreakdown,
  useResolveBreakdown,
  useUpdateBreakdownTimes,
  ISSUE_TYPE_LABELS,
  RESOLUTION_TYPE_LABELS,
} from '../../api/breakdowns.js';
import type { BreakdownReport, BreakdownResolutionType } from '../../api/breakdowns.js';
import { manilaNowDateTimeLocal, manilaLocalToISO, isoToManilaDateAndTime } from '../../utils/date.js';
import { hasPermission } from '../../utils/permissions.js';

interface BreakdownDetailModalProps {
  open: boolean;
  onClose: () => void;
  reportId: string;
}

const RESOLUTION_TYPES: BreakdownResolutionType[] = ['roadside_fix', 'vehicle_swap', 'towed', 'customer_continued', 'other'];

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatMinutes(mins: number | null): string {
  if (mins == null) return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
      </div>
      <dl className="divide-y divide-gray-100 px-4">{children}</dl>
    </div>
  );
}

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400';

export function BreakdownDetailModal({ open, onClose, reportId }: BreakdownDetailModalProps) {
  const { data: report, isLoading } = useBreakdown(reportId);
  const resolveBreakdown = useResolveBreakdown();
  const updateTimes = useUpdateBreakdownTimes();
  const canEdit = hasPermission('can_edit_fleet');
  const r = report as BreakdownReport | undefined;

  const [resolving, setResolving] = useState(false);
  const [resolutionType, setResolutionType] = useState<BreakdownResolutionType | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolvedAt, setResolvedAt] = useState(() => manilaNowDateTimeLocal());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingTimes, setEditingTimes] = useState(false);
  const [breakdownDate, setBreakdownDate] = useState('');
  const [breakdownTime, setBreakdownTime] = useState('');
  const [resolvedDate, setResolvedDate] = useState('');
  const [resolvedTime, setResolvedTime] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [savingTimes, setSavingTimes] = useState(false);

  if (!open) return null;

  if (isLoading || !r) {
    return (
      <Modal open onClose={onClose} title="Breakdown Report" size="xl">
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </Modal>
    );
  }

  function startEditingTimes() {
    const breakdown = isoToManilaDateAndTime(r!.breakdownAt);
    setBreakdownDate(breakdown.date);
    setBreakdownTime(breakdown.time);
    if (r!.resolvedAt) {
      const resolved = isoToManilaDateAndTime(r!.resolvedAt);
      setResolvedDate(resolved.date);
      setResolvedTime(resolved.time);
    } else {
      setResolvedDate('');
      setResolvedTime('');
    }
    setTimeError(null);
    setEditingTimes(true);
  }

  async function handleSaveTimes() {
    if (!breakdownDate || !breakdownTime) {
      setTimeError('Enter the date and time of the breakdown.');
      return;
    }
    const breakdownAt = manilaLocalToISO(`${breakdownDate}T${breakdownTime}`);
    const body: { breakdownAt: string; resolvedAt?: string } = { breakdownAt };
    if (r!.status === 'resolved') {
      if (!resolvedDate || !resolvedTime) {
        setTimeError('Enter when it was resolved.');
        return;
      }
      const nextResolved = manilaLocalToISO(`${resolvedDate}T${resolvedTime}`);
      if (new Date(nextResolved).getTime() < new Date(breakdownAt).getTime()) {
        setTimeError('Resolved time cannot be earlier than the breakdown.');
        return;
      }
      body.resolvedAt = nextResolved;
    }
    setTimeError(null);
    setSavingTimes(true);
    try {
      await updateTimes.mutateAsync({ id: r!.id, body });
      setEditingTimes(false);
    } catch (err) {
      setTimeError((err as Error).message ?? 'Failed to update the times.');
    } finally {
      setSavingTimes(false);
    }
  }

  let correctedMinutes: number | null = null;
  if (editingTimes && r.status === 'resolved' && breakdownDate && breakdownTime && resolvedDate && resolvedTime) {
    const start = new Date(manilaLocalToISO(`${breakdownDate}T${breakdownTime}`)).getTime();
    const end = new Date(manilaLocalToISO(`${resolvedDate}T${resolvedTime}`)).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      correctedMinutes = Math.round((end - start) / 60000);
    }
  }

  async function handleResolve() {
    if (!resolutionType) {
      setError('Please select how it was resolved.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resolveBreakdown.mutateAsync({
        id: r!.id,
        body: {
          resolutionType,
          resolutionNotes: resolutionNotes || null,
          resolvedAt: manilaLocalToISO(resolvedAt),
        },
      });
      setResolving(false);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to mark as resolved.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Breakdown Report" size="xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>Logged {formatDt(r.createdAt)}</span>
          {r.reportedByName && <span>· {r.reportedByName}</span>}
        </div>
        {r.status === 'open' ? (
          <Badge color="amber">Open</Badge>
        ) : (
          <Badge color="green">Resolved</Badge>
        )}
      </div>

      <div className="max-h-[65vh] space-y-3 overflow-y-auto">
        {canEdit && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            {!editingTimes ? (
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-amber-950">
                  Time to fix is the gap between when it broke down and when it was resolved. Change either time if the day was entered wrong.
                </p>
                <button
                  type="button"
                  onClick={startEditingTimes}
                  className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                >
                  Correct times
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-amber-950">Correct times</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Date of breakdown</label>
                    <input type="date" value={breakdownDate} onChange={(e) => setBreakdownDate(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Time</label>
                    <input type="time" step="60" value={breakdownTime} onChange={(e) => setBreakdownTime(e.target.value)} className={inputClass} />
                  </div>
                </div>
                {r.status === 'resolved' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Resolved date</label>
                      <input type="date" value={resolvedDate} onChange={(e) => setResolvedDate(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Resolved time</label>
                      <input type="time" step="60" value={resolvedTime} onChange={(e) => setResolvedTime(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                )}
                {correctedMinutes != null && (
                  <p className="text-sm text-amber-950">Time to fix will be {formatMinutes(correctedMinutes)}.</p>
                )}
                {timeError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{timeError}</div>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingTimes(false); setTimeError(null); }}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTimes}
                    disabled={savingTimes}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    {savingTimes ? 'Saving...' : 'Save times'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <Section title="Report Details">
          <Field label="Report ID" value={<span className="font-mono text-xs">{r.id}</span>} />
          <Field label="Order Reference" value={<span className="font-mono text-xs">{r.orderReference ?? '—'}</span>} />
          <Field label="Customer" value={r.customerName ?? '—'} />
          <Field
            label="Vehicle"
            value={r.fleet ? `${r.fleet.name}${r.fleet.plateNumber ? ` — ${r.fleet.plateNumber}` : ''}` : '—'}
          />
        </Section>

        <Section title="Issue">
          <Field label="Date &amp; Time" value={formatDt(r.breakdownAt)} />
          {r.location && <Field label="Location" value={r.location} />}
          <Field
            label="Issue Type"
            value={<Badge color={r.issueType === 'user_error' ? 'gray' : 'amber'}>{ISSUE_TYPE_LABELS[r.issueType]}{r.issueDetail ? ` — ${r.issueDetail}` : ''}</Badge>}
          />
          <Field label="What happened" value={<p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{r.description}</p>} />
        </Section>

        <Section title="Resolution">
          {r.status === 'resolved' ? (
            <>
              <Field label="Resolved" value={<Badge color="green">{r.resolutionType ? RESOLUTION_TYPE_LABELS[r.resolutionType] : '—'}</Badge>} />
              <Field label="Resolved at" value={formatDt(r.resolvedAt)} />
              <Field label="Time to resolve" value={formatMinutes(r.resolutionMinutes)} />
              {r.resolutionNotes && <Field label="Notes" value={r.resolutionNotes} />}
              {r.resolvedByName && <Field label="Resolved by" value={r.resolvedByName} />}
            </>
          ) : (
            <div className="py-2">
              {!resolving ? (
                <button
                  type="button"
                  onClick={() => setResolving(true)}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Mark Resolved
                </button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">How was it resolved?</label>
                    <div className="flex flex-wrap gap-2">
                      {RESOLUTION_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setResolutionType(t)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                            resolutionType === t
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {RESOLUTION_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Resolved at</label>
                    <input
                      type="datetime-local"
                      value={resolvedAt}
                      onChange={(e) => setResolvedAt(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                    <textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      rows={2}
                      placeholder="Any further detail on how it was fixed..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                  </div>
                  {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setResolving(false); setError(null); }}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleResolve}
                      disabled={submitting}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      {submitting ? 'Saving...' : 'Confirm Resolved'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title="Evidence">
          <Field label="Photos" value={r.photoUrls.length > 0 ? `${r.photoUrls.length} photo${r.photoUrls.length === 1 ? '' : 's'}` : 'None'} />
          {r.additionalNotes && <Field label="Additional notes" value={r.additionalNotes} />}
        </Section>

        {r.photoUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {r.photoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="h-24 w-full rounded-lg border border-gray-200 object-cover hover:opacity-90"
                />
              </a>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
