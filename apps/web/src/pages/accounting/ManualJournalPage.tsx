import { useState, useMemo } from 'react';
import { useCreateJournalEntry } from '../../api/accounting.js';
import { useChartOfAccounts, useStores } from '../../api/config.js';
import { Button } from '../../components/common/Button.js';
import { formatCurrency } from '../../utils/currency.js';

interface Account {
  id: string;
  name: string;
  accountType?: string;
  account_type?: string;
  storeId?: string | null;
  store_id?: string | null;
}

interface Store {
  id: string;
  name: string;
}

interface Leg {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

function newLeg(): Leg {
  return {
    key: Math.random().toString(36).slice(2),
    accountId: '',
    debit: '',
    credit: '',
    description: '',
  };
}

const REF_TYPES = [
  { value: 'opening_balance', label: 'Opening Balance' },
  { value: 'adjustment', label: 'Manual Adjustment' },
  { value: 'depreciation', label: 'Depreciation' },
  { value: 'refund', label: 'Refund' },
  { value: 'other', label: 'Other' },
];

const TYPE_ORDER = ['Asset', 'Liability', 'Income', 'Expense', 'Equity'];

export default function ManualJournalPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [referenceType, setReferenceType] = useState('opening_balance');
  const [locationId, setLocationId] = useState('');
  const [legs, setLegs] = useState<Leg[]>([newLeg(), newLeg()]);
  const [successMsg, setSuccessMsg] = useState('');

  const { data: rawAccounts = [] } = useChartOfAccounts() as { data: Account[] | undefined };
  const { data: rawStores = [] } = useStores({ includeCompany: true }) as { data: Store[] | undefined };

  const createJournal = useCreateJournalEntry();

  const accounts = useMemo(() => {
    const sorted = [...rawAccounts].sort((a, b) => {
      const typeA = TYPE_ORDER.indexOf(a.accountType ?? a.account_type ?? '');
      const typeB = TYPE_ORDER.indexOf(b.accountType ?? b.account_type ?? '');
      if (typeA !== typeB) return typeA - typeB;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [rawAccounts]);

  const stores = useMemo(
    () => [...rawStores].sort((a, b) => a.name.localeCompare(b.name)),
    [rawStores],
  );

  const totalDebit = legs.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = legs.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  const filledLegs = legs.filter(
    (l) => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0),
  );

  function updateLeg(key: string, field: keyof Omit<Leg, 'key'>, value: string) {
    setLegs((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

  function removeLeg(key: string) {
    if (legs.length <= 2) return;
    setLegs((prev) => prev.filter((l) => l.key !== key));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isBalanced || !description.trim() || filledLegs.length < 2) return;

    createJournal.mutate(
      {
        date,
        description: description.trim(),
        referenceType,
        locationId: locationId || undefined,
        legs: filledLegs.map((l) => ({
          accountId: l.accountId,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          description: l.description.trim() || null,
          referenceType,
        })),
      },
      {
        onSuccess: () => {
          setLegs([newLeg(), newLeg()]);
          setDescription('');
          setSuccessMsg('Journal entry posted successfully.');
          setTimeout(() => setSuccessMsg(''), 5000);
        },
      },
    );
  }

  const groupedAccounts = useMemo(() => {
    const map = new Map<string, Account[]>();
    for (const a of accounts) {
      const type = a.accountType ?? a.account_type ?? 'Other';
      if (!map.has(type)) map.set(type, []);
      map.get(type)!.push(a);
    }
    return map;
  }, [accounts]);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Manual Journal Entry</h1>
        <p className="mt-1 text-sm text-gray-500">
          Post a manual double-entry journal — opening balances, adjustments, depreciation, or any
          other direct accounting entry.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header fields */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entry Details
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Description <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. Opening Balance — Cutover 1 May 2026"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Entry Type</label>
              <select
                value={referenceType}
                onChange={(e) => setReferenceType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {REF_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Store{' '}
                <span className="font-normal text-gray-400">
                  (optional — defaults to your primary store if not selected)
                </span>
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— Use my default store —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Journal lines */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Journal Lines
            </h2>
            <button
              type="button"
              onClick={() => setLegs((prev) => [...prev, newLeg()])}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              + Add Line
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600">Account</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-600">
                    Line Description
                  </th>
                  <th className="w-32 px-4 py-2.5 text-right font-medium text-gray-600">Debit</th>
                  <th className="w-32 px-4 py-2.5 text-right font-medium text-gray-600">Credit</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {legs.map((leg) => (
                  <tr key={leg.key} className="border-b border-gray-50">
                    <td className="px-4 py-2">
                      <select
                        value={leg.accountId}
                        onChange={(e) => updateLeg(leg.key, 'accountId', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">— Select account —</option>
                        {[...groupedAccounts.entries()].map(([type, accts]) => (
                          <optgroup key={type} label={type}>
                            {accts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={leg.description}
                        onChange={(e) => updateLeg(leg.key, 'description', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Optional"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={leg.debit}
                        onChange={(e) => updateLeg(leg.key, 'debit', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={leg.credit}
                        onChange={(e) => updateLeg(leg.key, 'credit', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removeLeg(leg.key)}
                        disabled={legs.length <= 2}
                        title="Remove line"
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td
                    className="px-4 py-2.5 text-sm font-semibold text-gray-700"
                    colSpan={2}
                  >
                    Totals
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-gray-900">
                    {formatCurrency(totalDebit)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-gray-900">
                    {formatCurrency(totalCredit)}
                  </td>
                  <td />
                </tr>
                <tr className="border-t border-gray-100">
                  <td colSpan={5} className="px-4 py-2.5">
                    {totalDebit === 0 && totalCredit === 0 ? null : isBalanced ? (
                      <span className="text-sm font-medium text-green-600">
                        ✓ Balanced — ready to post
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-red-600">
                        ✗ Out of balance by{' '}
                        {formatCurrency(Math.abs(totalDebit - totalCredit))} — debits must equal
                        credits
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Help box */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
          <p className="font-semibold">Opening balance example (Customer Deposits)</p>
          <div className="mt-2 space-y-0.5 font-mono text-xs text-blue-700">
            <p>Dr &nbsp;UnionBank (Asset) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;85,000</p>
            <p>Cr &nbsp;Customer Deposits Received (Liability) &nbsp;15,000</p>
            <p>Cr &nbsp;Capital / Owner's Equity (Equity) &nbsp;&nbsp;&nbsp;&nbsp;70,000</p>
          </div>
          <p className="mt-2 text-blue-700">
            The pre-paid 15k clears when those orders activate using the{' '}
            <strong>Pre-paid (Prior System)</strong> payment method, which routes to the Customer
            Deposits Received account via Settings → Payment Routing.
          </p>
        </div>

        {successMsg && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {successMsg}
          </div>
        )}

        {createJournal.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(createJournal.error as Error)?.message ??
              'Failed to post journal. Check that all lines have an account selected and the entry is balanced.'}
          </div>
        )}

        <div className="flex items-center justify-end gap-4">
          <Button
            type="submit"
            loading={createJournal.isPending}
            disabled={!isBalanced || !description.trim() || filledLegs.length < 2}
          >
            Post Journal Entry
          </Button>
        </div>
      </form>
    </div>
  );
}
