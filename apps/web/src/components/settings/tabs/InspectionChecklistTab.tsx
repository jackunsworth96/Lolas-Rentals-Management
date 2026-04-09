import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.js';
import {
  useInspectionItemsAll,
  useCreateInspectionItem,
  useUpdateInspectionItem,
  type InspectionItem,
  type InspectionItemVehicleType,
} from '../../../api/inspections.js';

const ITEM_TYPE_OPTIONS: { value: InspectionItem['itemType']; label: string }[] = [
  { value: 'accepted_issue', label: 'Accepted / Issue Noted' },
  { value: 'accepted_issue_qty', label: 'Accepted / Issue Noted + QTY' },
  { value: 'accepted_issue_na', label: 'Accepted / Issue Noted / N/A' },
  { value: 'accepted_issue_declined', label: 'Accepted / Issue Noted / Declined' },
];

const APPLIES_TO_OPTIONS: { value: InspectionItemVehicleType; label: string }[] = [
  { value: 'all', label: 'All vehicles' },
  { value: 'scooter', label: 'Scooter only' },
  { value: 'tuktuk', label: 'TukTuk only' },
];

type TableFilter = 'every' | 'scooter' | 'tuktuk';

function typeBadge(itemType: InspectionItem['itemType']) {
  const styles: Record<InspectionItem['itemType'], string> = {
    accepted_issue: 'bg-blue-50 text-blue-800 border-blue-200',
    accepted_issue_qty: 'bg-amber-50 text-amber-900 border-amber-200',
    accepted_issue_na: 'bg-violet-50 text-violet-800 border-violet-200',
    accepted_issue_declined: 'bg-rose-50 text-rose-800 border-rose-200',
  };
  const labels: Record<InspectionItem['itemType'], string> = {
    accepted_issue: 'Accepted / Issue',
    accepted_issue_qty: '+QTY',
    accepted_issue_na: '+N/A',
    accepted_issue_declined: '+Declined',
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${styles[itemType]}`}
    >
      {labels[itemType]}
    </span>
  );
}

function vehicleTypeBadge(vehicleType: InspectionItemVehicleType | undefined) {
  const vt = vehicleType ?? 'all';
  const config: Record<
    InspectionItemVehicleType,
    { className: string; label: string }
  > = {
    all: {
      className: 'border-teal-200 bg-teal-50 text-teal-800',
      label: 'All vehicles',
    },
    scooter: {
      className: 'border-blue-200 bg-blue-50 text-blue-800',
      label: 'Scooter',
    },
    tuktuk: {
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      label: 'TukTuk',
    },
  };
  const { className, label } = config[vt];
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function DragHandle() {
  return (
    <span
      className="inline-flex flex-col gap-0.5 text-gray-400 select-none"
      aria-hidden
    >
      <span className="flex gap-0.5">
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
      </span>
      <span className="flex gap-0.5">
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
      </span>
      <span className="flex gap-0.5">
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
      </span>
    </span>
  );
}

/** Reorder rows visible under the current filter; merge back into full list and assign contiguous sort_order. */
function reorderInspectionItems(
  items: InspectionItem[],
  filter: TableFilter,
  draggedId: string,
  targetId: string,
): { id: string; sortOrder: number }[] | null {
  if (draggedId === targetId) return null;
  const matches = (i: InspectionItem) => itemMatchesTableFilter(i, filter);
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const filtered = sorted.filter(matches);
  const fromIdx = filtered.findIndex((i) => i.id === draggedId);
  const toIdx = filtered.findIndex((i) => i.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return null;
  const reordered = [...filtered];
  const [removed] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, removed);
  let rq = 0;
  const newFull = sorted.map((item) => (matches(item) ? reordered[rq++]! : item));
  return newFull.map((item, index) => ({ id: item.id, sortOrder: index }));
}

function itemMatchesTableFilter(item: InspectionItem, filter: TableFilter): boolean {
  const vt = item.vehicleType ?? 'all';
  if (filter === 'every') return true;
  if (filter === 'scooter') return vt === 'all' || vt === 'scooter';
  return vt === 'all' || vt === 'tuktuk';
}

export function InspectionChecklistTab() {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useInspectionItemsAll();
  const createItem = useCreateInspectionItem();
  const updateItem = useUpdateInspectionItem();

  const [addingNew, setAddingNew] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<TableFilter>('every');

  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState<InspectionItem['itemType']>('accepted_issue');
  const [addVehicleType, setAddVehicleType] = useState<InspectionItemVehicleType>('all');

  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<InspectionItem['itemType']>('accepted_issue');
  const [editVehicleType, setEditVehicleType] = useState<InspectionItemVehicleType>('all');

  const nextSortOrder = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.max(...items.map((i) => i.sortOrder)) + 1;
  }, [items]);

  const filteredItems = useMemo(
    () => items.filter((item) => itemMatchesTableFilter(item, tableFilter)),
    [items, tableFilter],
  );

  const sortedFilteredItems = useMemo(
    () => [...filteredItems].sort((a, b) => a.sortOrder - b.sortOrder),
    [filteredItems],
  );

  async function persistInspectionOrder(draggedId: string, targetId: string) {
    if (reordering || editingId) return;
    const next = reorderInspectionItems(items, tableFilter, draggedId, targetId);
    if (!next) return;
    const changed = next.filter((u) => {
      const orig = items.find((i) => i.id === u.id);
      return orig != null && orig.sortOrder !== u.sortOrder;
    });
    if (changed.length === 0) return;
    setReorderError(null);
    setReordering(true);
    try {
      await Promise.all(
        changed.map((u) => api.put(`/inspections/items/${u.id}`, { sortOrder: u.sortOrder })),
      );
      await queryClient.invalidateQueries({ queryKey: ['inspection-items', 'all'] });
      await queryClient.invalidateQueries({ queryKey: ['inspection-items'] });
    } catch (e) {
      setReorderError(e instanceof Error ? e.message : 'Could not save order');
    } finally {
      setReordering(false);
    }
  }

  function resetAddForm() {
    setAddName('');
    setAddType('accepted_issue');
    setAddVehicleType('all');
    setAddingNew(false);
  }

  function startEdit(item: InspectionItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditType(item.itemType);
    setEditVehicleType(item.vehicleType ?? 'all');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    createItem.mutate(
      {
        name,
        itemType: addType,
        sortOrder: nextSortOrder,
        storeId: null,
        vehicleType: addVehicleType,
      },
      { onSuccess: () => resetAddForm() },
    );
  }

  function handleEditSubmit(e: React.FormEvent, id: string) {
    e.preventDefault();
    const name = editName.trim();
    if (!name) return;
    updateItem.mutate(
      { id, body: { name, itemType: editType, vehicleType: editVehicleType } },
      { onSuccess: () => cancelEdit() },
    );
  }

  function toggleActive(item: InspectionItem) {
    updateItem.mutate({ id: item.id, body: { isActive: !item.isActive } });
  }

  const err = (createItem.error ?? updateItem.error) as Error | null;
  const canDragReorder = editingId == null && !reordering && sortedFilteredItems.length > 1;

  if (isLoading) {
    return <p className="py-4 text-sm text-gray-500">Loading inspection checklist...</p>;
  }

  const filterButtons: { key: TableFilter; label: string }[] = [
    { key: 'every', label: 'All' },
    { key: 'scooter', label: 'Scooter' },
    { key: 'tuktuk', label: 'TukTuk' },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Inspection Checklist</h3>
        <button
          type="button"
          onClick={() => {
            setAddingNew(true);
            setEditingId(null);
          }}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add new item
        </button>
      </div>

      <p className="mb-4 text-sm text-gray-600">
        Manage the pre-ride inspection lines shown to staff during vehicle handover. Global items apply to all
        stores. Drag the grip (⋮⋮) on a row to change order; it saves automatically and matches the handover
        inspection form. When a filter is active, only those rows are reordered relative to each other (global
        positions update accordingly).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Filter list:</span>
        {filterButtons.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTableFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tableFilter === key
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(err || reorderError) && (
        <p className="mb-3 text-sm text-red-600">{reorderError ?? err?.message}</p>
      )}

      {addingNew && (
        <form
          onSubmit={handleAddSubmit}
          className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
        >
          <div className="text-sm font-medium text-gray-700">New checklist item</div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              required
              className="mt-1 block w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g. Front Tyre"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Type</span>
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as InspectionItem['itemType'])}
              className="mt-1 block w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ITEM_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Applies to</span>
            <select
              value={addVehicleType}
              onChange={(e) => setAddVehicleType(e.target.value as InspectionItemVehicleType)}
              className="mt-1 block w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {APPLIES_TO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createItem.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createItem.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={resetAddForm}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {items.length === 0 && !addingNew ? (
        <p className="py-4 text-center text-sm text-gray-500">No checklist items yet. Add one to get started.</p>
      ) : items.length > 0 && filteredItems.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No items match this filter.</p>
      ) : items.length > 0 ? (
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="w-10 pb-2 pr-2 font-medium" aria-label="Reorder" />
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pr-4 font-medium">Active</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredItems.map((item) =>
              editingId === item.id ? (
                <tr key={item.id} className="border-b bg-gray-50">
                  <td colSpan={5} className="py-3 pr-4">
                    <form onSubmit={(e) => handleEditSubmit(e, item.id)} className="space-y-3">
                      <div className="text-sm font-medium text-gray-700">Edit item</div>
                      <label className="block max-w-md">
                        <span className="text-sm font-medium text-gray-700">Name</span>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </label>
                      <label className="block max-w-md">
                        <span className="text-sm font-medium text-gray-700">Type</span>
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value as InspectionItem['itemType'])}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {ITEM_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block max-w-md">
                        <span className="text-sm font-medium text-gray-700">Applies to</span>
                        <select
                          value={editVehicleType}
                          onChange={(e) => setEditVehicleType(e.target.value as InspectionItemVehicleType)}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {APPLIES_TO_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={updateItem.isPending}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {updateItem.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr
                  key={item.id}
                  className={`border-b hover:bg-gray-50 ${reordering ? 'opacity-60' : ''}`}
                  onDragOver={(e) => {
                    if (!canDragReorder) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!canDragReorder) return;
                    const draggedId = e.dataTransfer.getData('text/plain');
                    if (draggedId) void persistInspectionOrder(draggedId, item.id);
                  }}
                >
                  <td
                    className={`py-2 pr-2 align-middle ${canDragReorder ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-50'}`}
                    draggable={canDragReorder}
                    title={canDragReorder ? 'Drag to reorder' : undefined}
                    onDragStart={(e) => {
                      if (!canDragReorder) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData('text/plain', item.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <DragHandle />
                  </td>
                  <td className="py-2 pr-4 align-middle">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{item.name}</span>
                      {vehicleTypeBadge(item.vehicleType)}
                    </div>
                  </td>
                  <td className="py-2 pr-4 align-middle">{typeBadge(item.itemType)}</td>
                  <td className="py-2 pr-4 align-middle">
                    <button
                      type="button"
                      onClick={() => toggleActive(item)}
                      disabled={updateItem.isPending || reordering}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        item.isActive
                          ? 'bg-green-100 text-green-800 ring-1 ring-inset ring-green-600/20'
                          : 'bg-gray-200 text-gray-600 ring-1 ring-inset ring-gray-400/30'
                      }`}
                    >
                      {item.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="py-2 align-middle">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingNew(false);
                        startEdit(item);
                      }}
                      disabled={reordering}
                      className="text-blue-600 hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
