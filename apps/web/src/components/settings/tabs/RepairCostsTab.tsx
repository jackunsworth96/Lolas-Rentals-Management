import { useMemo, useState } from 'react';
import {
  useRepairCosts,
  useSaveRepairCost,
  useDeleteRepairCost,
  type RepairCostRow,
} from '../../../api/config.js';

const VEHICLES: { key: 'honda_beat' | 'tuk_tuk'; label: string }[] = [
  { key: 'honda_beat', label: 'Scooter (Honda Beat)' },
  { key: 'tuk_tuk', label: 'TukTuk' },
];

type FormState = {
  id?: string;
  vehicleType: 'honda_beat' | 'tuk_tuk';
  item: string;
  costPhp: string;
  sortOrder: string;
};

const emptyForm = (vehicleType: 'honda_beat' | 'tuk_tuk'): FormState => ({
  vehicleType,
  item: '',
  costPhp: '',
  sortOrder: '',
});

export function RepairCostsTab() {
  const { data = [], isLoading } = useRepairCosts();
  const save = useSaveRepairCost();
  const del = useDeleteRepairCost();

  const [modal, setModal] = useState<{ open: boolean; form: FormState }>({
    open: false,
    form: emptyForm('honda_beat'),
  });

  const byVehicle = useMemo(() => {
    const map: Record<string, RepairCostRow[]> = { honda_beat: [], tuk_tuk: [] };
    for (const row of data) {
      if (row.vehicleType === 'honda_beat' || row.vehicleType === 'tuk_tuk') {
        map[row.vehicleType].push(row);
      }
    }
    return map;
  }, [data]);

  function openAdd(vehicleType: 'honda_beat' | 'tuk_tuk') {
    setModal({ open: true, form: emptyForm(vehicleType) });
  }

  function openEdit(row: RepairCostRow) {
    setModal({
      open: true,
      form: {
        id: row.id,
        vehicleType: row.vehicleType as 'honda_beat' | 'tuk_tuk',
        item: row.item,
        costPhp: String(row.costPhp),
        sortOrder: String(row.sortOrder),
      },
    });
  }

  function closeModal() {
    setModal((m) => ({ ...m, open: false }));
  }

  async function submitForm() {
    const { form } = modal;
    const cost = parseFloat(form.costPhp);
    const sortOrder = form.sortOrder.trim() === '' ? 0 : parseInt(form.sortOrder, 10);
    if (!form.item.trim() || Number.isNaN(cost) || cost < 0 || Number.isNaN(sortOrder)) return;
    await save.mutateAsync({
      id: form.id,
      vehicleType: form.vehicleType,
      item: form.item.trim(),
      costPhp: cost,
      sortOrder,
    });
    closeModal();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Repair Costs</h2>
        <p className="mt-1 text-sm text-gray-500">
          Prices shown on the public Repairs page. Vehicle types: <code className="rounded bg-gray-100 px-1">honda_beat</code>,{' '}
          <code className="rounded bg-gray-100 px-1">tuk_tuk</code>.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {VEHICLES.map((v) => (
            <section key={v.key} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
              <h3 className="mb-3 text-base font-semibold text-gray-900">{v.label}</h3>
              <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-3 py-2 font-medium text-gray-700">Item</th>
                      <th className="px-3 py-2 font-medium text-gray-700">Cost (₱)</th>
                      <th className="px-3 py-2 font-medium text-gray-700">Sort</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {byVehicle[v.key].map((row) => (
                      <tr key={row.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-2">{row.item}</td>
                        <td className="px-3 py-2">{row.costPhp.toLocaleString('en-PH')}</td>
                        <td className="px-3 py-2">{row.sortOrder}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ml-2 text-red-600 hover:underline"
                            onClick={() => {
                              if (window.confirm('Delete this row?')) del.mutate(row.id);
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                onClick={() => openAdd(v.key)}
              >
                Add item
              </button>
            </section>
          ))}
        </div>
      )}

      {(save.error || del.error) && (
        <p className="text-sm text-red-600">{(save.error ?? del.error)?.message}</p>
      )}

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">{modal.form.id ? 'Edit item' : 'Add item'}</h3>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Item name</span>
                <input
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={modal.form.item}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, item: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Cost (₱)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={modal.form.costPhp}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, costPhp: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Sort order (optional)</span>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={modal.form.sortOrder}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, sortOrder: e.target.value } }))}
                  placeholder="0"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={save.isPending}
                onClick={() => void submitForm()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
