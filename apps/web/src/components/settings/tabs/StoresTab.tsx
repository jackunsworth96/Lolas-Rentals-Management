import { useState } from 'react';
import {
  useStores,
  useSaveStore,
  useDeleteStore,
  usePatchStore,
  useRegenerateBookingToken,
} from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

interface StoreRow {
  id: string;
  name: string;
  location: string | null;
  defaultFloatAmount: number;
  isActive: boolean;
  bookingToken: string;
  publicBookingEnabled: boolean;
}

function rowFromApi(r: Record<string, unknown>): StoreRow {
  const loc = r.location;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    location: loc == null || loc === '' ? null : String(loc),
    defaultFloatAmount: Number(r.defaultFloatAmount ?? r.default_float_amount ?? 3000),
    isActive: r.isActive !== false && r.is_active !== false,
    bookingToken: String(r.bookingToken ?? r.booking_token ?? ''),
    publicBookingEnabled: Boolean(r.publicBookingEnabled ?? r.public_booking_enabled),
  };
}

function BookingLinkPanel({ stores }: { stores: StoreRow[] }) {
  const patch = usePatchStore();
  const regen = useRegenerateBookingToken();
  const [copied, setCopied] = useState<string | null>(null);

  const baseUrl = window.location.origin;

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${baseUrl}/book/transfer/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!stores.length) return null;

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Public Transfer Booking Links</h3>
      <div className="space-y-3">
        {stores.map((store) => (
          <div key={store.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{store.name}</p>
                <p className="text-xs text-gray-500">{store.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Public booking</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={store.publicBookingEnabled}
                  disabled={patch.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!store.name.trim()) return;
                    patch.mutate({
                      id: store.id,
                      name: store.name.trim(),
                      location: store.location,
                      isActive: store.isActive,
                      publicBookingEnabled: !store.publicBookingEnabled,
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                    store.publicBookingEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                      store.publicBookingEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {store.publicBookingEnabled && store.bookingToken && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`${baseUrl}/book/transfer/${store.bookingToken}`}
                    className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 select-all"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={() => copyLink(store.bookingToken)}
                    className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    {copied === store.bookingToken ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Regenerate this booking link? The old link will stop working immediately.')) {
                      regen.mutate(store.id);
                    }
                  }}
                  className="text-xs text-red-600 hover:text-red-700 hover:underline"
                >
                  Regenerate link
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {patch.isError && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {(patch.error as Error).message}
        </p>
      )}
    </div>
  );
}

const columns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'location', header: 'Location' },
  { key: 'defaultFloatAmount', header: 'Default Float', render: (r: Record<string, unknown>) => `₱${Number(r.defaultFloatAmount ?? r.default_float_amount ?? 3000).toLocaleString()}` },
  { key: 'publicBookingEnabled', header: 'Public Booking', render: (r: Record<string, unknown>) => r.publicBookingEnabled ? 'On' : 'Off' },
  { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
];

const fields: FieldDef[] = [
  { key: 'id', label: 'Store ID', type: 'text', required: true, readOnlyOnEdit: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'defaultFloatAmount', label: 'Default Float Amount (₱)', type: 'number' },
  { key: 'isActive', label: 'Active', type: 'boolean' },
];

export function StoresTab() {
  const { data, isLoading } = useStores();
  const save = useSaveStore();
  const del = useDeleteStore();

  const storeList = ((data ?? []) as Record<string, unknown>[]).map(rowFromApi);

  return (
    <>
      <BookingLinkPanel stores={storeList} />
      <ConfigSection
        title="Stores"
        data={storeList as unknown as Record<string, unknown>[]}
        isLoading={isLoading}
        columns={columns}
        fields={fields}
        onSave={(row) => save.mutate(row)}
        onDelete={(id) => del.mutate(id)}
        isSaving={save.isPending}
        saveError={save.error as Error | null}
      />
    </>
  );
}
