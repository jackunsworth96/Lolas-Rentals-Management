import { useState } from 'react';
import { Copy, Pencil, Plus, Table2, Trash2, Users } from 'lucide-react';
import { ALL_PERMISSIONS, PERMISSION_AREAS, type PermissionKey } from '@lolas/shared';
import { Button } from '../../common/Button.js';
import { Badge } from '../../common/Badge.js';
import { Modal } from '../../common/Modal.js';
import { ConfirmDialog } from '../../common/ConfirmDialog.js';
import { useToast } from '../../../hooks/useToast.js';
import { useAccessRoles, useDeleteRole, type AccessRole } from '../../../api/access.js';
import { RoleEditorModal } from './RoleEditorModal.js';
import { areaLevelLabel, errorMessage, isSensitive } from './access-utils.js';

type EditorState =
  | { mode: 'edit'; role: AccessRole }
  | { mode: 'create'; template?: { name: string; description: string; permissions: PermissionKey[] } }
  | null;

function accessSummary(role: AccessRole): string {
  const areas = PERMISSION_AREAS.filter((a) => areaLevelLabel(a, new Set(role.permissions)) !== 'No access').length;
  return `${areas} of ${PERMISSION_AREAS.length} areas · ${role.permissions.length} of ${ALL_PERMISSIONS.length} permissions`;
}

export function RolesTab() {
  const { data: roles = [], isLoading, error } = useAccessRoles();
  const del = useDeleteRole();
  const { toasts, pushToast } = useToast();
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<AccessRole | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);

  const duplicate = (r: AccessRole) =>
    setEditor({ mode: 'create', template: { name: `${r.name} (copy)`, description: r.description ?? '', permissions: r.permissions } });

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await del.mutateAsync({ id: deleting.id, reason: '' });
      pushToast(`Deleted the ${deleting.name} role`, 'success');
      setDeleting(null);
    } catch (e) {
      setDeleteError(errorMessage(e, 'Could not delete the role'));
    }
  };

  const deleteBlocker = (r: AccessRole) =>
    r.isSystem ? 'Built-in roles cannot be deleted' : r.userCount > 0 ? 'Move everyone out of this role first' : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Roles</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-gray-600">
            A role is a set of permissions you give to a group of people. Pick a level for each area of the backoffice,
            or turn on Advanced to choose individual permissions. Changes apply within a minute, without anyone logging out.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => setComparing(true)} disabled={roles.length < 2}>
            <Table2 className="mr-1.5 h-4 w-4" aria-hidden /> Compare
          </Button>
          <Button onClick={() => setEditor({ mode: 'create' })}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden /> New role
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading roles…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(error, 'Could not load roles')}</p>}

      {/* Desktop table */}
      {roles.length > 0 && (
        <div className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">People</th>
                <th className="px-4 py-2.5">Access</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {roles.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setEditor({ mode: 'edit', role: r })} className="text-left">
                      <span className="flex items-center gap-2 font-medium text-gray-900 hover:text-teal-brand">
                        {r.name}
                        {r.isSystem && <Badge color="gray">Built in</Badge>}
                        {r.permissions.some(isSensitive) && <Badge color="amber">Sensitive access</Badge>}
                      </span>
                      {r.description && <span className="mt-0.5 block text-xs text-gray-500">{r.description}</span>}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.userCount}</td>
                  <td className="px-4 py-3 text-gray-600">{accessSummary(r)}</td>
                  <td className="px-4 py-3">
                    <RoleActions role={r} onEdit={() => setEditor({ mode: 'edit', role: r })} onDuplicate={() => duplicate(r)}
                      onDelete={() => { setDeleteError(null); setDeleting(r); }} deleteBlocker={deleteBlocker(r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {roles.map((r) => (
          <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <button type="button" onClick={() => setEditor({ mode: 'edit', role: r })} className="w-full text-left">
              <span className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                {r.name}
                {r.isSystem && <Badge color="gray">Built in</Badge>}
              </span>
              {r.description && <span className="mt-0.5 block text-xs text-gray-500">{r.description}</span>}
              <span className="mt-2 flex items-center gap-1.5 text-xs text-gray-600">
                <Users className="h-3.5 w-3.5" aria-hidden /> {r.userCount} {r.userCount === 1 ? 'person' : 'people'} · {accessSummary(r)}
              </span>
            </button>
            <div className="mt-3 border-t border-gray-100 pt-3">
              <RoleActions role={r} onEdit={() => setEditor({ mode: 'edit', role: r })} onDuplicate={() => duplicate(r)}
                onDelete={() => { setDeleteError(null); setDeleting(r); }} deleteBlocker={deleteBlocker(r)} />
            </div>
          </li>
        ))}
      </ul>

      {editor && (
        <RoleEditorModal
          key={editor.mode === 'edit' ? `${editor.role.id}-${editor.role.version}` : 'new'}
          open
          onClose={() => setEditor(null)}
          role={editor.mode === 'edit' ? editor.role : null}
          template={editor.mode === 'create' ? editor.template : undefined}
          onSaved={(msg) => pushToast(msg, 'success')}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete role?"
        message={<>The <strong>{deleting?.name}</strong> role will be removed. This is recorded in the access history.</>}
        confirmLabel="Delete role"
        destructive
        busy={del.isPending}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />

      {comparing && <CompareRolesModal roles={roles} onClose={() => setComparing(false)} />}

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

function RoleActions({ role, onEdit, onDuplicate, onDelete, deleteBlocker }: {
  role: AccessRole; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; deleteBlocker: string | null;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${role.name}`}>
        <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden /> Edit
      </Button>
      <Button size="sm" variant="ghost" onClick={onDuplicate} aria-label={`Duplicate ${role.name}`}>
        <Copy className="mr-1 h-3.5 w-3.5" aria-hidden /> Duplicate
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        disabled={!!deleteBlocker}
        title={deleteBlocker ?? undefined}
        aria-label={`Delete ${role.name}`}
        className="text-red-600 hover:bg-red-50"
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Delete
      </Button>
    </div>
  );
}

function CompareRolesModal({ roles, onClose }: { roles: AccessRole[]; onClose: () => void }) {
  const sets = roles.map((r) => new Set<string>(r.permissions));
  return (
    <Modal open onClose={onClose} title="Compare roles" size="2xl" fullScreenOnMobile>
      <p className="mb-3 text-sm text-gray-600">Each cell shows the level a role has in that area. Rows where roles differ are highlighted.</p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2">Area</th>
              {roles.map((r) => <th key={r.id} className="whitespace-nowrap px-3 py-2">{r.name}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {PERMISSION_AREAS.map((a) => {
              const labels = sets.map((s) => areaLevelLabel(a, s));
              const differs = new Set(labels).size > 1;
              return (
                <tr key={a.id} className={differs ? 'bg-amber-50/50' : ''}>
                  <th scope="row" className={`sticky left-0 z-10 whitespace-nowrap px-3 py-2 text-left font-medium text-gray-800 ${differs ? 'bg-amber-50' : 'bg-white'}`}>{a.label}</th>
                  {labels.map((l, i) => (
                    <td key={roles[i]!.id} className={`whitespace-nowrap px-3 py-2 ${l === 'No access' ? 'text-gray-400' : 'text-gray-800'}`}>{l}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
