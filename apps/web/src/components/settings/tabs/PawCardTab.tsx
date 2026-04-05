import { useState, useEffect, useRef } from 'react';
import { usePawCardEstablishments, useSaveEstablishment, useDeleteEstablishment } from '../../../api/config.js';
import { Modal } from '../../common/Modal.js';

const CATEGORIES = ['Food & Drink', 'Activities', 'Services', 'Shopping'] as const;
const TIME_OF_DAY = [
  { value: 'all_day', label: 'All Day' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'late_night', label: 'Late Night' },
] as const;

type EstablishmentRow = Record<string, unknown>;

interface FormState {
  name: string;
  isActive: boolean;
  category: string;
  discountHeadline: string;
  discountConditions: string;
  discountCode: string;
  description: string;
  openingHours: string;
  timeOfDay: string;
  savingSolo: string;
  savingGroup: string;
  googleRating: string;
  googleMapsUrl: string;
  instagramUrl: string;
  isFavourite: boolean;
  isHighValue: boolean;
}

function emptyForm(): FormState {
  return {
    name: '',
    isActive: true,
    category: 'Food & Drink',
    discountHeadline: '',
    discountConditions: '',
    discountCode: '',
    description: '',
    openingHours: '',
    timeOfDay: 'all_day',
    savingSolo: '',
    savingGroup: '',
    googleRating: '',
    googleMapsUrl: '',
    instagramUrl: '',
    isFavourite: false,
    isHighValue: false,
  };
}

function rowToForm(row: EstablishmentRow): FormState {
  return {
    name: String(row.name ?? ''),
    isActive: row.isActive !== false,
    category: String(row.category ?? 'Food & Drink'),
    discountHeadline: String(row.discountHeadline ?? ''),
    discountConditions: String(row.discountConditions ?? ''),
    discountCode: String(row.discountCode ?? ''),
    description: String(row.description ?? ''),
    openingHours: String(row.openingHours ?? ''),
    timeOfDay: String(row.timeOfDay ?? 'all_day'),
    savingSolo: row.savingSolo != null ? String(row.savingSolo) : '',
    savingGroup: row.savingGroup != null ? String(row.savingGroup) : '',
    googleRating: row.googleRating != null ? String(row.googleRating) : '',
    googleMapsUrl: String(row.googleMapsUrl ?? ''),
    instagramUrl: String(row.instagramUrl ?? ''),
    isFavourite: Boolean(row.isFavourite),
    isHighValue: Boolean(row.isHighValue),
  };
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border-b border-gray-200 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
      {children}
    </h4>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="text-sm font-medium text-gray-700">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </span>
  );
}

