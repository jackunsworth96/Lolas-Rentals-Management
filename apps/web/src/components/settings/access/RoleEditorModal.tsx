import { useMemo, useState } from 'react';
import { Search, ShieldAlert } from 'lucide-react';
import type { PermissionKey } from '@lolas/shared';
import { Modal } from '../../common/Modal.js';
import { Button } from '../../common/Button.js';
import { useAuthStore } from '../../../stores/auth-store.js';
import { useCreateRole, useUpdateRole, type AccessRole } from '../../../api/access.js';
import { PermissionPicker } from './PermissionPicker.js';
import { diffPermissions, errorMessage, isSensitive, permLabel, sortedKeys, visiblePages } from './access-utils.js';

interface RoleEditorModalProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing role, or null to create one. */
  role: AccessRole | null;
  /** Starting permissions when creating (e.g. duplicating another role). */
  template?: { name: string; description: string; permissions: PermissionKey[] };
  onSaved: (message: string) => void;
}

const EMPTY: string[] = [];

export function RoleEditorModal({ open, onClose, role, template, onSaved }: RoleEditorModalProps) {
  const myPerms = useAuthStore((s) => s.user?.permissions ?? EMPTY);
  const myRoleId = useAuthStore((s) => s.user?.roleId);
  const grantable = useMemo(() => new Set(myPerms), [myPerms]);

  const initial = useMemo(() => new Set<PermissionKey>(role?.permissions ?? template?.permissions ?? []), [role, template]);
  const [name, setName] = useState(role?.name ?? template?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? template?.description ?? '');
  const [selected, setSelected] = useState<Set<PermissionKey>>(() => new Set(initial));
  const [advanced, setAdvanced] = useState(false);
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateRole();
  const update = useUpdateRole();
  const saving = create.isPending || update.isPending;

  const { added, removed } = diffPermissions(role ? initial : new Set(), selected);
  const detailsChanged = !!role && (name.trim() !== role.name || (description.trim() || null) !== (role.description || null));
  const dirty = !role || added.length > 0 || removed.length > 0 || detailsChanged;
  const sensitiveChanged = [...added, ...removed].some(isSensitive);
  const editingOwnRole = !!role && role.id === myRoleId;
  const nameValid = name.trim().length >= 2;

  const save = async () => {
    setError(null);
    const body = { name: name.trim(), description: description.trim(), permissions: sortedKeys(selected), reason: reason.trim() };
    try {
      if (role) {
        await update.mutateAsync({ id: role.id, expectedVersion: role.version, ...body });
        onSaved(`Saved ${body.name}. Everyone in this role sees the change within a minute.`);
      } else {
        await create.mutateAsync(body);
        onSaved(`Created the ${body.name} role.`);
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Could not save the role'));
    }
  };

  const footer = reviewing ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={() => setReviewing(false)} disabled={saving}>Back to editing</Button>
      <Button onClick={() => void save()} loading={saving} disabled={sensitiveChanged && reason.trim().length < 3}>
        {role ? 'Save changes' : 'Create role'}
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-600" aria-live="polite">
        {role
          ? (added.length || removed.length
            ? <><span className="font-medium text-green-700">+{added.length} added</span> · <span className="font-medium text-red-700">−{removed.length} removed</span></>
            : detailsChanged ? 'Name or description changed' : 'No changes yet')
          : `${selected.size} permissions selected`}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { setError(null); setReviewing(true); }} disabled={!dirty || !nameValid}>Review changes</Button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      fullScreenOnMobile
      title={role ? `Edit role: ${role.name}` : 'New role'}
      footer={footer}
    >
      {reviewing ? (
        <div className="space-y-4">
          {editingOwnRole && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This is your own role. These changes apply to you too.</p>
          )}
          {role && role.userCount > 0 && (
            <p className="text-sm text-gray-700">This affects <strong>{role.userCount}</strong> {role.userCount === 1 ? 'person' : 'people'} in this role.</p>
          )}
          <ChangeList title="Turning on" tone="green" keys={added} />
          <ChangeList title="Turning off" tone="red" keys={removed} />
          {added.length === 0 && removed.length === 0 && <p className="text-sm text-gray-600">Only the name or description changes.</p>}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">After saving they can open</p>
            <p className="mt-1 text-sm text-gray-700">{visiblePages(sortedKeys(selected)).join(', ') || 'Only the dashboard'}</p>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-800">
              Reason {sensitiveChanged ? <span className="text-red-600">(required for sensitive changes)</span> : <span className="font-normal text-gray-500">(optional)</span>}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. Store managers now approve timesheets"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Role name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Description</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                placeholder="Who is this role for?"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </label>
          </div>
          <div className="sticky -top-4 z-10 -mx-4 flex flex-col gap-2 border-b border-gray-100 bg-white px-4 py-2 sm:-mx-6 sm:flex-row sm:items-center sm:px-6">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search permissions, e.g. payroll or book value"
                aria-label="Search permissions"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={advanced}
                onChange={(e) => setAdvanced(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              Advanced: choose individual permissions
            </label>
          </div>
          <PermissionPicker
            selected={selected}
            onChange={setSelected}
            grantable={grantable}
            advanced={advanced}
            search={search.trim()}
          />
        </div>
      )}
    </Modal>
  );
}

function ChangeList({ title, tone, keys }: { title: string; tone: 'green' | 'red'; keys: PermissionKey[] }) {
  if (keys.length === 0) return null;
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone === 'green' ? 'text-green-700' : 'text-red-700'}`}>{title}</p>
      <ul className="mt-1 space-y-1">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm text-gray-800">
            <span aria-hidden>{tone === 'green' ? '+' : '−'}</span>
            {permLabel(k)}
            {isSensitive(k) && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                <ShieldAlert className="h-3 w-3" aria-hidden /> Sensitive
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
