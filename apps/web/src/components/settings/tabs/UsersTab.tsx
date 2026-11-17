import { useState } from 'react';
import {
  useUsers,
  useSaveUser,
  useDeleteUser,
  useRoles,
  useConfigEmployees,
  useCreateAccessAccount,
  type AccessAccountInput,
  type PersonType,
} from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

const TYPE_BADGE: Record<PersonType, { label: string; cls: string }> = {
  staff: { label: 'Staff', cls: 'bg-gray-100 text-gray-700' },
  owner: { label: 'Owner', cls: 'bg-teal-100 text-teal-800' },
  developer: { label: 'Developer', cls: 'bg-purple-100 text-purple-800' },
};

const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

function AccessAccountForm({ roleOpts, onDone }: { roleOpts: { value: string; label: string }[]; onDone: () => void }) {
  const create = useCreateAccessAccount();
  const [form, setForm] = useState<AccessAccountInput>({ fullName: '', personType: 'developer', username: '', pin: '', roleId: '' });
  const set = <K extends keyof AccessAccountInput>(k: K, v: AccessAccountInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function choosePersonType(personType: AccessAccountInput['personType']) {
    const suggested = personType === 'owner' ? 'role-admin' : 'role-developer';
    setForm((f) => ({ ...f, personType, roleId: roleOpts.some((r) => r.value === suggested) ? suggested : f.roleId }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(form, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900">New access account</h4>
        <p className="text-xs text-gray-500">
          For owners and developers who need to sign in but are not staff. They won&apos;t appear in payroll, the rota,
          timesheets or the employee list.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-gray-600">
          Full name
          <input required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Type
          <select value={form.personType} onChange={(e) => choosePersonType(e.target.value as AccessAccountInput['personType'])} className={inputCls}>
            <option value="developer">Developer</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Username
          <input required autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs font-medium text-gray-600">
          PIN (at least 4 digits)
          <input required type="password" autoComplete="new-password" minLength={4} value={form.pin} onChange={(e) => set('pin', e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs font-medium text-gray-600 sm:col-span-2">
          Role (what they can see and do)
          <select required value={form.roleId} onChange={(e) => set('roleId', e.target.value)} className={inputCls}>
            <option value="">Choose a role</option>
            {roleOpts.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      </div>
      {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white">Cancel</button>
        <button type="submit" disabled={create.isPending} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {create.isPending ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </form>
  );
}

export function UsersTab() {
  const { data, isLoading } = useUsers();
  const { data: roles } = useRoles();
  const { data: employees } = useConfigEmployees();
  const save = useSaveUser();
  const del = useDeleteUser();
  const [showAccessForm, setShowAccessForm] = useState(false);

  const roleOpts = ((roles ?? []) as Array<{ id: string; name: string }>).map((r) => ({ value: r.id, label: r.name }));
  const employeeOpts = (employees ?? []).map((e) => ({ value: e.id, label: e.fullName }));

  const employeeLookup = new Map((employees ?? []).map((e) => [e.id, e]));
  const roleLookup = new Map(((roles ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]));

  const columns = [
    { key: 'username', header: 'Username' },
    { key: 'roleId', header: 'Role', render: (r: Record<string, unknown>) => roleLookup.get(r.roleId as string) ?? String(r.roleId ?? '—') },
    { key: 'employeeId', header: 'Person', render: (r: Record<string, unknown>) => employeeLookup.get(r.employeeId as string)?.fullName ?? String(r.employeeId ?? '—') },
    {
      key: 'personType',
      header: 'Type',
      render: (r: Record<string, unknown>) => {
        const badge = TYPE_BADGE[employeeLookup.get(r.employeeId as string)?.personType ?? 'staff'];
        return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>;
      },
    },
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
    <div>
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
      {showAccessForm ? (
        <AccessAccountForm roleOpts={roleOpts} onDone={() => setShowAccessForm(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowAccessForm(true)}
          className="mt-4 rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          New access account (owner or developer)
        </button>
      )}
    </div>
  );
}
