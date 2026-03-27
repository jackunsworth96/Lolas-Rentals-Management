import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useStores,
  usePaymentMethods,
  useChartOfAccounts,
  usePaymentRoutingConfig,
  useSavePaymentRouting,
} from '../../../api/config.js';
import { Button } from '../../common/Button.js';

interface StoreConfig {
  id: string;
  name: string;
}

interface PaymentMethodConfig {
  id: string;
  name: string;
  isActive?: boolean;
}

interface AccountConfig {
  id: string;
  name: string;
  accountType: string;
  account_type?: string;
  storeId?: string | null;
  store_id?: string | null;
}

const LOLAS_PRIORITY = /lola/i;

type RuleKey = `${string}::${string}`;
function ruleKey(storeId: string, methodId: string): RuleKey {
  return `${storeId}::${methodId}`;
}

interface LocalRule {
  receivedIntoAccountId: string;
  cardSettlementAccountId: string;
}

interface StoreDefaults {
  cardFeeAccountId: string;
  defaultCashAccountId: string;
}

export function PaymentRoutingTab() {
  const { data: rawStores = [] } = useStores() as { data: StoreConfig[] | undefined };
  const { data: methods = [] } = usePaymentMethods() as { data: PaymentMethodConfig[] | undefined };
  const { data: allAccounts = [] } = useChartOfAccounts() as { data: AccountConfig[] | undefined };
  const { data: routingData, isLoading } = usePaymentRoutingConfig();
  const saveMut = useSavePaymentRouting();

  const stores = useMemo(
    () =>
      [...rawStores].sort((a, b) => {
        const aLola = LOLAS_PRIORITY.test(a.name) ? 0 : 1;
        const bLola = LOLAS_PRIORITY.test(b.name) ? 0 : 1;
        return aLola - bLola;
      }),
    [rawStores],
  );

  const activeMethods = useMemo(
    () => methods.filter((m) => m.isActive !== false),
    [methods],
  );

  const [rules, setRules] = useState<Map<RuleKey, LocalRule>>(new Map());
  const [storeDefaults, setStoreDefaults] = useState<Map<string, StoreDefaults>>(new Map());
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!routingData) return;
    const map = new Map<RuleKey, LocalRule>();
    for (const r of routingData.rules) {
      map.set(ruleKey(r.storeId, r.paymentMethodId), {
        receivedIntoAccountId: r.receivedIntoAccountId ?? '',
        cardSettlementAccountId: r.cardSettlementAccountId ?? '',
      });
    }
    setRules(map);

    const defaults = new Map<string, StoreDefaults>();
    for (const [sid, d] of Object.entries(routingData.storeDefaults)) {
      defaults.set(sid, {
        cardFeeAccountId: d.cardFeeAccountId ?? '',
        defaultCashAccountId: d.defaultCashAccountId ?? '',
      });
    }
    setStoreDefaults(defaults);
  }, [routingData]);

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  const storeAccounts = useMemo(
    () =>
      allAccounts.filter((a) => {
        const sid = a.storeId ?? a.store_id ?? null;
        return sid === selectedStoreId || sid === 'company';
      }),
    [allAccounts, selectedStoreId],
  );

  const assetAccounts = useMemo(
    () => storeAccounts.filter((a) => (a.accountType ?? a.account_type) === 'Asset'),
    [storeAccounts],
  );
  const expenseAccounts = useMemo(
    () => storeAccounts.filter((a) => (a.accountType ?? a.account_type) === 'Expense'),
    [storeAccounts],
  );

  const getRule = useCallback(
    (methodId: string): LocalRule => {
      return rules.get(ruleKey(selectedStoreId, methodId)) ?? {
        receivedIntoAccountId: '',
        cardSettlementAccountId: '',
      };
    },
    [rules, selectedStoreId],
  );

  const setRuleField = useCallback(
    (methodId: string, field: keyof LocalRule, value: string) => {
      setRules((prev) => {
        const next = new Map(prev);
        const key = ruleKey(selectedStoreId, methodId);
        const existing = next.get(key) ?? {
          receivedIntoAccountId: '',
          cardSettlementAccountId: '',
        };
        next.set(key, { ...existing, [field]: value });
        return next;
      });
      setDirty(true);
      setSaved(false);
    },
    [selectedStoreId],
  );

  const currentDefaults = storeDefaults.get(selectedStoreId) ?? {
    cardFeeAccountId: '',
    defaultCashAccountId: '',
  };

  const setDefault = useCallback(
    (field: keyof StoreDefaults, value: string) => {
      setStoreDefaults((prev) => {
        const next = new Map(prev);
        const existing = next.get(selectedStoreId) ?? { cardFeeAccountId: '', defaultCashAccountId: '' };
        next.set(selectedStoreId, { ...existing, [field]: value });
        return next;
      });
      setDirty(true);
      setSaved(false);
    },
    [selectedStoreId],
  );

  function handleSave() {
    const allRules: Array<{
      storeId: string;
      paymentMethodId: string;
      receivedIntoAccountId: string | null;
      cardSettlementAccountId: string | null;
    }> = [];

    for (const [key, rule] of rules.entries()) {
      const [storeId, methodId] = key.split('::');
      if (!rule.receivedIntoAccountId && !rule.cardSettlementAccountId) continue;
      allRules.push({
        storeId,
        paymentMethodId: methodId,
        receivedIntoAccountId: rule.receivedIntoAccountId || null,
        cardSettlementAccountId: rule.cardSettlementAccountId || null,
      });
    }

    const sd = storeDefaults.get(selectedStoreId);

    saveMut.mutate(
      {
        rules: allRules,
        storeDefaults: sd
          ? {
              storeId: selectedStoreId,
              cardFeeAccountId: sd.cardFeeAccountId || null,
              defaultCashAccountId: sd.defaultCashAccountId || null,
            }
          : undefined,
      },
      {
        onSuccess: () => {
          setDirty(false);
          setSaved(true);
        },
      },
    );
  }

  const isCard = useCallback(
    (methodId: string) => {
      const key = methodId.toLowerCase().replace(/[\s_-]/g, '');
      return key === 'card' || key === 'creditcard' || key === 'debitcard';
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Payment Routing Rules</h2>
          <p className="mt-1 text-sm text-gray-500">
            Define where money lands per store and payment method. Income accounts are resolved by context (orders, misc sales, transfers).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && !dirty && (
            <span className="text-sm font-medium text-green-600">Saved</span>
          )}
          <Button onClick={handleSave} loading={saveMut.isPending} disabled={!dirty}>
            Save Rules
          </Button>
        </div>
      </div>

      {saveMut.isError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {(saveMut.error as Error)?.message ?? 'Failed to save'}
        </div>
      )}

      {/* Store tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        {stores.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedStoreId(s.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              selectedStoreId === s.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Store-level defaults */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Store-Level Defaults</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Default Cash Account (for expenses)
            </label>
            <select
              value={currentDefaults.defaultCashAccountId}
              onChange={(e) => setDefault('defaultCashAccountId', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— Not set —</option>
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Card Fee Expense Account
            </label>
            <select
              value={currentDefaults.cardFeeAccountId}
              onChange={(e) => setDefault('cardFeeAccountId', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— Not set —</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Routing rules table */}
      {activeMethods.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No payment methods configured. Add them in the Payment Methods tab first.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Payment Method</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Received Into</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Card Settlement Account</th>
              </tr>
            </thead>
            <tbody>
              {activeMethods.map((method) => {
                const rule = getRule(method.id);
                const showSettlement = isCard(method.id);
                return (
                  <tr key={method.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{method.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{method.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={rule.receivedIntoAccountId}
                        onChange={(e) => setRuleField(method.id, 'receivedIntoAccountId', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">— Select account —</option>
                        {assetAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {showSettlement ? (
                        <select
                          value={rule.cardSettlementAccountId}
                          onChange={(e) => setRuleField(method.id, 'cardSettlementAccountId', e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">— Select account —</option>
                          {assetAccounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400">N/A</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Explanation */}
      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-medium">How this works</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-blue-700">
          <li><strong>Received Into</strong> — the asset account where money lands (e.g. Cash Drawer, GCash Account, Card Receivable)</li>
          <li><strong>Card Settlement Account</strong> — the bank account where card payments settle (e.g. Union Bank) — only for card methods</li>
          <li><strong>Default Cash Account</strong> — used as the default "paid from" in expenses</li>
          <li><strong>Card Fee Expense</strong> — the expense account for card processing fees during settlement matching</li>
        </ul>
        <p className="mt-2 text-blue-600">
          Income accounts are resolved by context: rental income for orders, category-mapped income for misc sales, route income for transfers.
        </p>
      </div>
    </div>
  );
}
