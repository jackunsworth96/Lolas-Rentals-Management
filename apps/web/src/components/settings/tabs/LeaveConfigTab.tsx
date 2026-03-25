import { useState, useEffect } from 'react';
import { useLeaveConfig, useSaveLeaveConfig, useStores } from '../../../api/config.js';

export function LeaveConfigTab() {
  const { data: config, isLoading } = useLeaveConfig();
  const { data: stores } = useStores();
  const save = useSaveLeaveConfig();

  const [storeId, setStoreId] = useState('');
  const [resetMonth, setResetMonth] = useState(1);
  const [resetDay, setResetDay] = useState(1);
  const [holidayAllowance, setHolidayAllowance] = useState(5);
  const [sickAllowance, setSickAllowance] = useState(5);

  useEffect(() => {
    if (config) {
      const c = config as Record<string, unknown>;
      setStoreId(String(c.storeId ?? ''));
      setResetMonth(Number(c.resetMonth ?? 1));
      setResetDay(Number(c.resetDay ?? 1));
      setHolidayAllowance(Number(c.defaultHolidayAllowance ?? 5));
      setSickAllowance(Number(c.defaultSickAllowance ?? 5));
    }
  }, [config]);

  const storeOpts = ((stores ?? []) as Array<{ id: string; name: string }>);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({ storeId, resetMonth, resetDay, defaultHolidayAllowance: holidayAllowance, defaultSickAllowance: sickAllowance });
  }

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-gray-900">Leave Configuration</h3>
      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Store</span>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Select store</option>
            {storeOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reset month (1-12)</span>
            <input type="number" min={1} max={12} value={resetMonth} onChange={(e) => setResetMonth(Number(e.target.value))} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reset day (1-31)</span>
            <input type="number" min={1} max={31} value={resetDay} onChange={(e) => setResetDay(Number(e.target.value))} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Annual holiday days</span>
            <input type="number" min={0} value={holidayAllowance} onChange={(e) => setHolidayAllowance(Number(e.target.value))} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Annual sick days</span>
            <input type="number" min={0} value={sickAllowance} onChange={(e) => setSickAllowance(Number(e.target.value))} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </div>
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <button type="submit" disabled={save.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {save.isPending ? 'Saving...' : 'Save'}
        </button>
        {save.isSuccess && <p className="text-sm text-green-600">Saved.</p>}
      </form>
    </div>
  );
}
