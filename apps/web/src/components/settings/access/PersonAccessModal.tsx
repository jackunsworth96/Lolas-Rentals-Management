import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  PERMISSION_AREAS,
  PERMISSION_GROUPS,
  getPermissionDefinition,
  isOverrideActive,
  permissionsInArea,
  resolveEffectivePermissions,
  type PermissionKey,
} from '@lolas/shared';
import { Modal } from '../../common/Modal.js';
import { Button } from '../../common/Button.js';
import { Badge } from '../../common/Badge.js';
import { useAuthStore } from '../../../stores/auth-store.js';
import {
  useAccessHistory,
  usePersonAccess,
  useSaveOverrides,
  type AccessOverride,
  type AccessRole,
} from '../../../api/access.js';
import { AREAS_BY_GROUP, areaLevelLabel, describeHistory, errorMessage, isSensitive, permLabel, visiblePages } from './access-utils.js';

type Draft = Pick<AccessOverride, 'permission' | 'effect' | 'reason' | 'expiresAt'>;
type Tab = 'access' | 'exceptions' | 'history';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function PersonAccessModal({ userId, roles, personName, onClose, onSaved }: {
  userId: string;
  roles: AccessRole[];
  personName: (id: string | null) => string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { data: person, isLoading, error } = usePersonAccess(userId);
  const me = useAuthStore((s) => s.user);
  const isSelf = me?.userId === userId;
  const [tab, setTab] = useState<Tab>('access');
  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name ?? id ?? '—';

  return (
    <Modal open onClose={onClose} size="xl" fullScreenOnMobile title={person ? person.fullName : 'Access'}>
      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(error)}</p>}
      {person && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            @{person.username} · Role: <strong className="text-gray-900">{roleName(person.roleId)}</strong>
            {!person.isActive && <> · <Badge color="red">Inactive</Badge></>}
          </p>
          <div role="tablist" aria-label="Access sections" className="flex gap-1 overflow-x-auto border-b border-gray-200">
            {([['access', 'Access'], ['exceptions', `Exceptions (${person.overrides.length})`], ['history', 'History']] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? 'border-teal-brand text-teal-brand' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'access' && <EffectiveAccess person={person} />}
          {tab === 'exceptions' && (
            <ExceptionsEditor
              key={person.version}
              userId={userId}
              version={person.version}
              rolePermissions={person.rolePermissions}
              initial={person.overrides}
              isSelf={isSelf}
              grantable={new Set(me?.permissions ?? [])}
              onSaved={() => onSaved(`Saved exceptions for ${person.fullName}`)}
            />
          )}
          {tab === 'history' && <PersonHistory userId={userId} roleName={roleName} personName={personName} />}
        </div>
      )}
    </Modal>
  );
}

