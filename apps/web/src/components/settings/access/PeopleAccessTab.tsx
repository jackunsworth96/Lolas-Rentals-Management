import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Badge } from '../../common/Badge.js';
import { useToast } from '../../../hooks/useToast.js';
import { useAccessPeople, useAccessRoles } from '../../../api/access.js';
import { PersonAccessModal } from './PersonAccessModal.js';
import { errorMessage } from './access-utils.js';

export function PeopleAccessTab() {
  const { data: people = [], isLoading, error } = useAccessPeople();
  const { data: roles = [] } = useAccessRoles();
  const { toasts, pushToast } = useToast();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
  const personName = (id: string | null) => people.find((p) => p.id === id)?.fullName ?? 'a removed user';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) =>
      (showInactive || p.isActive)
      && (!roleFilter || p.roleId === roleFilter)
      && (!q || `${p.fullName} ${p.username}`.toLowerCase().includes(q)));
  }, [people, query, roleFilter, showInactive]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">People's access</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-gray-600">
          See exactly what each person can open and do, and add exceptions for one person without changing their whole role.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or username" aria-label="Search people"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
          Show inactive
        </label>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading people…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(error, 'Could not load people')}</p>}
      {!isLoading && filtered.length === 0 && !error && <p className="text-sm text-gray-500">No one matches.</p>}

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {filtered.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpenId(p.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">
                  {p.fullName}
                  {!p.isActive && <Badge color="red">Inactive</Badge>}
                  {p.activeOverrideCount > 0 && <Badge color="purple">{p.activeOverrideCount} exception{p.activeOverrideCount === 1 ? '' : 's'}</Badge>}
                </span>
                <span className="block text-xs text-gray-500">@{p.username} · {roleName(p.roleId)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {openId && (
        <PersonAccessModal
          userId={openId}
          roles={roles}
          personName={personName}
          onClose={() => setOpenId(null)}
          onSaved={(msg) => pushToast(msg, 'success')}
        />
      )}

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`animate-toast-slide-up rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${t.type === 'success' ? 'bg-teal-brand text-white' : 'bg-red-600 text-white'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
