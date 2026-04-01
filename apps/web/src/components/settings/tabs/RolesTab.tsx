import { useState } from 'react';
import { ALL_PERMISSIONS } from '@lolas/shared';
import { useRoles, useSaveRole, useDeleteRole, useRolePermissions, useSaveRolePermissions } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';
import { Modal } from '../../common/Modal.js';

const columns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
];

const fields: FieldDef[] = [
  { key: 'id', label: 'Role ID', type: 'text', required: true, readOnlyOnEdit: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
];

export function RolesTab() {
  const { data, isLoading } = useRoles();
  const save = useSaveRole();
  const del = useDeleteRole();
  const [editPermsRoleId, setEditPermsRoleId] = useState<string | null>(null);

  const extendedColumns = [
    ...columns,
    {
      key: '_perms',
      header: 'Permissions',
      render: (r: Record<string, unknown>) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setEditPermsRoleId(r.id as string); }} className="text-sm text-blue-600 hover:underline">
          Edit
        </button>
      ),
    },
  ];

  return (
    <div>
      <ConfigSection
        title="Roles"
        data={(data ?? []) as Record<string, unknown>[]}
        isLoading={isLoading}
        columns={extendedColumns}
        fields={fields}
        onSave={(row) => save.mutate(row)}
        onDelete={(id) => del.mutate(id)}
        isSaving={save.isPending}
        saveError={save.error as Error | null}
      />
      {editPermsRoleId && (
        <PermissionsPanel roleId={editPermsRoleId} onClose={() => setEditPermsRoleId(null)} />
      )}
    </div>
  );
}

function PermissionsPanel({ roleId, onClose }: { roleId: string; onClose: () => void }) {
  const { data: current, isLoading } = useRolePermissions(roleId);
  const saveMutation = useSaveRolePermissions();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  if (!initialized && current && !isLoading) {
    setSelected(new Set(current as string[]));
    setInitialized(true);
  }

  function toggle(perm: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm); else next.add(perm);
      return next;
    });
  }

  function handleSave() {
    saveMutation.mutate({ roleId, permissions: [...selected] }, { onSuccess: onClose });
  }

  return (
    <Modal open onClose={onClose} title={`Permissions — ${roleId}`} size="lg">
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {ALL_PERMISSIONS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.has(p)} onChange={() => toggle(p)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                {p}
              </label>
            ))}
          </div>
          {saveMutation.error && <p className="text-sm text-red-600">{(saveMutation.error as Error).message}</p>}
          <div className="flex justify-end gap-2 border-t pt-4">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saveMutation.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              {saveMutation.isPending ? 'Saving...' : 'Save permissions'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
