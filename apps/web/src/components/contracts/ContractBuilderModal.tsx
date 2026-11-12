import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTRACT_CATEGORY_COUNTERPARTY,
  CONTRACT_CATEGORY_LABELS,
  renderContractTemplate,
  type ContractCategory,
  type ContractCounterpartyType,
  type ContractPlaceholderField,
} from '@lolas/shared';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { ContractMarkdown } from './ContractMarkdown.js';
import { allowedContractCategories } from './contract-ui.js';
import {
  useContract,
  useContractCounterparties,
  useContractTemplates,
  useCreateContract,
  useUpdateContract,
  type Contract,
  type ContractCounterparty,
  type ContractTemplate,
} from '../../api/contracts.js';
import { useAuthStore } from '../../stores/auth-store.js';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

const COUNTERPARTY_LABEL: Record<ContractCounterpartyType, string> = {
  accommodation_partner: 'Accommodation partner',
  paw_card_establishment: 'Paw Card establishment',
  employee: 'Employee',
  external: 'Not linked',
};

export interface ContractBuilderInitial {
  category?: ContractCategory;
  counterpartyType?: ContractCounterpartyType;
  counterpartyId?: string;
  templateId?: string;
}

interface Props {
  contractId: string | null;
  initial?: ContractBuilderInitial;
  onClose: () => void;
  onSaved: (contract: Contract) => void;
}