function EffectiveAccess({ person }: { person: { rolePermissions: PermissionKey[]; effectivePermissions: PermissionKey[]; overrides: AccessOverride[] } }) {
  const [detail, setDetail] = useState(false);
  const role = new Set<string>(person.rolePermissions);
  const effective = new Set<string>(person.effectivePermissions);
  const pages = visiblePages(person.effectivePermissions);
  const active = person.overrides.filter((o) => isOverrideActive(o));

  const source = (k: PermissionKey): { label: string; color: 'teal' | 'green' | 'red' | 'gray' } | null => {
    if (effective.has(k) && role.has(k)) return { label: 'From role', color: 'teal' };
    if (effective.has(k)) return { label: active.some((o) => o.permission === k) ? 'Exception' : 'Needed by an exception', color: 'green' };
    if (role.has(k)) return { label: 'Removed by exception', color: 'red' };
    return null;
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-gray-50 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">What can they see?</h3>
        <p className="mt-1 text-sm text-gray-800">{pages.length ? pages.join(' · ') : 'Only the dashboard'}</p>
      </section>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
        Show individual permissions
      </label>
      {PERMISSION_GROUPS.map((g) => (
        <section key={g.id}>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400">{g.label}</h3>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {(AREAS_BY_GROUP[g.id] ?? []).map((a) => {
              const level = areaLevelLabel(a, effective);
              const changed = permissionsInArea(a.id).some((k) => role.has(k) !== effective.has(k));
              return (
                <li key={a.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-800">{a.label}</span>
                    <span className="flex items-center gap-1.5">
                      {changed && <Badge color="purple">Has exceptions</Badge>}
                      <span className={`text-sm ${level === 'No access' ? 'text-gray-400' : 'font-medium text-gray-900'}`}>{level}</span>
                    </span>
                  </div>
                  {detail && (
                    <ul className="mt-1.5 space-y-1">
                      {permissionsInArea(a.id).map((k) => {
                        const s = source(k);
                        return (
                          <li key={k} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className={s && s.color !== 'red' ? 'text-gray-800' : 'text-gray-400 line-through decoration-gray-300'}>{permLabel(k)}</span>
                            {s && <Badge color={s.color}>{s.label}</Badge>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ExceptionsEditor({ userId, version, rolePermissions, initial, isSelf, grantable, onSaved }: {
  userId: string;
  version: number;
  rolePermissions: PermissionKey[];
  initial: AccessOverride[];
  isSelf: boolean;
  grantable: ReadonlySet<string>;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.map(({ permission, effect, reason, expiresAt }) => ({ permission, effect, reason, expiresAt })));
  const [adding, setAdding] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveOverrides();
  const role = new Set<string>(rolePermissions);
  const preview = useMemo(() => resolveEffectivePermissions(rolePermissions, drafts), [rolePermissions, drafts]);
  const dirty = JSON.stringify(drafts) !== JSON.stringify(initial.map(({ permission, effect, reason, expiresAt }) => ({ permission, effect, reason, expiresAt })));

  if (isSelf) {
    return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">You can't change your own access. Ask another manager to add or remove exceptions for you.</p>;
  }

  const taken = new Set(drafts.map((d) => d.permission));
  const choices = PERMISSION_AREAS.flatMap((a) => permissionsInArea(a.id).map((k) => ({ k, area: a.label })))
    .filter(({ k }) => !taken.has(k));

  const startAdd = () => {
    const first = choices.find(({ k }) => !role.has(k) && grantable.has(k)) ?? choices[0];
    if (first) setAdding({ permission: first.k, effect: role.has(first.k) ? 'revoke' : 'grant', reason: '', expiresAt: null });
  };

  const addValid = adding && adding.reason.trim().length >= 3
    && (adding.effect === 'revoke' || grantable.has(adding.permission))
    && (!adding.expiresAt || new Date(adding.expiresAt).getTime() > Date.now());

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({ userId, overrides: drafts, expectedVersion: version });
      onSaved();
    } catch (e) {
      setError(errorMessage(e, 'Could not save exceptions'));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Exceptions give one person a permission their role doesn't have, or take one away, without changing the role.
        Each needs a reason and can expire automatically.
      </p>
      {drafts.length === 0 && !adding && <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500">No exceptions. This person has exactly their role's access.</p>}
      <ul className="space-y-2">
        {drafts.map((d) => {
          const expired = !isOverrideActive(d);
          return (
            <li key={d.permission} className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${expired ? 'border-gray-200 bg-gray-50' : 'border-gray-200'}`}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">
                  <Badge color={d.effect === 'grant' ? 'green' : 'red'}>{d.effect === 'grant' ? 'Give' : 'Take away'}</Badge>
                  {permLabel(d.permission)}
                  {isSensitive(d.permission) && <Badge color="amber">Sensitive</Badge>}
                  {expired && <Badge color="gray">Expired</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-gray-600">{d.reason}</p>
                <p className="text-xs text-gray-500">{d.expiresAt ? `${expired ? 'Expired' : 'Expires'} ${formatDate(d.expiresAt)}` : 'No expiry'}</p>
              </div>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" aria-label={`Remove exception for ${permLabel(d.permission)}`}
                onClick={() => setDrafts(drafts.filter((x) => x.permission !== d.permission))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/30 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Permission</span>
              <select
                value={adding.permission}
                onChange={(e) => {
                  const k = e.target.value as PermissionKey;
                  setAdding({ ...adding, permission: k, effect: role.has(k) ? 'revoke' : 'grant' });
                }}
                className={`mt-1 ${inputClass}`}
              >
                {PERMISSION_AREAS.map((a) => {
                  const opts = choices.filter((c) => c.area === a.label);
                  if (opts.length === 0) return null;
                  return (
                    <optgroup key={a.id} label={a.label}>
                      {opts.map(({ k }) => (
                        <option key={k} value={k} disabled={!role.has(k) && !grantable.has(k)}>
                          {permLabel(k)}{role.has(k) ? ' (has via role)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
            <fieldset>
              <legend className="text-sm font-medium text-gray-800">Change</legend>
              <p className="mt-2 text-sm text-gray-700">
                {adding.effect === 'grant' ? 'Give this permission (their role does not have it)' : 'Take this permission away (their role has it)'}
              </p>
            </fieldset>
          </div>
          {getPermissionDefinition(adding.permission) && (
            <p className="text-xs text-gray-600">{getPermissionDefinition(adding.permission)!.description}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Reason</span>
              <input value={adding.reason} onChange={(e) => setAdding({ ...adding, reason: e.target.value })} maxLength={300}
                placeholder="e.g. Covering the store manager's leave" className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Expires <span className="font-normal text-gray-500">(optional)</span></span>
              <input type="datetime-local" className={`mt-1 ${inputClass}`}
                value={adding.expiresAt ? toLocalInput(adding.expiresAt) : ''}
                onChange={(e) => setAdding({ ...adding, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAdding(null)}>Cancel</Button>
            <Button size="sm" disabled={!addValid} onClick={() => { setDrafts([...drafts, { ...adding, reason: adding.reason.trim() }]); setAdding(null); }}>Add exception</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={startAdd} disabled={choices.length === 0}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Add exception
        </Button>
      )}

      {dirty && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">After saving they can open</p>
          <p className="text-sm text-gray-800">{visiblePages(preview).join(' · ') || 'Only the dashboard'}</p>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={() => void submit()} loading={save.isPending}>Save exceptions</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PersonHistory({ userId, roleName, personName }: { userId: string; roleName: (id: string | null) => string; personName: (id: string | null) => string }) {
  const { data = [], isLoading, error } = useAccessHistory({ userId });
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (error) return <p role="alert" className="text-sm text-red-700">{errorMessage(error)}</p>;
  if (data.length === 0) return <p className="text-sm text-gray-500">No access changes recorded for this person yet.</p>;
  return <HistoryList entries={data} roleName={roleName} personName={personName} />;
}

export function HistoryList({ entries, roleName, personName }: {
  entries: Parameters<typeof describeHistory>[0][];
  roleName: (id: string | null) => string;
  personName: (id: string | null) => string;
}) {
  return (
    <ol className="relative space-y-4 border-l border-gray-200 pl-4">
      {entries.map((e) => {
        const { title, changes } = describeHistory(e, roleName, personName);
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-teal-brand ring-4 ring-white" aria-hidden />
            <p className="text-sm font-medium text-gray-900">{title}</p>
            <p className="text-xs text-gray-500">{formatDate(e.occurredAt)} · by {e.actorName ?? 'System'}</p>
            {e.reason && <p className="mt-0.5 text-xs italic text-gray-600">“{e.reason}”</p>}
            {changes.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
                {changes.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
