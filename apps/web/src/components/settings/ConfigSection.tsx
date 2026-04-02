import { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal.js';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'date' | 'password' | 'multiselect';
  options?: { value: string; label: string }[];
  required?: boolean;
  readOnlyOnEdit?: boolean;
  placeholder?: string;
  /** e.g. 'username', 'new-password' - silences DOM autocomplete warning */
  autoComplete?: string;
  /** When set, this field is only shown when formData[showWhen.key] === showWhen.value */
  showWhen?: { key: string; value: string };
  /** Default value when creating (e.g. '__all__' for appliesTo) */
  default?: unknown;
}

export interface ConfigSectionProps<T extends Record<string, unknown>> {
  title: string;
  data: T[];
  isLoading: boolean;
  columns: { key: string; header: string; render?: (row: T) => React.ReactNode }[];
  fields: FieldDef[];
  idKey?: string;
  /** When provided, editing row is transformed to form data (e.g. map storeId null → __all__) */
  transformEditingToForm?: (row: T) => Record<string, unknown>;
  /** Optional content rendered at the top of the Add/Edit form (e.g. helper text) */
  extraContent?: React.ReactNode;
  /** Optional validation; return error string to block save and keep modal open */
  validate?: (payload: Record<string, unknown>) => string | null;
  onSave: (row: Record<string, unknown>) => void;
  onDelete?: (id: string | number) => void;
  isSaving: boolean;
  saveError?: Error | null;
  /** Called when the Add button is clicked (before the modal opens) */
  onAdd?: () => void;
  /** Called when the modal is closed via Cancel / X (not after a successful save) */
  onModalClose?: () => void;
}

export function ConfigSection<T extends Record<string, unknown>>({
  title,
  data,
  isLoading,
  columns,
  fields,
  idKey = 'id',
  transformEditingToForm,
  extraContent,
  validate,
  onSave,
  onDelete,
  isSaving,
  saveError,
  onAdd,
  onModalClose,
}: ConfigSectionProps<T>) {
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const wasSavingRef = useRef(false);

  const isOpen = editing !== null || creating;

  useEffect(() => {
    if (editing) {
      setFormData(transformEditingToForm ? transformEditingToForm(editing) : { ...editing });
    } else if (creating) {
      const defaults: Record<string, unknown> = {};
      fields.forEach((f) => {
        if (f.default !== undefined) defaults[f.key] = f.default;
        else if (f.type === 'boolean') defaults[f.key] = true;
        else if (f.type === 'number') defaults[f.key] = 0;
        else if (f.type === 'multiselect') defaults[f.key] = [];
        else defaults[f.key] = '';
      });
      setFormData(defaults);
    }
  }, [editing, creating, fields, transformEditingToForm]);

  useEffect(() => {
    if (wasSavingRef.current && !isSaving && !saveError) {
      setEditing(null);
      setCreating(false);
    }
    wasSavingRef.current = isSaving;
  }, [isSaving, saveError]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    const payload: Record<string, unknown> = { ...formData };
    if (editing) {
      payload._method = 'PUT';
      payload._id = editing[idKey];
    }
    if (validate) {
      const err = validate(payload);
      if (err) {
        setValidationError(err);
        return;
      }
    }
    onSave(payload);
  }

  function handleField(key: string, value: unknown) {
    setValidationError(null);
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function closeModal() {
    setEditing(null);
    setCreating(false);
    setValidationError(null);
    onModalClose?.();
  }

  if (isLoading) return <p className="py-4 text-sm text-gray-500">Loading {title.toLowerCase()}...</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <button onClick={() => { setCreating(true); onAdd?.(); }} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Add
        </button>
      </div>

      {data.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No {title.toLowerCase()} configured yet.</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              {columns.map((c) => (
                <th key={c.key} className="pb-2 pr-4 font-medium">{c.header}</th>
              ))}
              {onDelete && <th className="pb-2 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={String(row[idKey] ?? idx)}
                onClick={() => setEditing(row)}
                className="cursor-pointer border-b hover:bg-gray-50"
              >
                {columns.map((c) => (
                  <td key={c.key} className="py-2 pr-4">
                    {c.render ? c.render(row) : String(row[c.key] ?? '—')}
                  </td>
                ))}
                {onDelete && (
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(row[idKey] as string | number); }}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isOpen && (
        <Modal open onClose={closeModal} title={editing ? `Edit ${title}` : `Add ${title}`} size="md">
          <form onSubmit={handleSubmit} className="space-y-4">
            {extraContent}
            {fields.map((f) => {
              if (f.showWhen && formData[f.showWhen.key] !== f.showWhen.value) return null;
              const disabled = f.readOnlyOnEdit && !!editing;
              if (f.type === 'boolean') {
                return (
                  <label key={f.key} className="flex items-center gap-2">
                    <input type="checkbox" checked={!!formData[f.key]} onChange={(e) => handleField(f.key, e.target.checked)} disabled={disabled}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    <span className="text-sm text-gray-700">{f.label}</span>
                  </label>
                );
              }
              if (f.type === 'select') {
                return (
                  <label key={f.key} className="block">
                    <span className="text-sm font-medium text-gray-700">{f.label}</span>
                    <select value={String(formData[f.key] ?? '')} onChange={(e) => handleField(f.key, e.target.value)} disabled={disabled} required={f.required}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="">Select...</option>
                      {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                );
              }
              if (f.type === 'multiselect') {
                const selected = (formData[f.key] as string[] | undefined) ?? [];
                return (
                  <div key={f.key} className="block">
                    <span className="text-sm font-medium text-gray-700">{f.label}</span>
                    <div className="mt-1 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-300 bg-gray-50 p-2">
                      {(f.options ?? []).map((o) => (
                        <label key={o.value} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected.includes(o.value)}
                            onChange={(e) => {
                              const next = e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value);
                              handleField(f.key, next);
                            }}
                            disabled={disabled}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600"
                          />
                          <span className="text-sm text-gray-700">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <label key={f.key} className="block">
                  <span className="text-sm font-medium text-gray-700">{f.label}</span>
                  <input
                    type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={f.type === 'password' ? String(formData[f.key] ?? '') : String(formData[f.key] ?? '')}
                    onChange={(e) => handleField(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                    disabled={disabled}
                    required={f.required && !(f.type === 'password' && !!editing)}
                    placeholder={f.placeholder ?? ''}
                    step={f.type === 'number' ? '0.01' : undefined}
                    autoComplete={f.autoComplete ?? (f.type === 'password' ? (editing ? 'current-password' : 'new-password') : undefined)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                </label>
              );
            })}
            {validationError && <p className="text-sm text-red-600">{validationError}</p>}
            {saveError && <p className="text-sm text-red-600">{saveError.message}</p>}
            <div className="flex justify-end gap-2 border-t pt-4">
              <button type="button" onClick={closeModal} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={isSaving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete !== null && (
        <Modal open onClose={() => setConfirmDelete(null)} title="Confirm delete" size="sm">
          <p className="mb-4 text-sm text-gray-600">Are you sure you want to delete this item? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
            <button
              onClick={() => { if (onDelete && confirmDelete !== null) onDelete(confirmDelete); setConfirmDelete(null); }}
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
