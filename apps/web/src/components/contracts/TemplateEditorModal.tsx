import { useMemo, useRef, useState } from 'react';
import {
  BUILT_IN_CONTRACT_PLACEHOLDERS,
  CONTRACT_CATEGORY_COUNTERPARTY,
  CONTRACT_CATEGORY_LABELS,
  CONTRACT_COUNTERPARTY_FIELDS,
  extractPlaceholderKeys,
  renderContractTemplate,
  type ContractCategory,
  type ContractPlaceholderField,
} from '@lolas/shared';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { ContractMarkdown } from './ContractMarkdown.js';
import { useSaveContractTemplate, type ContractTemplate } from '../../api/contracts.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { allowedContractCategories } from './contract-ui.js';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
const BUILT_IN_KEYS = new Set<string>(BUILT_IN_CONTRACT_PLACEHOLDERS.map((p) => p.key));

function labelFromKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface Props {
  template: ContractTemplate | null;
  onClose: () => void;
}

export function TemplateEditorModal({ template, onClose }: Props) {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const categories = allowedContractCategories(permissions);
  const [name, setName] = useState(template?.name ?? '');
  const [category, setCategory] = useState<ContractCategory>(template?.category ?? categories[0] ?? 'other');
  const [description, setDescription] = useState(template?.description ?? '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [body, setBody] = useState(template?.bodyMarkdown ?? '');
  const [fields, setFields] = useState<ContractPlaceholderField[]>(template?.placeholders ?? []);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const save = useSaveContractTemplate();

  const sourceOptions = CONTRACT_COUNTERPARTY_FIELDS[CONTRACT_CATEGORY_COUNTERPARTY[category]];
  const preview = useMemo(() => renderContractTemplate(body, fields, {}), [body, fields]);
  const undeclared = extractPlaceholderKeys(body).filter((k) => !BUILT_IN_KEYS.has(k) && !fields.some((f) => f.key === k));

  function insertAtCursor(text: string) {
    const el = bodyRef.current;
    if (!el) { setBody((b) => b + text); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function updateField(idx: number, patch: Partial<ContractPlaceholderField>) {
    setFields((fs) => fs.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  function addField(key = '') {
    setFields((fs) => [...fs, { key, label: key ? labelFromKey(key) : '', type: 'text', required: true }]);
  }

  async function submit() {
    setError(null);
    const bad = fields.find((f) => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.key) || !f.label.trim());
    if (!name.trim()) { setError('Give the template a name.'); return; }
    if (bad) { setError('Every placeholder needs a key (letters, numbers, underscores) and a label.'); return; }
    if (new Set(fields.map((f) => f.key)).size !== fields.length) { setError('Placeholder keys must be unique.'); return; }
    try {
      await save.mutateAsync({
        ...(template ? { id: template.id } : {}),
        name: name.trim(),
        category,
        description: description.trim() || null,
        bodyMarkdown: body,
        placeholders: fields.map((f) => ({
          ...f,
          defaultValue: f.defaultValue?.trim() ? f.defaultValue : undefined,
          source: f.source || undefined,
        })),
        isActive,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} size="2xl" title={template ? `Edit template: ${template.name}` : 'New contract template'}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm md:col-span-1">
            <span className="mb-1 block font-medium text-gray-700">Name</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Paw Card Partner Agreement" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Type</span>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as ContractCategory)}>
              {categories.map((c) => <option key={c} value={c}>{CONTRACT_CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active (available for new contracts)
          </label>
          <label className="block text-sm md:col-span-3">
            <span className="mb-1 block font-medium text-gray-700">Description</span>
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When to use this template" />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">Contract text</span>
              <select
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                value=""
                onChange={(e) => { if (e.target.value) insertAtCursor(`{{${e.target.value}}}`); }}
              >
                <option value="">Insert placeholder…</option>
                <optgroup label="Template fields">
                  {fields.filter((f) => f.key).map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
                </optgroup>
                <optgroup label="Filled automatically">
                  {BUILT_IN_CONTRACT_PLACEHOLDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </optgroup>
              </select>
            </div>
            <textarea
              ref={bodyRef}
              className={`${inputCls} h-[420px] font-mono text-xs leading-relaxed`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'# Agreement title\n\nThis agreement is between **Lola\'s Rentals** and {{partner_name}}.\n\n## 1. Offer\n\n- {{offer}}'}
            />
            <p className="text-xs text-gray-500">
              Use <code># Heading</code>, <code>## Sub-heading</code>, <code>**bold**</code>, <code>*italic*</code>, <code>- bullet</code>, <code>1. numbered</code> and <code>---</code> for a line. Placeholders look like <code>{'{{partner_name}}'}</code>.
            </p>
            {undeclared.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                These placeholders are in the text but not set up as fields: {undeclared.map((k) => `{{${k}}}`).join(', ')}.{' '}
                <button type="button" className="font-semibold underline" onClick={() => undeclared.forEach((k) => addField(k))}>Add them</button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Preview</span>
            <div className="h-[420px] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
              <ContractMarkdown body={preview.body} />
            </div>
            <p className="text-xs text-gray-500">Highlighted tags are filled in for each contract.</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Placeholder fields</span>
            <Button size="sm" variant="secondary" onClick={() => addField()}>Add field</Button>
          </div>
          {fields.length === 0 ? (
            <p className="text-xs text-gray-500">No fields yet. Add one for each detail that changes between contracts, such as the partner name or the offer.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-2 py-2">Key</th>
                    <th className="px-2 py-2">Label</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Required</th>
                    <th className="px-2 py-2">Default</th>
                    <th className="px-2 py-2">Auto-fill from</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1.5"><input className={`${inputCls} font-mono text-xs`} value={f.key} onChange={(e) => updateField(i, { key: e.target.value.replace(/\s+/g, '_') })} /></td>
                      <td className="px-2 py-1.5"><input className={`${inputCls} text-xs`} value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} /></td>
                      <td className="px-2 py-1.5">
                        <select className={`${inputCls} text-xs`} value={f.type} onChange={(e) => updateField(i, { type: e.target.value as ContractPlaceholderField['type'] })}>
                          <option value="text">Text</option>
                          <option value="multiline">Long text</option>
                          <option value="date">Date</option>
                          <option value="number">Number</option>
                          <option value="money">Money (PHP)</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} /></td>
                      <td className="px-2 py-1.5"><input className={`${inputCls} text-xs`} value={f.defaultValue ?? ''} onChange={(e) => updateField(i, { defaultValue: e.target.value })} /></td>
                      <td className="px-2 py-1.5">
                        <select className={`${inputCls} text-xs`} value={f.source ?? ''} onChange={(e) => updateField(i, { source: e.target.value || undefined })} disabled={sourceOptions.length === 0}>
                          <option value="">None</option>
                          {sourceOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button type="button" className="text-red-600 hover:underline" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {template && <p className="text-xs text-gray-500">Version {template.version}. Changing the text or fields creates a new version; contracts already sent keep their wording.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => void submit()}>{template ? 'Save template' : 'Create template'}</Button>
        </div>
      </div>
    </Modal>
  );
}
