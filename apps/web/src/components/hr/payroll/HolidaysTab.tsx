import { useState } from 'react';
import { useStores } from '../../../api/config.js';
import { usePublicHolidays, useSaveHoliday, useDeleteHoliday, type PublicHoliday } from '../../../api/payroll.js';

const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

const PRESETS = [
  { pct: 100, label: 'Regular holiday (+100%)' },
  { pct: 30, label: 'Special non-working day (+30%)' },
];

interface Draft {
  id?: string;
  holidayDate: string;
  name: string;
  premiumPct: number;
  storeId: string;
}

const empty = (year: number): Draft => ({ holidayDate: `${year}-01-01`, name: '', premiumPct: 100, storeId: '' });

export function HolidaysTab({ canEdit }: { canEdit: boolean }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: holidays = [], isLoading } = usePublicHolidays(year);
  const { data: stores = [] } = useStores();
  const save = useSaveHoliday();
  const remove = useDeleteHoliday();
  const [draft, setDraft] = useState<Draft | null>(null);

  const storeName = (id: string | null) => (id ? stores.find((s) => s.id === id)?.name ?? id : 'All stores');

  function submit() {
    if (!draft || !draft.name.trim()) return;
    save.mutate(
      {
        id: draft.id,
        holidayDate: draft.holidayDate,
        name: draft.name.trim(),
        premiumPct: draft.premiumPct,
        storeId: draft.storeId || null,
      },
      { onSuccess: () => setDraft(null) },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">
            Anyone who works on these dates is paid the premium on top of their day rate. Leave days are not affected.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {canEdit && (
            <button type="button" onClick={() => setDraft(empty(year))} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
              Add holiday
            </button>
          )}
        </div>
      </div>

      {draft && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="text-sm text-gray-600">Date</span>
              <input type="date" value={draft.holidayDate} onChange={(e) => setDraft({ ...draft, holidayDate: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Name</span>
              <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Independence Day" className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Premium</span>
              <select value={draft.premiumPct} onChange={(e) => setDraft({ ...draft, premiumPct: Number(e.target.value) })} className={inputCls}>
                {PRESETS.map((p) => <option key={p.pct} value={p.pct}>{p.label}</option>)}
                {!PRESETS.some((p) => p.pct === draft.premiumPct) && <option value={draft.premiumPct}>+{draft.premiumPct}%</option>}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Applies to</span>
              <select value={draft.storeId} onChange={(e) => setDraft({ ...draft, storeId: e.target.value })} className={inputCls}>
                <option value="">All stores</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          {save.error && <p className="mt-2 text-sm text-red-600">{(save.error as Error).message}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setDraft(null); save.reset(); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={submit} disabled={!draft.name.trim() || save.isPending} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              {save.isPending ? 'Saving...' : draft.id ? 'Save changes' : 'Add holiday'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Holiday</th>
              <th className="px-3 py-2 text-left">Premium</th>
              <th className="px-3 py-2 text-left">Applies to</th>
              {canEdit && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
            {!isLoading && holidays.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No holidays set for {year}.</td></tr>
            )}
            {holidays.map((h: PublicHoliday) => (
              <tr key={h.id}>
                <td className="px-3 py-2 tabular-nums text-gray-900">
                  {new Date(`${h.holidayDate}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: '2-digit', month: 'short' })}
                </td>
                <td className="px-3 py-2 text-gray-900">{h.name}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${h.premiumPct >= 100 ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    +{h.premiumPct}%
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600">{storeName(h.storeId)}</td>
                {canEdit && (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setDraft({ id: h.id, holidayDate: h.holidayDate, name: h.name, premiumPct: h.premiumPct, storeId: h.storeId ?? '' })}
                      className="mr-3 text-xs text-teal-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (window.confirm(`Delete ${h.name}?`)) remove.mutate(h.id); }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
