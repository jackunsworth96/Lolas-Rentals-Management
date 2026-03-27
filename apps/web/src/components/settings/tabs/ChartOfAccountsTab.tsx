import { useState, useMemo, useEffect, useRef } from 'react';
import { useChartOfAccounts, useSaveAccount, useDeleteAccount, useStores } from '../../../api/config.js';
import { COMPANY_STORE_ID } from '@lolas/shared';
import { Modal } from '../../common/Modal.js';
import { Badge } from '../../common/Badge.js';
import type { FieldDef } from '../ConfigSection.js';

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Income', 'Expense', 'Equity'] as const;
const TYPE_FILTERS = ['All', ...ACCOUNT_TYPES] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

type CoaRow = Record<string, unknown>;

function normType(r: CoaRow): string {
  return String(r.accountType ?? r.account_type ?? '');
}
function normActive(r: CoaRow): boolean {
  if (r.isActive === false || r.is_active === false) return false;
  return true;
}
function normStoreId(r: CoaRow): string {
  return String(r.storeId ?? r.store_id ?? '');
}
function normId(r: CoaRow): string {
  return String(r.id ?? '');
}
function normName(r: CoaRow): string {
  return String(r.name ?? '');
}

/** Normalize API row (camel or snake) for the edit form and PUT payload. */
function rowToForm(row: CoaRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    accountType: row.accountType ?? row.account_type ?? '',
    storeId: row.storeId ?? row.store_id ?? '',
    isActive: row.isActive !== false && row.is_active !== false,
  };
}

function orderedStoreIds(stores: Array<{ id: string; name: string }>): string[] {
  const ids: string[] = [];
  if (stores.some((s) => s.id === COMPANY_STORE_ID)) ids.push(COMPANY_STORE_ID);
  const rest = stores
    .filter((s) => s.id !== COMPANY_STORE_ID)
    .sort((a, b) => {
      const aL = a.name.toLowerCase().includes('lola');
      const bL = b.name.toLowerCase().includes('lola');
      if (aL && !bL) return -1;
      if (!aL && bL) return 1;
      return a.name.localeCompare(b.name);
    });
  rest.forEach((s) => ids.push(s.id));
  return ids;
}

function accountTypeBadgeColor(t: string): 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'gray' {
  switch (t) {
    case 'Asset':
      return 'blue';
    case 'Liability':
      return 'amber';
    case 'Income':
      return 'green';
    case 'Expense':
      return 'red';
    case 'Equity':
      return 'purple';
    default:
      return 'gray';
  }
}

const fields: FieldDef[] = [
  { key: 'id', label: 'Account ID', type: 'text', required: true, readOnlyOnEdit: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'accountType', label: 'Type', type: 'select', options: ACCOUNT_TYPES.map((t) => ({ value: t, label: t })), required: true },
  { key: 'storeId', label: 'Store', type: 'select', options: [], required: true },
  { key: 'isActive', label: 'Active', type: 'boolean' },
];

