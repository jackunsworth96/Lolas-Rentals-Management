import { useMemo, useState } from 'react';
import { useExpenseCategories, useSaveExpenseCategory, useDeleteExpenseCategory, useChartOfAccounts } from '../../../api/config.js';
import type { ExpenseCatalogItem, ExpenseKind } from '../../../api/expenses.js';
import { useUIStore } from '../../../stores/ui-store.js';
import { Modal } from '../../common/Modal.js';
import { Button } from '../../common/Button.js';
import { ConfirmDialog } from '../../common/ConfirmDialog.js';
import { formatCurrency } from '../../../utils/currency.js';
import { errorReasons, inputCls, labelCls } from '../../expenses/expense-ui.js';

const KIND_LABEL: Record<ExpenseKind, string> = {
  standard: 'Expense',
  bike_allowance: 'Bike allowance payout',
  cash_advance: 'Cash advance',
  handled_elsewhere: 'Logged on another page',
  system: 'Automatic',
};

const LINK_OPTIONS = [
  { value: '/hr/timesheets', label: 'Timesheets' },
  { value: '/hr/payroll', label: 'Payroll' },
  { value: '/maintenance', label: 'Maintenance' },
  { value: '/orders/active', label: 'Active orders' },
];

interface Draft {
  id?: number;
  name: string;
  kind: 'standard' | 'handled_elsewhere';
  groupName: string;
  accountId: string;
  sortOrder: string;
  requiresVehicle: boolean;
  requiresEmployee: boolean;
  requiresNote: boolean;
  softLimit: string;
  managersOnly: boolean;
  helpText: string;
  linkPath: string;
}

const EMPTY: Draft = {
  name: '',
  kind: 'standard',
  groupName: '',
  accountId: '',
  sortOrder: '',
  requiresVehicle: false,
  requiresEmployee: false,
  requiresNote: false,
  softLimit: '',
  managersOnly: false,
  helpText: '',
  linkPath: '',
};

