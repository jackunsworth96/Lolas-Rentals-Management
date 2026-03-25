import { useUsers, useSaveUser, useDeleteUser, useRoles, useConfigEmployees } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

export function UsersTab() {
  const { data, isLoading } = useUsers();
  const { data: roles } = useRoles();
  const { data: employees } = useConfigEmployees();
  const save = useSaveUser();
  const del = useDeleteUser();

  const roleOpts = ((roles ?? []) as Array<{ id: string; name: string }>).map((r) => ({ value: r.id, label: r.name }));
  const employeeOpts = (employees ?? []).map((e) => ({ value: e.id, label: e.fullName }));

  const employeeLookup = new Map((employees ?? []).map((e) => [e.id, e.fullName]));
  const roleLookup = new Map(((roles ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]));

  const columns = [
    { key: 'username', header: 'Username' },
    { key: 'roleId', header: 'Role', render: (r: Record<string, unknown>) => roleLookup.get(r.roleId as string) ?? String(r.roleId ?? '—') },
    { key: 'employeeId', header: 'Employee', render: (r: Record<string, unknown>) => employeeLookup.get(r.employeeId as string) ?? String(r.employeeId ?? '—') },
    { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
  ];

  const fields: FieldDef[] = [
    { key: 'username', label: 'Username', type: 'text', required: true, autoComplete: 'username' },
    { key: 'pin', label: 'PIN', type: 'password', required: true, placeholder: 'Leave blank to keep existing PIN' },
    { key: 'employeeId', label: 'Employee', type: 'select', options: employeeOpts, required: true },
    { key: 'roleId', label: 'Role', type: 'select', options: roleOpts, required: true },
    { key: 'isActive', label: 'Active', type: 'boolean' },
  ];

  return (
    <ConfigSection
      title="Users"
      data={(data ?? []) as Record<string, unknown>[]}
      isLoading={isLoading}
      columns={columns}
      fields={fields}
      onSave={(row) => save.mutate(row)}
      onDelete={(id) => del.mutate(id)}
      isSaving={save.isPending}
      saveError={save.error as Error | null}
    />
  );
}