const inputCls =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export function PawCardTab() {
  const { data, isLoading } = usePawCardEstablishments();
  const rows = (data ?? []) as EstablishmentRow[];

  const save = useSaveEstablishment();
  const del = useDeleteEstablishment();

  const [editing, setEditing] = useState<EstablishmentRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const wasSavingRef = useRef(false);

  const isOpen = editing !== null || creating;

  useEffect(() => {
    if (editing) setForm(rowToForm(editing));
    else if (creating) setForm(emptyForm());
  }, [editing, creating]);

  useEffect(() => {
    if (wasSavingRef.current && !save.isPending && !save.error) {
      setEditing(null);
      setCreating(false);
    }
    wasSavingRef.current = save.isPending;
  }, [save.isPending, save.error]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: form.name,
      isActive: form.isActive,
      category: form.category,
      discountHeadline: form.discountHeadline || undefined,
      discountConditions: form.discountConditions || undefined,
      discountCode: form.discountCode || undefined,
      description: form.description || undefined,
      openingHours: form.openingHours || undefined,
      timeOfDay: form.timeOfDay || undefined,
      savingSolo: form.savingSolo !== '' ? parseInt(form.savingSolo) : null,
      savingGroup: form.savingGroup !== '' ? parseInt(form.savingGroup) : null,
      googleRating: form.googleRating !== '' ? parseFloat(form.googleRating) : null,
      googleMapsUrl: form.googleMapsUrl || undefined,
      instagramUrl: form.instagramUrl || undefined,
      isFavourite: form.isFavourite,
      isHighValue: form.isHighValue,
    };
    if (editing) {
      payload._method = 'PUT';
      payload._id = editing.id;
    }
    save.mutate(payload);
  }

  function closeModal() {
    setEditing(null);
    setCreating(false);
  }

  if (isLoading) return <p className="py-4 text-sm text-gray-500">Loading paw card establishments...</p>;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Paw Card Establishments</h3>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No establishments configured yet.</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Category</th>
              <th className="pb-2 pr-4 font-medium">Discount</th>
              <th className="pb-2 pr-4 font-medium">Active</th>
              <th className="pb-2 pr-4 font-medium">Fav</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={String(row.id ?? idx)}
                onClick={() => setEditing(row)}
                className="cursor-pointer border-b hover:bg-gray-50"
              >
                <td className="py-2 pr-4 font-medium">{String(row.name ?? '—')}</td>
                <td className="py-2 pr-4 text-gray-500">{String(row.category ?? '—')}</td>
                <td className="py-2 pr-4 text-gray-500">{String(row.discountHeadline ?? '—')}</td>
                <td className="py-2 pr-4">{row.isActive === false ? 'No' : 'Yes'}</td>
                <td className="py-2 pr-4">{row.isFavourite ? '⭐' : '—'}</td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(row.id as number);
                    }}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add / Edit modal */}
      {isOpen && (
        <Modal
          open
          onClose={closeModal}
          title={editing ? 'Edit Establishment' : 'Add Establishment'}
          size="xl"
        >
          <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto px-1" style={{ maxHeight: '75vh' }}>

            {/* Section 1 — Basic Info */}
            <div className="space-y-4">
              <SectionHeading>Basic Info</SectionHeading>
              <div className="grid grid-cols-2 gap-4">
                <label className="col-span-2 block">
                  <FieldLabel required>Name</FieldLabel>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    required
                    className={inputCls}
                    placeholder="e.g. Kalinaw Restaurant"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => set('isActive', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>
            </div>

            {/* Section 2 — Discount */}
            <div className="space-y-4">
              <SectionHeading>Discount</SectionHeading>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <FieldLabel>Category</FieldLabel>
                  <select
                    value={form.category}
                    onChange={(e) => set('category', e.target.value)}
                    className={inputCls}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <FieldLabel>Discount headline</FieldLabel>
                  <input
                    type="text"
                    value={form.discountHeadline}
                    onChange={(e) => set('discountHeadline', e.target.value)}
                    className={inputCls}
                    placeholder='e.g. "10% Off" or "FREE Coffee"'
                  />
                </label>
                <label className="block">
                  <FieldLabel>Discount conditions</FieldLabel>
                  <input
                    type="text"
                    value={form.discountConditions}
                    onChange={(e) => set('discountConditions', e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Min Spend ₱400"
                  />
                </label>
                <label className="block">
                  <FieldLabel>Discount code</FieldLabel>
                  <input
                    type="text"
                    value={form.discountCode}
                    onChange={(e) => set('discountCode', e.target.value)}
                    className={inputCls}
                    placeholder="e.g. LOLA10 (optional)"
                  />
                </label>
              </div>
            </div>

            {/* Section 3 — About */}
            <div className="space-y-4">
              <SectionHeading>About</SectionHeading>
              <div className="grid grid-cols-2 gap-4">
                <label className="col-span-2 block">
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    rows={3}
                    className={inputCls}
                    placeholder="Short paragraph about this place..."
                  />
                </label>
                <label className="block">
                  <FieldLabel>Opening hours</FieldLabel>
                  <input
                    type="text"
                    value={form.openingHours}
                    onChange={(e) => set('openingHours', e.target.value)}
                    className={inputCls}
                    placeholder="e.g. 9am–7pm"
                  />
                </label>
                <label className="block">
                  <FieldLabel>Time of day</FieldLabel>
                  <select
                    value={form.timeOfDay}
                    onChange={(e) => set('timeOfDay', e.target.value)}
                    className={inputCls}
                  >
                    {TIME_OF_DAY.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Section 4 — Savings estimate */}
            <div className="space-y-4">
              <SectionHeading>Savings Estimate</SectionHeading>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <FieldLabel>Saving solo (₱ per person)</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.savingSolo}
                    onChange={(e) => set('savingSolo', e.target.value)}
                    className={inputCls}
                    placeholder="0"
                  />
                </label>
                <label className="block">
                  <FieldLabel>Saving group (₱ for 2 people)</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.savingGroup}
                    onChange={(e) => set('savingGroup', e.target.value)}
                    className={inputCls}
                    placeholder="0"
                  />
                </label>
              </div>
            </div>

            {/* Section 5 — Ratings & Links */}
            <div className="space-y-4">
              <SectionHeading>Ratings &amp; Links</SectionHeading>
              <div className="grid grid-cols-3 gap-4">
                <label className="block">
                  <FieldLabel>Google rating (0–5)</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={form.googleRating}
                    onChange={(e) => set('googleRating', e.target.value)}
                    className={inputCls}
                    placeholder="4.8"
                  />
                </label>
                <label className="col-span-2 block">
                  <FieldLabel>Google Maps URL</FieldLabel>
                  <input
                    type="text"
                    value={form.googleMapsUrl}
                    onChange={(e) => set('googleMapsUrl', e.target.value)}
                    className={inputCls}
                    placeholder="https://maps.google.com/..."
                  />
                </label>
                <label className="col-span-3 block">
                  <FieldLabel>Instagram URL</FieldLabel>
                  <input
                    type="text"
                    value={form.instagramUrl}
                    onChange={(e) => set('instagramUrl', e.target.value)}
                    className={inputCls}
                    placeholder="https://instagram.com/..."
                  />
                </label>
              </div>
            </div>

            {/* Section 6 — Flags */}
            <div className="space-y-3">
              <SectionHeading>Flags</SectionHeading>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isFavourite}
                  onChange={(e) => set('isFavourite', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">⭐ Mark as a favourite</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isHighValue}
                  onChange={(e) => set('isHighValue', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">🐷 Saves ₱100+ per person (high value)</span>
              </label>
            </div>

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
                {save.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirmation */}
      {confirmDelete !== null && (
        <Modal open onClose={() => setConfirmDelete(null)} title="Confirm delete" size="sm">
          <p className="mb-4 text-sm text-gray-600">
            Are you sure you want to delete this establishment? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
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