export function ChartOfAccountsTab() {
  const { data, isLoading } = useChartOfAccounts();
  const { data: stores } = useStores({ includeCompany: true });
  const save = useSaveAccount();
  const del = useDeleteAccount();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<CoaRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const wasSavingRef = useRef(false);

  const storesList = useMemo(
    () => (stores ?? []) as Array<{ id: string; name: string }>,
    [stores],
  );
  const storeOpts = useMemo(
    () => storesList.map((s) => ({ value: s.id, label: s.name })),
    [storesList],
  );
  const storeIdToName = useMemo(
    () => Object.fromEntries(storesList.map((s) => [s.id, s.name])),
    [storesList],
  );
  const storeOrder = useMemo(() => orderedStoreIds(storesList), [storesList]);

  const formFields = useMemo((): FieldDef[] => {
    return fields.map((f) =>
      f.key === 'storeId' ? { ...f, options: storeOpts } : f,
    );
  }, [storeOpts]);

  const filteredRows = useMemo(() => {
    let rows = ((data ?? []) as CoaRow[]).slice();
    if (!showInactive) rows = rows.filter(normActive);
    if (typeFilter !== 'All') rows = rows.filter((r) => normType(r) === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) => normId(r).toLowerCase().includes(q) || normName(r).toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, showInactive, typeFilter, search]);

  const sections = useMemo(() => {
    const byStore = new Map<string, CoaRow[]>();
    for (const sid of storeOrder) byStore.set(sid, []);
    byStore.set('__other__', []);

    for (const row of filteredRows) {
      const sid = normStoreId(row);
      if (byStore.has(sid)) byStore.get(sid)!.push(row);
      else byStore.get('__other__')!.push(row);
    }

    const out: { storeId: string; label: string; rows: CoaRow[] }[] = [];
    for (const sid of storeOrder) {
      const rows = (byStore.get(sid) ?? []).slice();
      if (rows.length === 0) continue;
      rows.sort((a, b) => normName(a).localeCompare(normName(b), undefined, { sensitivity: 'base' }));
      const label =
        sid === COMPANY_STORE_ID
          ? 'Company (All Stores)'
          : storeIdToName[sid] ?? sid;
      out.push({ storeId: sid, label, rows });
    }
    const other = (byStore.get('__other__') ?? []).slice();
    if (other.length > 0) {
      other.sort((a, b) => normName(a).localeCompare(normName(b), undefined, { sensitivity: 'base' }));
      out.push({ storeId: '__other__', label: 'Other', rows: other });
    }
    return out;
  }, [filteredRows, storeOrder, storeIdToName]);

  const isOpen = editing !== null || creating;

  useEffect(() => {
    if (editing) {
      setFormData(rowToForm(editing));
    } else if (creating) {
      const defaults: Record<string, unknown> = {};
      formFields.forEach((f) => {
        if (f.default !== undefined) defaults[f.key] = f.default;
        else if (f.type === 'boolean') defaults[f.key] = true;
        else if (f.type === 'number') defaults[f.key] = 0;
        else if (f.type === 'multiselect') defaults[f.key] = [];
        else defaults[f.key] = '';
      });
      if (storeOpts[0]) defaults.storeId = storeOpts[0].value;
      setFormData(defaults);
    }
  }, [editing, creating, formFields, storeOpts]);

  useEffect(() => {
    if (wasSavingRef.current && !save.isPending && !save.error) {
      setEditing(null);
      setCreating(false);
    }
    wasSavingRef.current = save.isPending;
  }, [save.isPending, save.error]);

  function closeModal() {
    setEditing(null);
    setCreating(false);
    setValidationError(null);
  }

  function handleField(key: string, value: unknown) {
    setValidationError(null);
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    const payload: Record<string, unknown> = { ...formData };
    if (editing) {
      payload._method = 'PUT';
      payload._id = editing.id;
    }
    save.mutate(payload);
  }

  if (isLoading) {
    return <p className="py-4 text-sm text-gray-500">Loading chart of accounts…</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Chart of Accounts</h3>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add account
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          Show inactive accounts
        </label>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Search</label>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by account name or ID…"
          className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {(data ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No chart of accounts configured yet.</p>
      ) : filteredRows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">
          No accounts match your filters. Try &quot;All&quot; types, clear search, or enable inactive accounts.
        </p>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.storeId}>
              <h4 className="mb-3 border-b border-gray-200 pb-2 text-sm font-semibold uppercase tracking-wide text-gray-800">
                {section.label}
              </h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-600">
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">ID</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => {
                      const active = normActive(row);
                      const typ = normType(row);
                      return (
                        <tr
                          key={normId(row)}
                          onClick={() => setEditing(row)}
                          className={`cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                            active ? '' : 'opacity-50'
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <Badge color={accountTypeBadgeColor(typ)}>{typ || '—'}</Badge>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-800">{normId(row)}</td>
                          <td className={`px-3 py-2.5 ${active ? 'text-gray-900' : 'text-gray-500'}`}>
                            {normName(row)}
                          </td>
                          <td className="px-3 py-2.5">
                            {active ? (
                              <span className="text-xs font-medium text-green-700">Active</span>
                            ) : (
                              <Badge color="gray">Inactive</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(normId(row));
                              }}
                              className="text-xs font-medium text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {isOpen && (
        <Modal
          open
          onClose={closeModal}
          title={editing ? 'Edit account' : 'Add account'}
          size="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formFields.map((f) => {
              const disabled = f.readOnlyOnEdit && !!editing;
              if (f.type === 'boolean') {
                return (
                  <label key={f.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!formData[f.key]}
                      onChange={(e) => handleField(f.key, e.target.checked)}
                      disabled={disabled}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">{f.label}</span>
                  </label>
                );
              }
              if (f.type === 'select') {
                return (
                  <label key={f.key} className="block">
                    <span className="text-sm font-medium text-gray-700">{f.label}</span>
                    <select
                      value={String(formData[f.key] ?? '')}
                      onChange={(e) => handleField(f.key, e.target.value)}
                      disabled={disabled}
                      required={f.required}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select…</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              return (
                <label key={f.key} className="block">
                  <span className="text-sm font-medium text-gray-700">{f.label}</span>
                  <input
                    type="text"
                    value={String(formData[f.key] ?? '')}
                    onChange={(e) => handleField(f.key, e.target.value)}
                    disabled={disabled}
                    required={f.required}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                </label>
              );
            })}
            {validationError && <p className="text-sm text-red-600">{validationError}</p>}
            {save.error && (
              <p className="text-sm text-red-600">{(save.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={save.isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete !== null && (
        <Modal open onClose={() => setConfirmDelete(null)} title="Confirm delete" size="sm">
          <p className="mb-4 text-sm text-gray-600">
            Delete account <span className="font-mono font-medium">{confirmDelete}</span>? This cannot be undone if the
            account is referenced elsewhere.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                del.mutate(confirmDelete);
                setConfirmDelete(null);
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
