import { useEffect, useMemo, useState } from 'react';
import { useMyWorkUpdates, useSaveWorkUpdate, type WorkUpdate } from '../../api/me.js';

const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

function addDays(d: string, n: number): string {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

export function weekLabel(weekStart: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };
  return `${fmt(weekStart)} – ${fmt(addDays(weekStart, 6))}`;
}

export function WorkUpdateBody({ u }: { u: WorkUpdate }) {
  const section = (label: string, text: string | null) => text && (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <p className="whitespace-pre-wrap text-sm text-gray-800">{text}</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {section('Worked on', u.workedOn)}
      {section('Results', u.results)}
      {section('Next week', u.nextWeek)}
      {section('Needs help with', u.blockers)}
      {u.managerComment && (
        <div className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
          <span className="font-medium">{u.reviewedByName ?? 'Manager'}:</span> {u.managerComment}
        </div>
      )}
    </div>
  );
}

export function WorkUpdatesTab({ thisWeekStart }: { thisWeekStart: string }) {
  const { data: updates = [], isLoading } = useMyWorkUpdates();
  const save = useSaveWorkUpdate();
  const lastWeekStart = addDays(thisWeekStart, -7);
  const [week, setWeek] = useState(thisWeekStart);
  const existing = useMemo(() => updates.find((u) => u.weekStart === week) ?? null, [updates, week]);
  const locked = !!existing?.reviewedAt;

  const [workedOn, setWorkedOn] = useState('');
  const [results, setResults] = useState('');
  const [nextWeek, setNextWeek] = useState('');
  const [blockers, setBlockers] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setWorkedOn(existing?.workedOn ?? '');
    setResults(existing?.results ?? '');
    setNextWeek(existing?.nextWeek ?? '');
    setBlockers(existing?.blockers ?? '');
  }, [existing]);

  useEffect(() => setDone(false), [week]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    save.mutate(
      { weekStart: week, workedOn, results: results || undefined, nextWeek: nextWeek || undefined, blockers: blockers || undefined },
      { onSuccess: () => setDone(true) },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
        <h2 className="text-base font-semibold text-gray-900">Weekly update</h2>
        <p className="text-sm text-gray-500">A short note on what you did and what came of it. Bullet points are fine.</p>
        <div>
          <label className="block text-xs font-medium text-gray-600">Week</label>
          <select value={week} onChange={(e) => setWeek(e.target.value)} className={inputCls}>
            <option value={thisWeekStart}>This week ({weekLabel(thisWeekStart)})</option>
            <option value={lastWeekStart}>Last week ({weekLabel(lastWeekStart)})</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">What did you work on?</label>
          <textarea value={workedOn} onChange={(e) => setWorkedOn(e.target.value)} rows={4} disabled={locked} className={inputCls}
            placeholder="Partners visited, calls, proposals, marketing..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Results</label>
          <textarea value={results} onChange={(e) => setResults(e.target.value)} rows={3} disabled={locked} className={inputCls}
            placeholder="New partners signed, bookings referred, deals agreed..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Plan for next week</label>
          <textarea value={nextWeek} onChange={(e) => setNextWeek(e.target.value)} rows={2} disabled={locked} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Anything you need help with? (optional)</label>
          <textarea value={blockers} onChange={(e) => setBlockers(e.target.value)} rows={2} disabled={locked} className={inputCls} />
        </div>
        {locked && <p className="text-sm text-gray-600">Your manager has replied, so this week is closed.</p>}
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        {done && <p className="text-sm text-green-700">Update saved.</p>}
        {!locked && (
          <button
            type="submit"
            disabled={workedOn.trim().length < 3 || save.isPending}
            className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {save.isPending ? 'Saving...' : existing ? 'Update' : 'Send update'}
          </button>
        )}
      </form>

      <div className="lg:col-span-3">
        <h2 className="mb-2 text-base font-semibold text-gray-900">My updates</h2>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {isLoading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
          {!isLoading && updates.length === 0 && <p className="p-4 text-sm text-gray-500">No updates yet.</p>}
          {updates.map((u) => (
            <div key={u.id} className="space-y-2 p-3">
              <div className="text-sm font-medium text-gray-900">Week of {weekLabel(u.weekStart)}</div>
              <WorkUpdateBody u={u} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