export function ExpenseCategoriesTab() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data, isLoading } = useExpenseCategories(storeId || undefined);
  const { data: rawAccounts } = useChartOfAccounts();
  const save = useSaveExpenseCategory();
  const del = useDeleteExpenseCategory();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [retiring, setRetiring] = useState<ExpenseCatalogItem | null>(null);

  const catalog = useMemo(
    () => [...((data ?? []) as ExpenseCatalogItem[])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [data],
  );
  const accounts = useMemo(
    () => ((rawAccounts ?? []) as Array<Record<string, unknown>>).map((a) => ({
      id: String(a.id),
      name: String(a.name),
      type: String(a.accountType ?? a.account_type ?? ''),
      storeId: (a.storeId ?? a.store_id ?? null) as string | null,
      active: a.isActive !== false && a.is_active !== false,
    })),
    [rawAccounts],
  );
  const bookable = accounts.filter(
    (a) => a.active && ['Expense', 'Equity', 'Liability'].includes(a.type) && (a.storeId === storeId || a.storeId === 'company' || a.storeId == null),
  );
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '—';
  const groups = useMemo(() => {
    const m = new Map<string, ExpenseCatalogItem[]>();
    for (const c of catalog) m.set(c.groupName ?? 'Other', [...(m.get(c.groupName ?? 'Other') ?? []), c]);
    return [...m.entries()];
  }, [catalog]);
  const groupNames = groups.map(([g]) => g).filter((g) => g !== 'System');

  function edit(c: ExpenseCatalogItem) {
    save.reset();
    setDraft({
      id: c.id,
      name: c.name,
      kind: c.kind === 'handled_elsewhere' ? 'handled_elsewhere' : 'standard',
      groupName: c.groupName ?? '',
      accountId: c.accountId ?? '',
      sortOrder: String(c.sortOrder ?? ''),
      requiresVehicle: c.requiresVehicle,
      requiresEmployee: c.requiresEmployee,
      requiresNote: c.requiresNote,
      softLimit: c.softLimit != null ? String(c.softLimit) : '',
      managersOnly: c.managersOnly,
      helpText: c.helpText ?? '',
      linkPath: c.linkPath ?? '',
    });
  }

  function submit() {
    if (!draft) return;
    const body: Record<string, unknown> = {
      name: draft.name.trim(),
      kind: draft.kind,
      groupName: draft.groupName.trim() || null,
      accountId: draft.kind === 'standard' ? draft.accountId || null : null,
      sortOrder: draft.sortOrder ? Number(draft.sortOrder) : undefined,
      requiresVehicle: draft.requiresVehicle,
      requiresEmployee: draft.requiresEmployee,
      requiresNote: draft.requiresNote,
      softLimit: draft.softLimit ? Number(draft.softLimit) : null,
      managersOnly: draft.managersOnly,
      helpText: draft.helpText.trim() || null,
      linkPath: draft.kind === 'handled_elsewhere' ? draft.linkPath || null : null,
      isActive: true,
    };
    if (draft.id) Object.assign(body, { _method: 'PUT', _id: draft.id });
    save.mutate(body, { onSuccess: () => setDraft(null) });
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const draftInvalid = !draft?.name.trim() || (draft.kind === 'standard' && !draft.accountId) || (draft.kind === 'handled_elsewhere' && !draft.linkPath);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Expense types</h2>
          <p className="max-w-2xl text-pretty text-sm text-gray-600">
            What staff can pick when they log an expense, and the account each one books to. Staff never choose the
            account themselves. Removing a type hides it from the list; past expenses keep their type.
          </p>
        </div>
        <Button onClick={() => { save.reset(); setDraft({ ...EMPTY }); }}>Add expense type</Button>
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        groups.map(([group, items]) => (
          <section key={group} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <h3 className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-gray-600">{group}</h3>
            <ul className="divide-y divide-gray-100">
              {items.map((c) => {
                const fixed = c.kind === 'bike_allowance' || c.kind === 'cash_advance' || c.kind === 'system';
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {c.name}
                        {c.managersOnly && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">Managers only</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {KIND_LABEL[c.kind]}
                        {c.kind === 'handled_elsewhere'
                          ? ` · ${LINK_OPTIONS.find((l) => l.value === c.linkPath)?.label ?? c.linkPath ?? ''}`
                          : c.accountId ? ` · books to ${accountName(c.accountId)}` : ''}
                        {c.softLimit != null && ` · usually up to ${formatCurrency(c.softLimit)}`}
                        {c.requiresVehicle && ' · needs vehicle'}
                        {c.requiresNote && ' · needs details'}
                      </p>
                    </div>
                    {fixed ? (
                      <span className="text-xs text-gray-400">Set by payroll</span>
                    ) : (
                      <div className="flex gap-1">
                        <button type="button" onClick={() => edit(c)} className="rounded px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50">Edit</button>
                        <button type="button" onClick={() => { del.reset(); setRetiring(c); }} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Remove</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit ${draft.name}` : 'Add expense type'}
        size="lg"
        fullScreenOnMobile
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={save.isPending}>Cancel</Button>
            <Button onClick={submit} loading={save.isPending} disabled={draftInvalid}>Save</Button>
          </div>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cat-name" className={labelCls}>Name</label>
              <input id="cat-name" value={draft.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="cat-group" className={labelCls}>Group</label>
              <input id="cat-group" list="cat-groups" value={draft.groupName} onChange={(e) => set('groupName', e.target.value)} className={inputCls} />
              <datalist id="cat-groups">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>
            </div>
            <div>
              <label htmlFor="cat-kind" className={labelCls}>How it's logged</label>
              <select id="cat-kind" value={draft.kind} onChange={(e) => set('kind', e.target.value as Draft['kind'])} className={inputCls}>
                <option value="standard">Logged here as an expense</option>
                <option value="handled_elsewhere">Logged on another page (shown as a pointer)</option>
              </select>
            </div>
            {draft.kind === 'standard' ? (
              <div>
                <label htmlFor="cat-account" className={labelCls}>Books to</label>
                <select id="cat-account" value={draft.accountId} onChange={(e) => set('accountId', e.target.value)} className={inputCls}>
                  <option value="">Choose account</option>
                  {['Expense', 'Equity', 'Liability'].map((t) => (
                    <optgroup key={t} label={t}>
                      {bookable.filter((a) => a.type === t).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="cat-link" className={labelCls}>Send staff to</label>
                <select id="cat-link" value={draft.linkPath} onChange={(e) => set('linkPath', e.target.value)} className={inputCls}>
                  <option value="">Choose page</option>
                  {LINK_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="cat-help" className={labelCls}>Help text shown to staff</label>
              <input id="cat-help" value={draft.helpText} onChange={(e) => set('helpText', e.target.value)} placeholder="What belongs here, in one sentence" className={inputCls} />
            </div>
            {draft.kind === 'standard' && (
              <>
                <div>
                  <label htmlFor="cat-limit" className={labelCls}>Usual maximum (₱)</label>
                  <input id="cat-limit" type="number" min={0} value={draft.softLimit} onChange={(e) => set('softLimit', e.target.value)} placeholder="No limit" className={inputCls} />
                  <p className="mt-1 text-xs text-gray-500">Above this, staff must confirm the amount.</p>
                </div>
                <div>
                  <label htmlFor="cat-order" className={labelCls}>Position</label>
                  <input id="cat-order" type="number" min={0} value={draft.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} placeholder="Last" className={inputCls} />
                </div>
                <fieldset className="space-y-2 sm:col-span-2">
                  <legend className={labelCls}>Rules</legend>
                  {([
                    ['requiresVehicle', 'Must choose a vehicle'],
                    ['requiresNote', 'Must include a detailed description'],
                    ['requiresEmployee', 'Must choose a staff member'],
                    ['managersOnly', 'Only managers can log this'],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={draft[k]} onChange={(e) => set(k, e.target.checked)} className="size-4 rounded border-gray-300" />
                      {label}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {save.error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
                {errorReasons(save.error).join(' ')}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!retiring}
        title={`Remove ${retiring?.name ?? ''}?`}
        message="Staff won't be able to pick it any more. Expenses already logged with it keep their type and account."
        confirmLabel="Remove"
        destructive
        busy={del.isPending}
        error={del.error ? errorReasons(del.error).join(' ') : null}
        onConfirm={() => retiring && del.mutate(retiring.id, { onSuccess: () => setRetiring(null) })}
        onClose={() => setRetiring(null)}
      />
    </div>
  );
}
