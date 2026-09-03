import { useMemo, useState } from 'react';
import {
  useAccommodationDirectory,
  useDeleteAccommodationDirectoryEntry,
  useSaveAccommodationDirectoryEntry,
} from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Place name', type: 'text', required: true },
  { key: 'aliases', label: 'Aliases, separated by commas', type: 'text', placeholder: 'Mao Mao, Mao Mao Surf Resort' },
  { key: 'area', label: 'Service area', type: 'text', required: true, placeholder: 'General Luna' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'deliveryFee', label: 'Delivery fee', type: 'number' },
  { key: 'collectionFee', label: 'Collection fee', type: 'number' },
  { key: 'isPartner', label: 'Partner with free delivery and collection', type: 'boolean' },
  { key: 'deliveryAvailable', label: 'Delivery available', type: 'boolean' },
  { key: 'isActive', label: 'Active', type: 'boolean' },
];

const COLUMNS = [
  { key: 'name', header: 'Place' },
  { key: 'area', header: 'Area' },
  {
    key: 'deliveryFee',
    header: 'Delivery',
    render: (row: Record<string, unknown>) => row.deliveryAvailable === false
      ? 'Not available'
      : row.isPartner === true
        ? 'Free partner'
        : `PHP ${Number(row.deliveryFee ?? 0).toLocaleString()}`,
  },
  { key: 'isActive', header: 'Active', render: (row: Record<string, unknown>) => row.isActive === false ? 'No' : 'Yes' },
];

export function AccommodationDirectoryTab() {
  const [search, setSearch] = useState('');
  const { data = [], isLoading } = useAccommodationDirectory();
  const save = useSaveAccommodationDirectoryEntry();
  const remove = useDeleteAccommodationDirectoryEntry();

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return data;
    return data.filter((entry) => [entry.name, entry.area, entry.address, ...entry.aliases]
      .some((value) => value?.toLocaleLowerCase().includes(needle)));
  }, [data, search]);

  function handleSave(row: Record<string, unknown>) {
    const deliveryAvailable = row.deliveryAvailable !== false;
    save.mutate({
      ...row,
      aliases: String(row.aliases ?? '').split(',').map((alias) => alias.trim()).filter(Boolean),
      address: String(row.address ?? '').trim() || null,
      deliveryFee: deliveryAvailable ? Number(row.deliveryFee ?? 0) : null,
      collectionFee: deliveryAvailable ? Number(row.collectionFee ?? 0) : null,
    });
  }

  return (
    <div>
      <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
        <p className="text-sm font-medium text-gray-900">Accommodation and business lookup</p>
        <p className="mt-1 text-xs text-gray-600">
          LoloDesk searches the place name and aliases, then returns its service area and fees.
        </p>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search accommodation directory"
          placeholder="Search places, aliases, or areas"
          className="mt-3 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <p className="mt-2 text-xs text-gray-500">Showing {filtered.length} of {data.length} places</p>
      </div>

      <div className="overflow-x-auto">
        <ConfigSection
          title="Directory places"
          data={filtered as unknown as Record<string, unknown>[]}
          isLoading={isLoading}
          columns={COLUMNS}
          fields={FIELDS}
          transformEditingToForm={(row) => ({ ...row, aliases: (row.aliases as string[]).join(', ') })}
          onSave={handleSave}
          onDelete={(id) => remove.mutate(Number(id))}
          isSaving={save.isPending}
          saveError={save.error as Error | null}
          validate={(row) => !String(row.name ?? '').trim() || !String(row.area ?? '').trim()
            ? 'Place name and service area are required.'
            : null}
        />
      </div>
    </div>
  );
}
