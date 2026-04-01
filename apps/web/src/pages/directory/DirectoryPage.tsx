import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useDirectory,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  type DirectoryContact,
} from '../../api/directory.js';

const CATEGORY_SUGGESTIONS = ['Mechanic', 'Supplier', 'Emergency Contact', 'Partner'];

const EMPTY_FORM: Omit<DirectoryContact, 'id' | 'created_at'> = {
  name: '',
  number: null,
  email: null,
  relationship: null,
  gcash_number: null,
  category: null,
  bank_name: null,
  bank_account_number: null,
  address: null,
  notes: null,
};

function formToContact(f: typeof EMPTY_FORM): Omit<DirectoryContact, 'id' | 'created_at'> {
  return {
    name: f.name,
    number: f.number?.trim() || null,
    email: f.email?.trim() || null,
    relationship: f.relationship?.trim() || null,
    gcash_number: f.gcash_number?.trim() || null,
    category: f.category?.trim() || null,
    bank_name: f.bank_name?.trim() || null,
    bank_account_number: f.bank_account_number?.trim() || null,
    address: f.address?.trim() || null,
    notes: f.notes?.trim() || null,
  };
}

function contactToForm(c: DirectoryContact): typeof EMPTY_FORM {
  return {
    name: c.name,
    number: c.number,
    email: c.email,
    relationship: c.relationship,
    gcash_number: c.gcash_number,
    category: c.category,
    bank_name: c.bank_name,
    bank_account_number: c.bank_account_number,
    address: c.address,
    notes: c.notes,
  };
}

export default function DirectoryPage() {
  const [rawSearch, setRawSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(rawSearch), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawSearch]);

  const { data: contacts = [], isLoading } = useDirectory(debouncedSearch || undefined);
  const createMut = useCreateContact();
  const updateMut = useUpdateContact();
  const deleteMut = useDeleteContact();

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const c of contacts) {
      if (c.category) cats.add(c.category);
    }
    return ['All', ...Array.from(cats).sort()];
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    if (selectedCategory === 'All') return contacts;
    return contacts.filter((c) => c.category === selectedCategory);
  }, [contacts, selectedCategory]);

  const setField = useCallback(
    (key: keyof typeof EMPTY_FORM, value: string) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(contact: DirectoryContact) {
    setEditingId(contact.id);
    setForm(contactToForm(contact));
    setShowModal(true);
  }

  function handleSave() {
    if (!form.name.trim()) return;
    const body = formToContact(form);

    if (editingId !== null) {
      updateMut.mutate(
        { id: editingId, created_at: '', ...body },
        { onSuccess: () => setShowModal(false) },
      );
    } else {
      createMut.mutate(body, { onSuccess: () => setShowModal(false) });
    }
  }

  function handleDelete(id: number) {
    deleteMut.mutate(id, { onSuccess: () => setDeleteConfirmId(null) });
  }

  const isSaving = createMut.isPending || updateMut.isPending;
  const saveError = createMut.error ?? updateMut.error;
  const deleteError = deleteMut.error;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Directory</h1>
        <button
          onClick={openAdd}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          + Add Contact
        </button>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          placeholder="Search name, phone, email, category..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      {/* Category filter tabs */}
      {categories.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Contact list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-sm">
          <p className="text-gray-500">
            {debouncedSearch || selectedCategory !== 'All'
              ? 'No contacts match your search.'
              : 'No contacts yet. Add your first contact.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContacts.map((contact) => (
            <div
              key={contact.id}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* Name + category badge */}
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-gray-900">{contact.name}</span>
                    {contact.category && (
                      <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                        {contact.category}
                      </span>
                    )}
                    {contact.relationship && (
                      <span className="text-sm text-gray-500">({contact.relationship})</span>
                    )}
                  </div>

                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    {contact.number && (
                      <p>
                        <span className="font-medium text-gray-700">Phone:</span> {contact.number}
                      </p>
                    )}
                    {contact.email && (
                      <p>
                        <span className="font-medium text-gray-700">Email:</span> {contact.email}
                      </p>
                    )}
                    {contact.gcash_number && (
                      <p>
                        <span className="font-medium text-gray-700">GCash:</span>{' '}
                        {contact.gcash_number}
                      </p>
                    )}
                    {(contact.bank_name || contact.bank_account_number) && (
                      <p>
                        <span className="font-medium text-gray-700">Bank:</span>{' '}
                        {[contact.bank_name, contact.bank_account_number]
                          .filter(Boolean)
                          .join(' — ')}
                      </p>
                    )}
                    {contact.address && (
                      <p>
                        <span className="font-medium text-gray-700">Address:</span>{' '}
                        {contact.address}
                      </p>
                    )}
                    {contact.notes && (
                      <p className="truncate">
                        <span className="font-medium text-gray-700">Notes:</span> {contact.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => openEdit(contact)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(contact.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId !== null ? 'Edit Contact' : 'Add Contact'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="Full name"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                  <input
                    type="text"
                    list="category-suggestions"
                    value={form.category ?? ''}
                    onChange={(e) => setField('category', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="e.g. Mechanic, Supplier…"
                  />
                  <datalist id="category-suggestions">
                    {CATEGORY_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="text"
                    value={form.number ?? ''}
                    onChange={(e) => setField('number', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="Phone number"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => setField('email', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="email@example.com"
                  />
                </div>

                {/* Relationship */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Relationship / Role
                  </label>
                  <input
                    type="text"
                    value={form.relationship ?? ''}
                    onChange={(e) => setField('relationship', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="e.g. Owner, Parts Manager"
                  />
                </div>

                {/* GCash */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    GCash Number
                  </label>
                  <input
                    type="text"
                    value={form.gcash_number ?? ''}
                    onChange={(e) => setField('gcash_number', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="GCash number"
                  />
                </div>

                {/* Bank name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Bank Name</label>
                  <input
                    type="text"
                    value={form.bank_name ?? ''}
                    onChange={(e) => setField('bank_name', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="e.g. BPI, BDO"
                  />
                </div>

                {/* Bank account number */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Bank Account Number
                  </label>
                  <input
                    type="text"
                    value={form.bank_account_number ?? ''}
                    onChange={(e) => setField('bank_account_number', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="Account number"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
                  <textarea
                    value={form.address ?? ''}
                    onChange={(e) => setField('address', e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="Address"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={form.notes ?? ''}
                    onChange={(e) => setField('notes', e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="Any additional notes"
                  />
                </div>

                {saveError && (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    {saveError instanceof Error ? saveError.message : 'An error occurred.'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || isSaving}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-gray-900">Delete Contact?</h3>
            <p className="mb-6 text-sm text-gray-500">
              This action cannot be undone.
            </p>
            {deleteError && (
              <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {deleteError instanceof Error ? deleteError.message : 'An error occurred.'}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleteMut.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
