import { useEffect, useMemo, useState } from 'react';
import { useModifyAddons } from '../../api/orders.js';
import { useAddons, useChartOfAccounts, usePaymentMethods } from '../../api/config.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatCurrency } from '../../utils/currency.js';
import type { OrderAddon, OrderItem } from './useOrderDetail.js';

type ConfigAddon = {
  id: number;
  name: string;
  pricePerDay?: number;
  price_per_day?: number;
  priceOneTime?: number;
  price_one_time?: number;
  addonType?: string;
  addon_type?: string;
  isActive?: boolean;
  is_active?: boolean;
  mutualExclusivityGroup?: string;
  mutual_exclusivity_group?: string;
};

type PaymentMethod = {
  id: string;
  name: string;
  surchargePercent?: number;
  surcharge_percent?: number;
  isActive?: boolean;
  is_active?: boolean;
};

interface OrderDetailAddonsTabProps {
  orderId: string;
  storeId: string;
  orderAddons: OrderAddon[];
  items: OrderItem[];
  canAct: boolean;
}

export function OrderDetailAddonsTab({ orderId, storeId, orderAddons, items, canAct }: OrderDetailAddonsTabProps) {
  const { data: configAddons = [] } = useAddons(storeId) as { data: ConfigAddon[] | undefined };
  const { data: paymentMethods = [] } = usePaymentMethods() as { data: PaymentMethod[] | undefined };
  const { data: accounts = [] } = useChartOfAccounts() as { data: Array<Record<string, unknown>> | undefined };

  const modifyAddonsMut = useModifyAddons();
  const routing = usePaymentRouting();

  const [addonPaymentMethodId, setAddonPaymentMethodId] = useState('');
  const [addonAccountId, setAddonAccountId] = useState('');
  const [addonSettlementRef, setAddonSettlementRef] = useState('');
  const [pendingAddonAdds, setPendingAddonAdds] = useState<Array<{ addonName: string; addonPrice: number; addonType: 'per_day' | 'one_time'; quantity: number; totalAmount: number }>>([]);
  const [pendingAddonRemoves, setPendingAddonRemoves] = useState<string[]>([]);

  const pmLookup = useMemo(
    () => new Map(paymentMethods.map((pm) => [pm.id, pm])),
    [paymentMethods],
  );
  const activePaymentMethods = useMemo(
    () => paymentMethods.filter((m) => m.isActive !== false && m.is_active !== false),
    [paymentMethods],
  );

  const storeAccounts = useMemo(
    () => accounts.filter((a) => {
      const sid = String(a.storeId ?? a.store_id ?? '');
      return sid === storeId || sid === 'company';
    }),
    [accounts, storeId],
  );

  const paymentAccountOptions = useMemo(() => {
    const seen = new Set<string>();
    return storeAccounts.filter((a) => {
      const id = String(a.id);
      if (seen.has(id)) return false;
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      const match = type === 'asset' && (name.includes('cash') || name.includes('bank') || name.includes('gcash'));
      if (match) seen.add(id);
      return match;
    });
  }, [storeAccounts]);

  const defaultReceivableId = useMemo(() => {
    const match = storeAccounts.find((a) => {
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      return type === 'asset' && name.includes('receivable');
    });
    return match ? String(match.id) : storeAccounts.find((a) => String(a.accountType ?? a.type ?? '').toLowerCase() === 'asset')?.id as string ?? '';
  }, [storeAccounts]);

  const routedAddonAcct = routing.getReceivedInto(storeId, addonPaymentMethodId);

  const selectedAddonPM = addonPaymentMethodId ? pmLookup.get(addonPaymentMethodId) : null;
  const addonSurchargePercent = selectedAddonPM ? Number(selectedAddonPM.surchargePercent ?? selectedAddonPM.surcharge_percent ?? 0) : 0;
  const isAddonCardPayment = addonSurchargePercent > 0;

  useEffect(() => {
    if (routedAddonAcct && !addonAccountId) setAddonAccountId(routedAddonAcct);
  }, [routedAddonAcct, addonAccountId]);

  const rentalDays = useMemo(() => {
    if (items.length === 0) return 1;
    return Math.max(...items.map((i) => i.rentalDaysCount ?? 1));
  }, [items]);

  const activeOrderAddonNames = useMemo(
    () => new Set(orderAddons.map((a) => a.addonName.toLowerCase())),
    [orderAddons],
  );
  const pendingAddonAddNames = useMemo(
    () => new Set(pendingAddonAdds.map((a) => a.addonName.toLowerCase())),
    [pendingAddonAdds],
  );

  const toggleAddon = (addon: ConfigAddon) => {
    const name = addon.name;
    const lowerName = name.toLowerCase();
    const type = (addon.addonType ?? addon.addon_type ?? 'one_time') as 'per_day' | 'one_time';
    const price = type === 'per_day' ? Number(addon.pricePerDay ?? addon.price_per_day ?? 0) : Number(addon.priceOneTime ?? addon.price_one_time ?? 0);
    const total = type === 'per_day' ? price * rentalDays : price;

    if (activeOrderAddonNames.has(lowerName)) {
      const match = orderAddons.find((a) => a.addonName.toLowerCase() === lowerName);
      if (match) {
        setPendingAddonRemoves((prev) => prev.includes(match.id) ? prev.filter((id) => id !== match.id) : [...prev, match.id]);
      }
    } else if (pendingAddonAddNames.has(lowerName)) {
      setPendingAddonAdds((prev) => prev.filter((a) => a.addonName.toLowerCase() !== lowerName));
    } else {
      setPendingAddonAdds((prev) => [...prev, { addonName: name, addonPrice: price, addonType: type, quantity: 1, totalAmount: total }]);
    }
  };

  const hasPendingAddonChanges = pendingAddonAdds.length > 0 || pendingAddonRemoves.length > 0;
  const pendingAddonAddTotal = pendingAddonAdds.reduce((s, a) => s + a.totalAmount, 0);

  const handleSaveAddons = () => {
    if (!hasPendingAddonChanges) return;
    modifyAddonsMut.mutate(
      {
        id: orderId,
        addons: pendingAddonAdds,
        removedAddonIds: pendingAddonRemoves,
        paymentMethodId: pendingAddonAdds.length > 0
          ? (addonPaymentMethodId || 'pending')
          : null,
        accountId: isAddonCardPayment ? null : (addonAccountId || null),
        receivableAccountId: defaultReceivableId || undefined,
        isCardPayment: isAddonCardPayment,
        settlementRef: isAddonCardPayment ? (addonSettlementRef || null) : null,
      },
      {
        onSuccess: () => {
          setPendingAddonAdds([]);
          setPendingAddonRemoves([]);
          setAddonPaymentMethodId('');
          setAddonAccountId('');
          setAddonSettlementRef('');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Current add-ons */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-charcoal-brand">Current Add-ons</h3>
        {orderAddons.length === 0 ? (
          <p className="text-sm text-charcoal-brand/60">No add-ons on this order.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-charcoal-brand/60">
                <th className="pb-2 pr-4">Add-on</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Price</th>
                <th className="pb-2 pr-4">Qty</th>
                <th className="pb-2 pr-4">Total</th>
                {canAct && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody>
              {orderAddons.map((a) => {
                const isMarkedForRemoval = pendingAddonRemoves.includes(a.id);
                return (
                  <tr key={a.id} className={`border-b hover:bg-sand-brand ${isMarkedForRemoval ? 'opacity-40 line-through' : ''}`}>
                    <td className="py-2 pr-4 font-medium">{a.addonName}</td>
                    <td className="py-2 pr-4 capitalize">{a.addonType === 'per_day' ? 'Per day' : 'One-time'}</td>
                    <td className="py-2 pr-4">{formatCurrency(a.addonPrice ?? 0)}</td>
                    <td className="py-2 pr-4">{a.quantity ?? 1}</td>
                    <td className="py-2 pr-4">{formatCurrency(a.totalAmount ?? 0)}</td>
                    {canAct && (
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => setPendingAddonRemoves((prev) => prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id])}
                          className={`text-xs font-medium ${isMarkedForRemoval ? 'text-teal-brand hover:text-teal-brand/80' : 'text-red-600 hover:text-red-800'}`}
                        >
                          {isMarkedForRemoval ? 'Undo' : 'Remove'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="py-2" colSpan={4}>Current Total</td>
                <td className="py-2" colSpan={canAct ? 2 : 1}>{formatCurrency(orderAddons.reduce((s, a) => s + (a.totalAmount ?? 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Available add-ons to toggle */}
      {canAct && configAddons.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-charcoal-brand">Available Add-ons</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {configAddons
              .filter((ca) => ca.isActive !== false && ca.is_active !== false)
              .map((ca) => {
                const type = (ca.addonType ?? ca.addon_type ?? 'one_time') as string;
                const price = type === 'per_day' ? Number(ca.pricePerDay ?? ca.price_per_day ?? 0) : Number(ca.priceOneTime ?? ca.price_one_time ?? 0);
                const total = type === 'per_day' ? price * rentalDays : price;
                const isOnOrder = activeOrderAddonNames.has(ca.name.toLowerCase()) && !pendingAddonRemoves.some((id) => orderAddons.find((a) => a.id === id)?.addonName.toLowerCase() === ca.name.toLowerCase());
                const isPendingAdd = pendingAddonAddNames.has(ca.name.toLowerCase());

                return (
                  <button
                    key={ca.id}
                    type="button"
                    onClick={() => toggleAddon(ca)}
                    className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                      isOnOrder
                        ? 'border-green-300 bg-green-50 text-green-800'
                        : isPendingAdd
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-gray-200 bg-white text-charcoal-brand hover:bg-sand-brand'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{ca.name}</div>
                      <div className="text-xs text-charcoal-brand/60">
                        {type === 'per_day' ? `${formatCurrency(price)}/day × ${rentalDays} days` : formatCurrency(price)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(total)}</div>
                      {isOnOrder && <span className="text-xs text-green-600">Active</span>}
                      {isPendingAdd && <span className="text-xs text-teal-brand">Adding</span>}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Pending changes summary + payment method */}
      {canAct && hasPendingAddonChanges && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h4 className="text-sm font-medium text-blue-900">Pending Changes</h4>
          {pendingAddonAdds.length > 0 && (
            <div className="text-sm text-blue-800">
              <span className="font-medium">Adding:</span>{' '}
              {pendingAddonAdds.map((a) => `${a.addonName} (${formatCurrency(a.totalAmount)})`).join(', ')}
              <span className="ml-2 font-semibold">Total: {formatCurrency(pendingAddonAddTotal)}</span>
            </div>
          )}
          {pendingAddonRemoves.length > 0 && (
            <div className="text-sm text-red-700">
              <span className="font-medium">Removing:</span>{' '}
              {pendingAddonRemoves.map((id) => orderAddons.find((a) => a.id === id)?.addonName ?? id).join(', ')}
            </div>
          )}

          {pendingAddonAdds.length > 0 && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-blue-200">
              <label className="block">
                <span className="text-xs font-medium text-blue-800">Payment Method</span>
                <select
                  value={addonPaymentMethodId}
                  onChange={(e) => { setAddonPaymentMethodId(e.target.value); setAddonAccountId(''); setAddonSettlementRef(''); }}
                  className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Charge to balance — collect later</option>
                  {activePaymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                </select>
              </label>
              {addonPaymentMethodId && isAddonCardPayment && (
                <label className="block">
                  <span className="text-xs font-medium text-blue-800">Card Reference #</span>
                  <input type="text" value={addonSettlementRef} onChange={(e) => setAddonSettlementRef(e.target.value)}
                    placeholder="Terminal receipt #"
                    className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
              )}
              {addonPaymentMethodId && !isAddonCardPayment && !routedAddonAcct && (
                <label className="block">
                  <span className="text-xs font-medium text-blue-800">Account</span>
                  <select value={addonAccountId} onChange={(e) => setAddonAccountId(e.target.value)}
                    className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="">Select</option>
                    {paymentAccountOptions.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.name)}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-amber-600">No routing rule — select manually</p>
                </label>
              )}
              {!addonPaymentMethodId && (
                <p className="text-xs text-amber-700">
                  ⚠ Balance will increase by {formatCurrency(pendingAddonAddTotal)} — collect payment later via "Collect Payment"
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSaveAddons}
              disabled={modifyAddonsMut.isPending || (pendingAddonAdds.length > 0 && (!!addonPaymentMethodId && !isAddonCardPayment && !routedAddonAcct && !addonAccountId))}
              className="rounded-lg bg-teal-brand px-5 py-2 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
            >
              {modifyAddonsMut.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => { setPendingAddonAdds([]); setPendingAddonRemoves([]); setAddonPaymentMethodId(''); setAddonAccountId(''); setAddonSettlementRef(''); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-sand-brand"
            >
              Cancel
            </button>
          </div>
          {modifyAddonsMut.error && <p className="text-sm text-red-600">{(modifyAddonsMut.error as Error).message}</p>}
        </div>
      )}
    </div>
  );
}