function FieldInput({ field, value, onChange }: { field: ContractPlaceholderField; value: string; onChange: (v: string) => void }) {
  if (field.type === 'multiline') {
    return <textarea className={`${inputCls} min-h-[72px]`} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  const type = field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'money' ? 'number' : 'text';
  return <input className={inputCls} type={type} step="any" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function applyCounterparty(tpl: ContractTemplate | undefined, cp: ContractCounterparty, values: Record<string, string>): Record<string, string> {
  const next = { ...values };
  for (const f of tpl?.placeholders ?? []) {
    const v = f.source ? cp.fields[f.source] : undefined;
    if (v) next[f.key] = v;
  }
  return next;
}

export function ContractBuilderModal({ contractId, initial, onClose, onSaved }: Props) {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const categories = allowedContractCategories(permissions);
  const { data: templates = [] } = useContractTemplates(true);
  const { data: existing } = useContract(contractId);
  const create = useCreateContract();
  const update = useUpdateContract();

  const [templateId, setTemplateId] = useState('');
  const [category, setCategory] = useState<ContractCategory>(initial?.category ?? categories[0] ?? 'other');
  const [linked, setLinked] = useState(initial?.counterpartyType ? initial.counterpartyType !== 'external' : true);
  const [counterpartyId, setCounterpartyId] = useState(initial?.counterpartyId ?? '');
  const [title, setTitle] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [customBody, setCustomBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const initialAppliedRef = useRef(false);
  const autoFilledRef = useRef<string | null>(null);

  const tpl = templates.find((t) => t.id === templateId);
  const defaultType = CONTRACT_CATEGORY_COUNTERPARTY[category];
  const counterpartyType: ContractCounterpartyType = linked && defaultType !== 'external' ? defaultType : 'external';
  const { data: counterparties = [] } = useContractCounterparties(counterpartyType === 'external' ? null : counterpartyType);
  const categoryTemplates = templates.filter((t) => t.category === category && (t.isActive || t.id === templateId));

  // Editing a draft: load its saved state once.
  useEffect(() => {
    if (!existing || loadedRef.current || (existing.templateId && templates.length === 0)) return;
    loadedRef.current = true;
    autoFilledRef.current = existing.counterpartyId;
    setTemplateId(existing.templateId ?? '');
    setCategory(existing.category);
    setLinked(existing.counterpartyType !== 'external');
    setCounterpartyId(existing.counterpartyId ?? '');
    setTitle(existing.title);
    setRecipientName(existing.recipientName);
    setRecipientEmail(existing.recipientEmail ?? '');
    setValues(existing.values);
    const t = templates.find((x) => x.id === existing.templateId);
    const regenerated = t
      ? renderContractTemplate(t.bodyMarkdown, t.placeholders, { ...existing.values, recipient_name: existing.recipientName }).body
      : null;
    setCustomBody(regenerated === existing.renderedBody ? null : existing.renderedBody);
  }, [existing, templates]);

  // New contract: apply the requested template, or the only active one for a preset category.
  useEffect(() => {
    if (contractId || initialAppliedRef.current || templates.length === 0) return;
    initialAppliedRef.current = true;
    const id = initial?.templateId ?? (initial?.category && categoryTemplates.length === 1 ? categoryTemplates[0]!.id : undefined);
    if (id) selectTemplate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.length]);

  // Auto-fill once the linked record list has loaded (or the record changes).
  useEffect(() => {
    const cp = counterparties.find((c) => c.id === counterpartyId);
    if (!cp || autoFilledRef.current === `${templateId}:${cp.id}`) return;
    autoFilledRef.current = `${templateId}:${cp.id}`;
    setValues((v) => applyCounterparty(tpl, cp, v));
    setRecipientName((n) => n || cp.fields.contact_name || cp.name);
    setRecipientEmail((e) => e || cp.email || '');
  }, [counterparties, counterpartyId, tpl, templateId]);

  function selectTemplate(id: string) {
    const next = templates.find((t) => t.id === id);
    setTemplateId(id);
    setCustomBody(next ? null : (customBody ?? ''));
    if (!next) return;
    setCategory(next.category);
    setTitle((t) => (!t || templates.some((x) => x.name === t) ? next.name : t));
    setValues((v) => {
      const out: Record<string, string> = {};
      for (const f of next.placeholders) out[f.key] = v[f.key] ?? f.defaultValue ?? '';
      const cp = counterparties.find((c) => c.id === counterpartyId);
      return cp ? applyCounterparty(next, cp, out) : out;
    });
  }

  function selectCounterparty(id: string) {
    setCounterpartyId(id);
    const cp = counterparties.find((c) => c.id === id);
    if (!cp) return;
    autoFilledRef.current = `${templateId}:${cp.id}`;
    setValues((v) => applyCounterparty(tpl, cp, v));
    setRecipientName(cp.fields.contact_name || cp.name);
    setRecipientEmail(cp.email ?? '');
  }

  const rendered = useMemo(
    () => (tpl ? renderContractTemplate(tpl.bodyMarkdown, tpl.placeholders, { ...values, recipient_name: recipientName }) : null),
    [tpl, values, recipientName],
  );
  const body = customBody ?? rendered?.body ?? '';
  const editingText = !tpl || customBody !== null;
  const missingLabels = (rendered?.missing ?? []).map((k) => tpl?.placeholders.find((f) => f.key === k)?.label ?? k);

  async function submit() {
    setError(null);
    if (!title.trim()) { setError('Give the contract a title.'); return; }
    if (!recipientName.trim()) { setError('Enter who the contract is for.'); return; }
    if (counterpartyType !== 'external' && !counterpartyId) { setError(`Choose the ${COUNTERPARTY_LABEL[counterpartyType].toLowerCase()}, or untick "Link to a record".`); return; }
    const payload = {
      title: title.trim(),
      category,
      counterpartyType,
      counterpartyId: counterpartyType === 'external' ? null : counterpartyId,
      recipientName: recipientName.trim(),
      recipientEmail: recipientEmail.trim() || null,
      values,
      renderedBody: body,
    };
    try {
      const saved = contractId
        ? await update.mutateAsync({ id: contractId, ...payload })
        : await create.mutateAsync({ ...payload, templateId: templateId || null });
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const busy = create.isPending || update.isPending;
  const loadingDraft = !!contractId && !loadedRef.current;

  return (
    <Modal open onClose={onClose} size="2xl" title={contractId ? 'Edit draft contract' : 'New contract'}>
      {loadingDraft ? (
        <p className="py-12 text-center text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">1. Template</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-600">Type</span>
                  <select
                    className={inputCls}
                    value={category}
                    disabled={!!contractId}
                    onChange={(e) => { setCategory(e.target.value as ContractCategory); setTemplateId(''); setCounterpartyId(''); setCustomBody(''); }}
                  >
                    {categories.map((c) => <option key={c} value={c}>{CONTRACT_CATEGORY_LABELS[c]}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-600">Template</span>
                  <select className={inputCls} value={templateId} disabled={!!contractId} onChange={(e) => selectTemplate(e.target.value)}>
                    <option value="">Blank contract (write your own)</option>
                    {categoryTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">Contract title</span>
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Paw Card Partner Agreement" />
              </label>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">2. Who is it for?</h3>
              {defaultType !== 'external' && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
                    Link to a {COUNTERPARTY_LABEL[defaultType].toLowerCase()} (fills in their details)
                  </label>
                  {linked && (
                    <select className={inputCls} value={counterpartyId} onChange={(e) => selectCounterparty(e.target.value)}>
                      <option value="">Choose…</option>
                      {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-600">Signer's full name</span>
                  <input className={inputCls} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-600">Signer's email</span>
                  <input className={inputCls} type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="For the signing link and PDF" />
                </label>
              </div>
            </section>

            {tpl && tpl.placeholders.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">3. Contract details</h3>
                {tpl.placeholders.map((f) => (
                  <label key={f.key} className="block text-sm">
                    <span className="mb-1 block text-gray-600">{f.label}{f.required ? '' : ' (optional)'}</span>
                    <FieldInput field={f} value={values[f.key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
                  </label>
                ))}
                {customBody !== null && (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                    You've edited the text directly, so changes here no longer update it.{' '}
                    <button type="button" className="font-semibold underline" onClick={() => setCustomBody(null)}>Reset to template</button>
                  </p>
                )}
              </section>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">{tpl ? 'Preview' : 'Contract text'}</h3>
              {tpl && (
                <Button size="sm" variant="ghost" onClick={() => setCustomBody(customBody === null ? body : null)}>
                  {customBody === null ? 'Edit text' : 'Back to preview'}
                </Button>
              )}
            </div>
            {editingText && (
              <textarea
                className={`${inputCls} h-[260px] font-mono text-xs leading-relaxed`}
                value={customBody ?? ''}
                onChange={(e) => setCustomBody(e.target.value)}
                placeholder={'# Agreement title\n\nWrite the contract here. **bold**, *italic*, - bullets'}
              />
            )}
            <div className={`${editingText ? 'h-[300px]' : 'h-[580px]'} overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4`}>
              <ContractMarkdown body={body} />
            </div>
            {missingLabels.length > 0 && customBody === null && (
              <p className="text-xs text-amber-700">Still to fill in before sending: {missingLabels.join(', ')}.</p>
            )}
            <p className="text-xs text-gray-500">Today's date and Lola's signer are filled in when you sign and send.</p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3 lg:col-span-2">
            {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button loading={busy} onClick={() => void submit()}>{contractId ? 'Save draft' : 'Save draft and continue'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
