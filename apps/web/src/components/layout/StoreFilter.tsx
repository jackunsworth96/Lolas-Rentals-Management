import { useStores } from '../../api/config.js';
import { useUIStore } from '../../stores/ui-store.js';

export function StoreFilter() {
  const { data: stores } = useStores() as { data: Array<{ id: string; name: string }> | undefined };
  const selectedStoreId = useUIStore((s) => s.selectedStoreId);
  const setSelectedStore = useUIStore((s) => s.setSelectedStore);

  return (
    <select
      value={selectedStoreId ?? ''}
      onChange={(e) => setSelectedStore(e.target.value)}
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">All Stores</option>
      {(stores ?? []).map((store) => (
        <option key={store.id} value={store.id}>{store.name}</option>
      ))}
    </select>
  );
}
