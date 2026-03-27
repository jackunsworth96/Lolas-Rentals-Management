import { useState, useEffect } from 'react';
import { useLeaveConfig, useSaveLeaveConfig, useStores } from '../../../api/config.js';

const DEFAULT_RESET_MONTH = 1;
const DEFAULT_RESET_DAY = 1;
const DEFAULT_HOLIDAY = 5;
const DEFAULT_SICK = 5;

export function LeaveConfigTab() {
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState('');
  const { data: config, isLoading, isFetched } = useLeaveConfig(storeId || undefined);
  const save = useSaveLeaveConfig();

  const [resetMonth, setResetMonth] = useState(DEFAULT_RESET_MONTH);
  const [resetDay, setResetDay] = useState(DEFAULT_RESET_DAY);
  const [holidayAllowance, setHolidayAllowance] = useState(DEFAULT_HOLIDAY);
  const [sickAllowance, setSickAllowance] = useState(DEFAULT_SICK);

  useEffect(() => {
    if (!storeId || !isFetched) return;
    if (config == null) {
      setResetMonth(DEFAULT_RESET_MONTH);
      setResetDay(DEFAULT_RESET_DAY);
      setHolidayAllowance(DEFAULT_HOLIDAY);
      setSickAllowance(DEFAULT_SICK);
      return;
    }
    const c = config as Record<string, unknown>;
    setResetMonth(Number(c.resetMonth ?? DEFAULT_RESET_MONTH));
    setResetDay(Number(c.resetDay ?? DEFAULT_RESET_DAY));
    setHolidayAllowance(Number(c.defaultHolidayAllowance ?? DEFAULT_HOLIDAY));
    setSickAllowance(Number(c.defaultSickAllowance ?? DEFAULT_SICK));
  }, [storeId, config, isFetched]);

  const storeOpts = ((stores ?? []) as Array<{ id: string; name: string }>);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    save.mutate({
      storeId,
      resetMonth,
      resetDay,
      defaultHolidayAllowance: holidayAllowance,
      defaultSickAllowance: sickAllowance,
    });
  }

  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-gray-900">Leave Configuration</h3>
      <p className="mb-4 text-sm text-gray-600">
        Settings are stored <strong>per store</strong>. Select a store, then set the annual reset date (month/day) and default leave allowances.
        New employees get these allowance defaults for that store (you can override per person on their profile).
      </p>
      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Store</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select store…</option>
            {storeOpts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        {!storeId && (
          <p className="text-sm text-gray-500">Choose a store to load or create its leave configuration.</p>
        )}

        {storeId && isLoading && <p className="text-sm text-gray-500">Loading configuration…</p>}

        {storeId && !isLoading && (
          <>
            {config == null && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No saved configuration for this store yet. Values below are defaults — press Save to create the record.
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Reset month (1–12)</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={resetMonth}
                  onChange={(e) => setResetMonth(Number(e.target.value))}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Reset day (1–31)</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={resetDay}
                  onChange={(e) => setResetDay(Number(e.target.value))}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Default annual holiday days</span>
                <input
                  type="number"
                  min={0}
                  value={holidayAllowance}
                  onChange={(e) => setHolidayAllowance(Number(e.target.value))}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Default annual sick days</span>
                <input
                  type="number"
                  min={0}
                  value={sickAllowance}
                  onChange={(e) => setSickAllowance(Number(e.target.value))}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            {save.isSuccess && <p className="text-sm text-green-600">Saved.</p>}
          </>
        )}
      </form>
    </div>
  );
}
