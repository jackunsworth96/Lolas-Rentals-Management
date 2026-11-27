import { useState } from 'react';
import { useAccessHistory, useAccessPeople, useAccessRoles } from '../../../api/access.js';
import { HistoryList } from './PersonAccessModal.js';
import { errorMessage } from './access-utils.js';

export function AccessHistoryTab() {
  const { data: roles = [] } = useAccessRoles();
  const { data: people = [] } = useAccessPeople();
  const [roleId, setRoleId] = useState('');
  const [userId, setUserId] = useState('');
  const { data = [], isLoading, error } = useAccessHistory({ roleId: roleId || undefined, userId: userId || undefined });

  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name ?? id ?? '—';
  const personName = (id: string | null) => people.find((p) => p.id === id)?.fullName ?? 'a removed user';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Access history</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-gray-600">
          Every change to roles, logins and exceptions, who made it and why. This record cannot be edited or deleted.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={roleId} onChange={(e) => { setRoleId(e.target.value); setUserId(''); }} aria-label="Filter by role"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={userId} onChange={(e) => { setUserId(e.target.value); setRoleId(''); }} aria-label="Filter by person"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">Everyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
      </div>
      {isLoading && <p className="text-sm text-gray-500">Loading history…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(error, 'Could not load history')}</p>}
      {!isLoading && !error && data.length === 0 && <p className="text-sm text-gray-500">No changes recorded yet.</p>}
      {data.length > 0 && <HistoryList entries={data} roleName={roleName} personName={personName} />}
    </div>
  );
}
