import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/ui-store.js';
import {
  useMerchandise,
  useCreateMerchandiseItem,
  useUpdateMerchandiseItem,
  useDeleteMerchandiseItem,
  type MerchandiseItem,
} from '../../api/merchandise.js';
import { formatCurrency } from '../../utils/currency.js';
import { Button } from '../../components/common/Button.js';

const EMPTY_FORM = {
  sku: '',
  itemName: '',
  sizeVariant: '',
  costPrice: '',
  salePrice: '',
  startingStock: '',
  currentStock: '',
  lowStockThreshold: '5',
};

type SortField = 'itemName' | 'sku' | 'currentStock' | 'salePrice' | 'costPrice' | 'inventoryValue';
type SortDir = 'asc' | 'desc';

export default function MerchandisePage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useMerchandise(storeId);
  const createMut = useCreateMerchandiseItem();
  const updateMut = useUpdateMerchandiseItem();
  const deleteMut = useDeleteMerchandiseItem();

  const [showModal, setShowModal] = useState(false);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [sortField, setSortField] = useState<SortField>('itemName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const setField = useCallback(
    (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const filteredItems = useMemo(() => {
    let list = showInactive ? items : items.filter((i) => i.isActive);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.itemName.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          (i.sizeVariant ?? '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'inventoryValue') {
        cmp = a.costPrice * a.currentStock - b.costPrice * b.currentStock;
      } else if (sortField === 'itemName' || sortField === 'sku') {
        cmp = (a[sortField] ?? '').localeCompare(b[sortField] ?? '');
      } else {
        cmp = (a[sortField] ?? 0) - (b[sortField] ?? 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, search, showInactive, sortField, sortDir]);

  const totalInventoryValue = useMemo(
    () => items.filter((i) => i.isActive).reduce((sum, i) => sum + i.costPrice * i.currentStock, 0),
    [items],
  );

  const totalRetailValue = useMemo(
    () => items.filter((i) => i.isActive).reduce((sum, i) => sum + i.salePrice * i.currentStock, 0),
    [items],
  );

  const lowStockCount = useMemo(
    () => items.filter((i) => i.isActive && i.currentStock <= i.lowStockThreshold).length,
    [items],
  );

  const totalItems = useMemo(
    () => items.filter((i) => i.isActive).length,
    [items],
  );

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  function openAdd() {
    setEditingSku(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(item: MerchandiseItem) {
    setEditingSku(item.sku);
    setForm({
      sku: item.sku,
      itemName: item.itemName,
      sizeVariant: item.sizeVariant ?? '',
      costPrice: String(item.costPrice),
      salePrice: String(item.salePrice),
      startingStock: String(item.startingStock),
      currentStock: String(item.currentStock),
      lowStockThreshold: String(item.lowStockThreshold),
    });
    setShowModal(true);
  }

  function handleSave() {
    const costPrice = parseFloat(form.costPrice);
    const salePrice = parseFloat(form.salePrice);
    if (!form.sku.trim() || !form.itemName.trim() || isNaN(costPrice) || isNaN(salePrice)) return;

    if (editingSku) {
      updateMut.mutate(
        {
          sku: editingSku,
          itemName: form.itemName,
          sizeVariant: form.sizeVariant || null,
          costPrice,
          salePrice,
          lowStockThreshold: parseInt(form.lowStockThreshold) || 5,
        },
        { onSuccess: () => setShowModal(false) },
      );
    } else {
      const startingStock = parseInt(form.startingStock) || 0;
      createMut.mutate(
        {
          sku: form.sku,
          itemName: form.itemName,
          sizeVariant: form.sizeVariant || null,
          costPrice,
          salePrice,
          startingStock,
          currentStock: startingStock,
          lowStockThreshold: parseInt(form.lowStockThreshold) || 5,
          storeId,
        },
        { onSuccess: () => setShowModal(false) },
      );
    }
  }

  function handleDelete(sku: string) {
    deleteMut.mutate(sku, {
      onSuccess: () => setShowDeleteConfirm(null),
    });
  }

  if (!storeId) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Merchandise Inventory</h1>
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <p className="text-gray-500">Select a store to view inventory</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Merchandise Inventory</h1>
          <button
            onClick={() => navigate('/misc-sales')}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Back to Misc Sales
          </button>
        </div>
        <Button onClick={openAdd}>Add Item</Button>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Inventory Value (Cost)</p>
          <p className="mt-1 text-xl font-bold text-indigo-700">{formatCurrency(totalInventoryValue)}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">Should match Inventory Asset account</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Retail Value</p>
          <p className="mt-1 text-xl font-bold text-green-700">{formatCurrency(totalRetailValue)}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">If sold at listed prices</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active Items</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{totalItems}</p>
        </div>
        <div className={`rounded-lg border bg-white p-4 ${lowStockCount > 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Low Stock</p>
          <p className={`mt-1 text-xl font-bold ${lowStockCount > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
            {lowStockCount}
          </p>
          {lowStockCount > 0 && (
            <p className="mt-0.5 text-[10px] text-amber-600">Items at or below threshold</p>
          )}
        </div>
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, SKU, or variant..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show inactive
        </label>
      </div>

      {/* Items table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">
            {items.length === 0 ? 'No merchandise items yet. Click "Add Item" to get started.' : 'No items match your search.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="cursor-pointer px-4 py-3 font-medium text-gray-600" onClick={() => toggleSort('sku')}>
                  SKU{sortIndicator('sku')}
                </th>
                <th className="cursor-pointer px-4 py-3 font-medium text-gray-600" onClick={() => toggleSort('itemName')}>
                  Item{sortIndicator('itemName')}
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">Size/Variant</th>
                <th className="cursor-pointer px-4 py-3 text-right font-medium text-gray-600" onClick={() => toggleSort('costPrice')}>
                  Cost{sortIndicator('costPrice')}
                </th>
                <th className="cursor-pointer px-4 py-3 text-right font-medium text-gray-600" onClick={() => toggleSort('salePrice')}>
                  Sale Price{sortIndicator('salePrice')}
                </th>
                <th className="cursor-pointer px-4 py-3 text-right font-medium text-gray-600" onClick={() => toggleSort('currentStock')}>
                  Stock{sortIndicator('currentStock')}
                </th>
                <th className="cursor-pointer px-4 py-3 text-right font-medium text-gray-600" onClick={() => toggleSort('inventoryValue')}>
                  Value{sortIndicator('inventoryValue')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isLow = item.currentStock <= item.lowStockThreshold;
                const invValue = item.costPrice * item.currentStock;
                return (
                  <tr
                    key={item.sku}
                    className={`border-b border-gray-50 last:border-b-0 ${!item.isActive ? 'opacity-50' : ''} ${isLow && item.isActive ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.sku}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{item.itemName}</span>
                      {!item.isActive && (
                        <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.sizeVariant ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.costPrice)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(item.salePrice)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${isLow && item.isActive ? 'text-amber-700' : 'text-gray-900'}`}>
                        {item.currentStock}
                      </span>
                      {isLow && item.isActive && (
                        <span className="ml-1 text-[10px] text-amber-600">Low</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(invValue)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(item.sku)}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-medium">
                <td colSpan={5} className="px-4 py-3 text-gray-600">
                  Total ({filteredItems.length} items)
                </td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {filteredItems.reduce((s, i) => s + i.currentStock, 0)}
                </td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {formatCurrency(filteredItems.reduce((s, i) => s + i.costPrice * i.currentStock, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="mx-auto w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              {editingSku ? 'Edit Item' : 'Add New Item'}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">SKU *</label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setField('sku', e.target.value)}
                  disabled={!!editingSku}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                  placeholder="e.g. TEE-BLK-M"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Item Name *</label>
                <input
                  type="text"
                  value={form.itemName}
                  onChange={(e) => setField('itemName', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. Lola's T-Shirt"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Size / Variant</label>
                <input
                  type="text"
                  value={form.sizeVariant}
                  onChange={(e) => setField('sizeVariant', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. Medium, Black"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cost Price *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.costPrice}
                  onChange={(e) => setField('costPrice', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Sale Price *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.salePrice}
                  onChange={(e) => setField('salePrice', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>
              {!editingSku && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Starting Stock</label>
                  <input
                    type="number"
                    min={0}
                    value={form.startingStock}
                    onChange={(e) => setField('startingStock', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="0"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Low Stock Threshold</label>
                <input
                  type="number"
                  min={0}
                  value={form.lowStockThreshold}
                  onChange={(e) => setField('lowStockThreshold', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="5"
                />
              </div>
            </div>
            {(createMut.isError || updateMut.isError) && (
              <p className="mt-3 text-sm text-red-600">
                {(createMut.error as Error)?.message ?? (updateMut.error as Error)?.message ?? 'Save failed'}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                loading={createMut.isPending || updateMut.isPending}
                disabled={!form.sku.trim() || !form.itemName.trim()}
              >
                {editingSku ? 'Save Changes' : 'Add Item'}
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <ModalOverlay onClose={() => setShowDeleteConfirm(null)}>
          <div className="mx-auto w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">Delete Item</h2>
            <p className="mb-4 text-sm text-gray-600">
              Are you sure you want to delete <span className="font-medium">{showDeleteConfirm}</span>?
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => handleDelete(showDeleteConfirm)}
                loading={deleteMut.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-h-[90vh] overflow-y-auto px-4">{children}</div>
    </div>
  );
}
