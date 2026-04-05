import { useState, useMemo, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { ExtendOrderModal } from './ExtendOrderModal.js';
import { useOrder, useOrderItems, useOrderPayments, useOrderAddons, useOrderSwaps, useOrderHistory, useCollectPayment, useSettleOrder, useSwapVehicle, useModifyAddons, useAdjustDates } from '../../api/orders.js';
import { useFleet } from '../../api/fleet.js';
import { usePaymentMethods, useChartOfAccounts, useFleetStatuses, useAddons } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatDate } from '../../utils/date.js';
import type { EnrichedOrder } from '../../types/api.js';
import { useCustomerPawCardSavings } from '../../api/paw-card.js';

function moneyAmount(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'object' && 'amount' in val && typeof (val as { amount: number }).amount === 'number') return (val as { amount: number }).amount;
  return Number(val) || 0;
}

interface OrderDetailModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  storeId: string;
  readOnly?: boolean;
  enrichedData?: EnrichedOrder;
}

type TabKey = 'summary' | 'payments' | 'vehicles' | 'addons' | 'history';

export function OrderDetailModal({ open, onClose, orderId, storeId, readOnly = false, enrichedData }: OrderDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('summary');

  // ── Collect payment state ──
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [settlementRef, setSettlementRef] = useState('');

  // ── Swap vehicle state ──
  const [swapNewVehicleId, setSwapNewVehicleId] = useState('');
  const [swapReason, setSwapReason] = useState('');

  // ── Settle order state ──
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settleDepositAccountId, setSettleDepositAccountId] = useState('');
  const [settleReceivableAccountId, setSettleReceivableAccountId] = useState('');
  const [settleRefundAccountId, setSettleRefundAccountId] = useState('');
  const [settleRefundMethodId, setSettleRefundMethodId] = useState('');
  const [settleFinalMethodId, setSettleFinalMethodId] = useState('');
  const [settleFinalAccountId, setSettleFinalAccountId] = useState('');
  const [settleFinalRef, setSettleFinalRef] = useState('');

  // ── Add-on modification state ──
  const [addonPaymentMethodId, setAddonPaymentMethodId] = useState('');
  const [addonAccountId, setAddonAccountId] = useState('');
  const [addonSettlementRef, setAddonSettlementRef] = useState('');
  const [pendingAddonAdds, setPendingAddonAdds] = useState<Array<{ addonName: string; addonPrice: number; addonType: 'per_day' | 'one_time'; quantity: number; totalAmount: number }>>([]);
  const [pendingAddonRemoves, setPendingAddonRemoves] = useState<string[]>([]);

  // ── Data queries ──
  const { data: order, isLoading: orderLoading } = useOrder(orderId);
  const { data: items = [] } = useOrderItems(orderId);
  const { data: payments = [] } = useOrderPayments(orderId);
  const { data: orderAddons = [] } = useOrderAddons(orderId) as { data: Array<{ id: string; orderId: string; addonName: string; addonPrice: number; addonType: 'per_day' | 'one_time'; quantity: number; totalAmount: number }> | undefined };
  const { data: swaps = [] } = useOrderSwaps(orderId);
  const { data: history = [] } = useOrderHistory(orderId) as { data: Array<{ timestamp: string; type: string; description: string; detail?: string; amount?: number }> | undefined };
  const { data: vehicles = [] } = useFleet(storeId);
  const { data: configAddons = [] } = useAddons(storeId) as { data: Array<{ id: number; name: string; pricePerDay?: number; price_per_day?: number; priceOneTime?: number; price_one_time?: number; addonType?: string; addon_type?: string; isActive?: boolean; is_active?: boolean; mutualExclusivityGroup?: string; mutual_exclusivity_group?: string }> | undefined };
  const { data: paymentMethods = [] } = usePaymentMethods() as { data: Array<{ id: string; name: string; surchargePercent?: number; surcharge_percent?: number; isActive?: boolean; is_active?: boolean }> | undefined };
  const { data: accounts = [] } = useChartOfAccounts() as { data: Array<Record<string, unknown>> | undefined };
  const { data: fleetStatuses = [] } = useFleetStatuses() as { data: Array<{ id: string; name: string; isRentable?: boolean; is_rentable?: boolean }> | undefined };

  const collectPaymentMut = useCollectPayment();
  const settleOrder = useSettleOrder();
  const swapVehicle = useSwapVehicle();
  const modifyAddonsMut = useModifyAddons();
  const adjustDatesMut = useAdjustDates();
  const routing = usePaymentRouting();

  const customerEmailForPaw = useMemo(
    () =>
      enrichedData?.customerEmail?.trim() ||
      (order as { customerEmail?: string | null } | undefined)?.customerEmail?.trim() ||
      undefined,
    [enrichedData?.customerEmail, order],
  );
  const { data: pawCardSavings } = useCustomerPawCardSavings(customerEmailForPaw);

  // ── Date editing state ──
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPickup, setEditPickup] = useState('');
  const [editDropoff, setEditDropoff] = useState('');

  // ── Extend booking state ──
  const [extendOpen, setExtendOpen] = useState(false);

  const isActive = order && String(order.status?.value ?? order.status) === 'active';
  const canAct = isActive && !readOnly;

  // ── Store-filtered accounts (include company-wide accounts) ──
  const storeAccounts = useMemo(
    () => (accounts ?? []).filter((a) => {
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

  const depositLiabilityOptions = useMemo(() =>
    storeAccounts.filter((a) => {
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      return type === 'liability' && name.includes('deposit');
    }),
  [storeAccounts]);

  const receivableOptions = useMemo(() =>
    storeAccounts.filter((a) => {
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      return type === 'asset';
    }),
  [storeAccounts]);

  const refundAccountOptions = useMemo(() =>
    storeAccounts.filter((a) => {
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      return type === 'asset' && (name.includes('cash') || name.includes('bank') || name.includes('gcash'));
    }),
  [storeAccounts]);

  const defaultReceivableId = useMemo(() => {
    const match = storeAccounts.find((a) => {
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      return type === 'asset' && name.includes('receivable');
    });
    return match ? String(match.id) : storeAccounts.find((a) => String(a.accountType ?? a.type ?? '').toLowerCase() === 'asset')?.id as string ?? '';
  }, [storeAccounts]);

  // ── Payment method helpers ──
  const pmLookup = useMemo(
    () => new Map((paymentMethods ?? []).map((pm) => [pm.id, pm])),
    [paymentMethods],
  );
  const activePaymentMethods = useMemo(
    () => (paymentMethods ?? []).filter((m) => m.isActive !== false && m.is_active !== false),
    [paymentMethods],
  );
  const selectedPM = paymentMethodId ? pmLookup.get(paymentMethodId) : null;
  const surchargePercent = selectedPM ? Number(selectedPM.surchargePercent ?? selectedPM.surcharge_percent ?? 0) : 0;
  const isCardPayment = surchargePercent > 0;

  // ── Auto-fill single-option accounts ──
  useEffect(() => {
    if (paymentAccountOptions.length === 1 && !paymentAccountId) setPaymentAccountId(String(paymentAccountOptions[0].id));
  }, [paymentAccountOptions, paymentAccountId]);
  // ── Routing auto-fill ──
  const routedCollectAcct = routing.getReceivedInto(storeId, paymentMethodId);
  const routedSettleFinalAcct = routing.getReceivedInto(storeId, settleFinalMethodId);
  const routedDepositLiability = routing.resolveDepositLiability(
    storeAccounts as Array<{ id: string; name: string; accountType?: string; account_type?: string; storeId?: string | null; store_id?: string | null }>,
    storeId,
  );
  const routedReceivable = routing.resolveReceivable(
    storeAccounts as Array<{ id: string; name: string; accountType?: string; account_type?: string; storeId?: string | null; store_id?: string | null }>,
    storeId,
  );
  const settleRefundPM = settleRefundMethodId ? pmLookup.get(settleRefundMethodId) : null;
  const routedRefundResolved = settleRefundMethodId
    ? routing.resolveReceivedIntoForStore(storeId, settleRefundMethodId, settleRefundPM?.name ?? null)
    : null;
  const effectiveRefundAccountId = routedRefundResolved ?? (settleRefundAccountId.trim() !== '' ? settleRefundAccountId : '');
  const routedAddonAcct = routing.getReceivedInto(storeId, addonPaymentMethodId);

  const refundPaymentMethods = useMemo(
    () => activePaymentMethods.filter((m) => {
      const s = Number(m.surchargePercent ?? m.surcharge_percent ?? 0);
      return s === 0;
    }),
    [activePaymentMethods],
  );

  useEffect(() => {
    if (routedCollectAcct && !paymentAccountId) setPaymentAccountId(routedCollectAcct);
  }, [routedCollectAcct, paymentAccountId]);
  useEffect(() => {
    if (routedSettleFinalAcct && !settleFinalAccountId) setSettleFinalAccountId(routedSettleFinalAcct);
  }, [routedSettleFinalAcct, settleFinalAccountId]);
  useEffect(() => {
    if (settleDepositAccountId) return;
    if (routedDepositLiability) {
      setSettleDepositAccountId(routedDepositLiability);
      return;
    }
    if (depositLiabilityOptions.length > 0) {
      setSettleDepositAccountId(String(depositLiabilityOptions[0].id));
    }
  }, [routedDepositLiability, depositLiabilityOptions, settleDepositAccountId]);

  useEffect(() => {
    if (settleReceivableAccountId) return;
    if (routedReceivable) {
      setSettleReceivableAccountId(routedReceivable);
      return;
    }
    const recv = receivableOptions.find((a) => String(a.name ?? '').toLowerCase().includes('receivable'));
    if (recv) {
      setSettleReceivableAccountId(String(recv.id));
      return;
    }
    if (defaultReceivableId) {
      setSettleReceivableAccountId(defaultReceivableId);
    }
  }, [routedReceivable, receivableOptions, defaultReceivableId, settleReceivableAccountId]);

  useEffect(() => {
    if (routedAddonAcct && !addonAccountId) setAddonAccountId(routedAddonAcct);
  }, [routedAddonAcct, addonAccountId]);

  // ── Add-on helpers ──
  const activeOrderAddonNames = useMemo(
    () => new Set((orderAddons ?? []).map((a) => a.addonName.toLowerCase())),
    [orderAddons],
  );
  const pendingAddonAddNames = useMemo(
    () => new Set(pendingAddonAdds.map((a) => a.addonName.toLowerCase())),
    [pendingAddonAdds],
  );
  const selectedAddonPM = addonPaymentMethodId ? pmLookup.get(addonPaymentMethodId) : null;
  const addonSurchargePercent = selectedAddonPM ? Number(selectedAddonPM.surchargePercent ?? selectedAddonPM.surcharge_percent ?? 0) : 0;
  const isAddonCardPayment = addonSurchargePercent > 0;

  const rentalDays = useMemo(() => {
    const list = items as Array<{ rentalDaysCount: number }>;
    if (list.length === 0) return 1;
    return Math.max(...list.map((i) => i.rentalDaysCount ?? 1));
  }, [items]);

  const toggleAddon = (addon: { name: string; pricePerDay?: number; price_per_day?: number; priceOneTime?: number; price_one_time?: number; addonType?: string; addon_type?: string }) => {
    const name = addon.name;
    const lowerName = name.toLowerCase();
    const type = (addon.addonType ?? addon.addon_type ?? 'one_time') as 'per_day' | 'one_time';
    const price = type === 'per_day' ? Number(addon.pricePerDay ?? addon.price_per_day ?? 0) : Number(addon.priceOneTime ?? addon.price_one_time ?? 0);
    const total = type === 'per_day' ? price * rentalDays : price;

    if (activeOrderAddonNames.has(lowerName)) {
      const match = (orderAddons ?? []).find((a) => a.addonName.toLowerCase() === lowerName);
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
    if (pendingAddonAdds.length > 0 && !addonPaymentMethodId) return;
    if (pendingAddonAdds.length > 0 && !isAddonCardPayment && !addonAccountId) return;

    modifyAddonsMut.mutate(
      {
        id: orderId,
        addons: pendingAddonAdds,
        removedAddonIds: pendingAddonRemoves,
        paymentMethodId: pendingAddonAdds.length > 0 ? addonPaymentMethodId : null,
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

  // ── Available vehicles for swap ──
  const rentableStatusSet = useMemo(() => {
    const statuses = fleetStatuses ?? [];
    if (statuses.length === 0) return new Set(['available']);
    const set = new Set<string>();
    for (const s of statuses) {
      if (s.isRentable ?? s.is_rentable ?? false) {
        set.add(s.id.toLowerCase());
        set.add(s.name.toLowerCase());
      }
    }
    return set.size > 0 ? set : new Set(['available']);
  }, [fleetStatuses]);

  const availableVehicles = useMemo(
    () => (vehicles as Array<Record<string, unknown>>).filter((v) =>
      rentableStatusSet.has(String(v.status ?? '').toLowerCase()),
    ),
    [vehicles, rentableStatusSet],
  );

  // ── Handlers ──
  const handleCollectPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentAmount || !paymentMethodId || !defaultReceivableId) return;
    if (!isCardPayment && !paymentAccountId) return;
    collectPaymentMut.mutate(
      {
        id: orderId,
        amount: Number(paymentAmount),
        paymentMethodId,
        accountId: isCardPayment ? null : paymentAccountId,
        paymentType: 'rental',
        transactionDate: new Date().toISOString().slice(0, 10),
        receivableAccountId: defaultReceivableId,
        isCardPayment,
        settlementRef: isCardPayment ? (settlementRef || null) : null,
      },
      {
        onSuccess: () => {
          setPaymentAmount('');
          setPaymentMethodId('');
          setPaymentAccountId('');
          setSettlementRef('');
        },
      },
    );
  };

  const settleFinalPM = settleFinalMethodId ? pmLookup.get(settleFinalMethodId) : null;
  const settleFinalSurcharge = settleFinalPM ? Number(settleFinalPM.surchargePercent ?? settleFinalPM.surcharge_percent ?? 0) : 0;
  const isSettleFinalCard = settleFinalSurcharge > 0;

  useEffect(() => {
    if (!import.meta.env.DEV || !open || !order || orderLoading) return;
    const ordTotal = enrichedData?.finalTotal ?? moneyAmount(order.finalTotal);
    const ordPaid = enrichedData?.totalPaid ?? (payments as Array<{ amount: number }>).reduce((s, p) => s + (p.amount ?? 0), 0);
    const bal = ordTotal - ordPaid;
    const secDep = enrichedData?.securityDeposit ?? moneyAmount(order.securityDeposit);
    const depositApplied = Math.min(secDep, Math.max(0, bal));
    const depositRefund = Math.max(0, secDep - Math.max(0, bal));
    const remainingAfterDeposit = Math.max(0, bal - depositApplied);
    const refundReady = depositRefund <= 0 || (!!settleRefundMethodId && !!effectiveRefundAccountId.trim());
    const finalPayReady = remainingAfterDeposit <= 0 || (!!settleFinalMethodId && (isSettleFinalCard || !!settleFinalAccountId));
    const settleReady = !!settleDepositAccountId && !!settleReceivableAccountId && refundReady && finalPayReady;
    const buttonDisabled = settleOrder.isPending || !settleReady;
    console.log('[OrderDetailModal Settle button]', {
      buttonDisabled,
      settleOrder_isPending: settleOrder.isPending,
      settleReady,
      settleDepositAccountId: settleDepositAccountId || '(empty)',
      settleReceivableAccountId: settleReceivableAccountId || '(empty)',
      refundReady,
      finalPayReady,
      depositRefund,
      remainingAfterDeposit,
      balance: bal,
      securityDeposit: secDep,
      settleRefundMethodId: settleRefundMethodId || '(empty)',
      effectiveRefundAccountId: effectiveRefundAccountId || '(empty)',
      routedRefundResolved: routedRefundResolved ?? '(null)',
      settleFinalMethodId: settleFinalMethodId || '(empty)',
      settleFinalAccountId: settleFinalAccountId || '(empty)',
      isSettleFinalCard,
      routedSettleFinalAcct: routedSettleFinalAcct ?? '(null)',
    });
  }, [
    open,
    order,
    orderLoading,
    enrichedData,
    payments,
    settleOrder.isPending,
    settleDepositAccountId,
    settleReceivableAccountId,
    settleRefundMethodId,
    effectiveRefundAccountId,
    routedRefundResolved,
    settleFinalMethodId,
    settleFinalAccountId,
    isSettleFinalCard,
    routedSettleFinalAcct,
  ]);

  const handleSettle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlementDate || !settleDepositAccountId || !settleReceivableAccountId) return;

    const depositApplied = Math.min(securityDeposit, Math.max(0, balance));
    const depositRefund = Math.max(0, securityDeposit - Math.max(0, balance));
    const remainingAfterDeposit = Math.max(0, balance - depositApplied);
    const needsFinalPayment = remainingAfterDeposit > 0;

    if (depositRefund > 0 && !effectiveRefundAccountId.trim()) return;

    if (needsFinalPayment && !settleFinalMethodId) return;
    if (needsFinalPayment && !isSettleFinalCard && !settleFinalAccountId) return;

    settleOrder.mutate(
      {
        id: orderId,
        settlementDate,
        depositLiabilityAccountId: settleDepositAccountId,
        receivableAccountId: settleReceivableAccountId,
        refundAccountId: depositRefund > 0 ? effectiveRefundAccountId : settleRefundAccountId,
        finalPaymentMethodId: needsFinalPayment ? settleFinalMethodId : null,
        finalPaymentAccountId: needsFinalPayment && !isSettleFinalCard ? settleFinalAccountId : null,
        finalPaymentAmount: needsFinalPayment ? remainingAfterDeposit : undefined,
        isCardPayment: needsFinalPayment ? isSettleFinalCard : undefined,
        settlementRef: needsFinalPayment && isSettleFinalCard ? (settleFinalRef || null) : null,
      },
      { onSuccess: () => onClose() },
    );
  };

  const handleSwapVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    const currentItem = itemsList[0];
    if (!currentItem || !swapNewVehicleId || !swapReason.trim()) return;
    swapVehicle.mutate(
      { id: orderId, orderItemId: currentItem.id, newVehicleId: swapNewVehicleId, reason: swapReason.trim() },
      {
        onSuccess: () => {
          setSwapNewVehicleId('');
          setSwapReason('');
        },
      },
    );
  };

  if (!open) return null;
  if (orderLoading || !order) {
    return (
      <Modal open onClose={onClose} title="Order" size="lg">
        <div className="py-8 text-center text-gray-500">Loading order...</div>
      </Modal>
    );
  }

  const statusVal = order.status?.value ?? order.status;
  const total = enrichedData?.finalTotal ?? moneyAmount(order.finalTotal);
  const totalPaid = enrichedData?.totalPaid ?? (payments as Array<{ amount: number }>).reduce((s, p) => s + (p.amount ?? 0), 0);
  const balance = total - totalPaid;

  const wooOrderId = enrichedData?.wooOrderId ?? null;
  const customerName = enrichedData?.customerName ?? order.customerId ?? '—';
  const customerMobile = enrichedData?.customerMobile ?? null;
  const vehicleNames = enrichedData?.vehicleNames ?? null;
  const returnDatetime = enrichedData?.returnDatetime ?? null;
  const securityDeposit = enrichedData?.securityDeposit ?? moneyAmount(order.securityDeposit);
  const surcharge = enrichedData?.cardFeeSurcharge ?? moneyAmount(order.cardFeeSurcharge);
  const paymentMethodName = order.paymentMethodId ? pmLookup.get(order.paymentMethodId)?.name ?? order.paymentMethodId : null;

  const itemsList = items as Array<{ id: string; vehicleId: string; vehicleName: string; pickupDatetime: string; dropoffDatetime: string; rentalDaysCount: number; rentalRate: number; pickupFee?: number; dropoffFee?: number; discount?: number }>;
  const rentalSubtotal = itemsList.reduce((sum, i) => sum + (i.rentalRate ?? 0) * (i.rentalDaysCount ?? 0), 0);
  const addonTotal = (orderAddons ?? []).reduce((sum, a) => sum + (a.totalAmount ?? 0), 0);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'payments', label: `Payments (${(payments as unknown[]).length})` },
    { key: 'vehicles', label: `Vehicles (${itemsList.length})` },
    { key: 'addons', label: `Add-ons (${(orderAddons ?? []).length})` },
    { key: 'history', label: 'History' },
  ];

  return (
    <Modal open onClose={onClose} title={`Order — ${customerName}`} size="xl">
      <div className="mb-4 flex gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ SUMMARY TAB ═══════════════════ */}
      {tab === 'summary' && (
        <div className="space-y-5">
          {/* Customer & Vehicle header */}
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex flex-wrap gap-6">
              <div className="min-w-0 max-w-md">
                <div className="text-xs font-medium uppercase text-gray-500">Customer</div>
                <div className="text-base font-semibold text-gray-900">{customerName}</div>
                {customerMobile && <div className="text-sm text-gray-500">{customerMobile}</div>}
                {pawCardSavings?.hasPawCard && (
                  <div className="mt-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs text-teal-900">
                    <span className="mr-1" aria-hidden>🐾</span>
                    Paw Card member — {formatCurrency(pawCardSavings.totalSaved)} total savings across{' '}
                    {pawCardSavings.entryCount} {pawCardSavings.entryCount === 1 ? 'visit' : 'visits'}
                  </div>
                )}
              </div>
              {vehicleNames && (
                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">Vehicle</div>
                  <div className="text-base font-semibold text-gray-900">{vehicleNames}</div>
                </div>
              )}
              {returnDatetime && (
                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">Return date</div>
                  <div className="text-base font-semibold text-gray-900">
                    {new Date(returnDatetime).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
              <div className="ml-auto">
                <Badge color={statusVal === 'active' ? 'blue' : statusVal === 'completed' ? 'green' : 'gray'} className="text-sm">
                  {String(statusVal)}
                </Badge>
              </div>
            </div>
          </div>

          {/* Pricing breakdown */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Pricing Breakdown</h3>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
              <div className="flex justify-between px-4 py-2">
                <span className="text-gray-600">Rental subtotal</span>
                <span>{formatCurrency(rentalSubtotal)}</span>
              </div>
              {addonTotal > 0 && (
                <div className="flex justify-between px-4 py-2">
                  <span className="text-gray-600">Add-ons</span>
                  <span>{formatCurrency(addonTotal)}</span>
                </div>
              )}
              {securityDeposit > 0 && (
                <div className="flex justify-between px-4 py-2">
                  <span className="text-gray-600">Security deposit</span>
                  <span>{formatCurrency(securityDeposit)}</span>
                </div>
              )}
              {surcharge > 0 && (
                <div className="flex justify-between px-4 py-2">
                  <span className="text-gray-600">Card surcharge</span>
                  <span>{formatCurrency(surcharge)}</span>
                </div>
              )}
              <div className="flex justify-between px-4 py-2 font-semibold">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between px-4 py-2">
                <span className="text-gray-600">Payments received</span>
                <span className="text-green-600">−{formatCurrency(totalPaid)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 font-semibold">
                <span>Balance due</span>
                <span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>{formatCurrency(balance)}</span>
              </div>
            </div>
          </div>

          {/* Details grid */}
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {wooOrderId && (
              <div>
                <dt className="text-gray-500">Order Ref</dt>
                <dd className="font-medium">{wooOrderId}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">Order ID</dt>
              <dd className="font-mono text-xs">{order.id}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Order date</dt>
              <dd>{formatDate(order.orderDate)}</dd>
            </div>
            {paymentMethodName && (
              <div>
                <dt className="text-gray-500">Payment method</dt>
                <dd>{paymentMethodName}</dd>
              </div>
            )}
          </dl>

          {order.webNotes && (
            <div>
              <dt className="text-sm text-gray-500">Notes</dt>
              <dd className="mt-1 rounded bg-gray-50 p-2 text-sm">{order.webNotes}</dd>
            </div>
          )}

          {/* ── Action sections (only for active orders) ── */}
          {canAct && (
            <div className="mt-6 space-y-6 border-t border-gray-200 pt-6">

              {/* ─── COLLECT PAYMENT ─── */}
              <section>
                <h3 className="mb-3 font-medium text-gray-900">Collect Payment</h3>
                <form onSubmit={handleCollectPayment} className="space-y-3">
                  <div className="flex flex-wrap items-end gap-4">
                    <label className="block">
                      <span className="text-sm text-gray-600">Amount</span>
                      <input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required
                        placeholder={balance > 0 ? String(balance) : '0'}
                        className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </label>
                    <label className="block">
                      <span className="text-sm text-gray-600">Method</span>
                      <select value={paymentMethodId} onChange={(e) => { setPaymentMethodId(e.target.value); setPaymentAccountId(''); setSettlementRef(''); }} required
                        className="mt-1 block w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">Select method</option>
                        {activePaymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                      </select>
                    </label>
                    {paymentMethodId && isCardPayment && (
                      <label className="block">
                        <span className="text-sm text-gray-600">Card Reference #</span>
                        <input type="text" value={settlementRef} onChange={(e) => setSettlementRef(e.target.value)}
                          placeholder="Terminal receipt #"
                          className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </label>
                    )}
                    {paymentMethodId && !isCardPayment && !routedCollectAcct && (
                      <label className="block">
                        <span className="text-sm text-gray-600">Account</span>
                        <select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} required
                          className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="">Select</option>
                          {paymentAccountOptions.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.name)}</option>)}
                        </select>
                        <p className="mt-1 text-xs text-amber-600">No routing rule — select manually</p>
                      </label>
                    )}
                    <button type="submit" disabled={collectPaymentMut.isPending}
                      className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {collectPaymentMut.isPending ? 'Saving...' : 'Record Payment'}
                    </button>
                  </div>
                  {collectPaymentMut.error && <p className="text-sm text-red-600">{(collectPaymentMut.error as Error).message}</p>}
                </form>
              </section>

              {/* ─── EXTEND BOOKING ─── */}
              <section>
                <h3 className="mb-3 font-medium text-gray-900">Extend Booking</h3>
                <p className="mb-3 text-sm text-gray-500">
                  Push the return date forward for this customer without them needing to use the website.
                </p>
                <button
                  type="button"
                  onClick={() => setExtendOpen(true)}
                  className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
                >
                  Extend Return Date…
                </button>
              </section>

              {/* ─── SWAP VEHICLE ─── */}
              <section>
                <h3 className="mb-3 font-medium text-gray-900">Swap Vehicle</h3>
                <form onSubmit={handleSwapVehicle} className="flex flex-wrap items-end gap-4">
                  <div className="block">
                    <span className="text-sm text-gray-600">Current vehicle</span>
                    <div className="mt-1 flex h-9 w-48 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                      {itemsList[0]?.vehicleName ?? '—'}
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-sm text-gray-600">New vehicle</span>
                    <select value={swapNewVehicleId} onChange={(e) => setSwapNewVehicleId(e.target.value)} required
                      className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <option value="">Select available vehicle</option>
                      {availableVehicles.map((v) => (
                        <option key={String(v.id)} value={String(v.id)}>{String(v.name)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm text-gray-600">Reason</span>
                    <input type="text" value={swapReason} onChange={(e) => setSwapReason(e.target.value)} required placeholder="e.g. customer request"
                      className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </label>
                  <button type="submit" disabled={swapVehicle.isPending || !itemsList[0]}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {swapVehicle.isPending ? 'Swapping...' : 'Swap Vehicle'}
                  </button>
                </form>
                {swapVehicle.error && <p className="mt-2 text-sm text-red-600">{(swapVehicle.error as Error).message}</p>}
              </section>

              {/* ─── SETTLE ORDER ─── */}
              <section>
                <h3 className="mb-3 font-medium text-gray-900">Settle Order</h3>

                {(() => {
                  const depositApplied = Math.min(securityDeposit, Math.max(0, balance));
                  const depositRefund = Math.max(0, securityDeposit - Math.max(0, balance));
                  const remainingAfterDeposit = Math.max(0, balance - depositApplied);
                  const isFullyPaid = remainingAfterDeposit <= 0 && depositRefund <= 0;

                  const refundReady = depositRefund <= 0 || (!!settleRefundMethodId && !!effectiveRefundAccountId.trim());
                  const finalPayReady = remainingAfterDeposit <= 0 || (!!settleFinalMethodId && (isSettleFinalCard || !!settleFinalAccountId));
                  const settleReady = !!settleDepositAccountId && !!settleReceivableAccountId && refundReady && finalPayReady;

                  return (
                    <div className="space-y-4">
                      {/* Settlement summary */}
                      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
                        <div className="flex justify-between px-4 py-2.5">
                          <span className="text-gray-600">Order Total</span>
                          <span className="font-medium">{formatCurrency(total)}</span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5">
                          <span className="text-gray-600">Total Paid</span>
                          <span className="font-medium text-green-600">{formatCurrency(totalPaid)}</span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5">
                          <span className="font-medium text-gray-900">Balance Due</span>
                          <span className={`font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(Math.max(0, balance))}</span>
                        </div>
                        {securityDeposit > 0 && (
                          <div className="flex justify-between px-4 py-2.5">
                            <span className="text-gray-600">Security Deposit Held</span>
                            <span className="font-medium">{formatCurrency(securityDeposit)}</span>
                          </div>
                        )}
                        {depositRefund > 0 && (
                          <div className="flex justify-between px-4 py-2.5 bg-amber-50">
                            <span className="font-medium text-amber-800">Deposit to Refund</span>
                            <span className="font-bold text-amber-800">{formatCurrency(depositRefund)}</span>
                          </div>
                        )}
                      </div>

                      {/* Fully settled — green message */}
                      {isFullyPaid && (
                        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-center">
                          <p className="text-sm font-medium text-green-800">Order is fully settled — no payment or refund needed</p>
                        </div>
                      )}

                      {/* Final payment section */}
                      {remainingAfterDeposit > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                          <p className="text-sm font-medium text-amber-900">
                            Final payment of {formatCurrency(remainingAfterDeposit)} required
                          </p>
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="block">
                              <span className="text-xs font-medium text-amber-800">Payment Method</span>
                              <select value={settleFinalMethodId} onChange={(e) => { setSettleFinalMethodId(e.target.value); setSettleFinalAccountId(''); setSettleFinalRef(''); }} required
                                className="mt-1 block w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                                <option value="">Select method</option>
                                {activePaymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                              </select>
                            </label>
                            {settleFinalMethodId && !isSettleFinalCard && !routedSettleFinalAcct && (
                              <label className="block">
                                <span className="text-xs font-medium text-amber-800">Account</span>
                                <select value={settleFinalAccountId} onChange={(e) => setSettleFinalAccountId(e.target.value)} required
                                  className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                                  <option value="">Select</option>
                                  {paymentAccountOptions.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.name)}</option>)}
                                </select>
                                <p className="mt-1 text-xs text-amber-600">No routing rule — select manually</p>
                              </label>
                            )}
                            {settleFinalMethodId && isSettleFinalCard && (
                              <label className="block">
                                <span className="text-xs font-medium text-amber-800">Card Reference #</span>
                                <input type="text" value={settleFinalRef} onChange={(e) => setSettleFinalRef(e.target.value)}
                                  placeholder="Terminal receipt #"
                                  className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                              </label>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Deposit refund section */}
                      {depositRefund > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                          <p className="text-sm font-medium text-amber-900">
                            Refund {formatCurrency(depositRefund)} deposit to customer
                          </p>
                          <label className="block">
                            <span className="text-xs font-medium text-amber-800">How are you returning the deposit?</span>
                            <select
                              value={settleRefundMethodId}
                              onChange={(e) => { setSettleRefundMethodId(e.target.value); setSettleRefundAccountId(''); }}
                              required
                              className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            >
                              <option value="">Select method</option>
                              {refundPaymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                            </select>
                          </label>
                          {settleRefundMethodId && !routedRefundResolved && (
                            <label className="block">
                              <span className="text-xs font-medium text-amber-800">Refund Account</span>
                              <select value={settleRefundAccountId} onChange={(e) => setSettleRefundAccountId(e.target.value)} required
                                className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                                <option value="">Select</option>
                                {refundAccountOptions.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.name)}</option>)}
                              </select>
                              <p className="mt-1 text-xs text-amber-600">No routing rule — select manually</p>
                            </label>
                          )}
                        </div>
                      )}

                      {/* Settle button */}
                      <form onSubmit={handleSettle}>
                        <button type="submit"
                          disabled={settleOrder.isPending || !settleReady}
                          className="w-full rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {settleOrder.isPending ? 'Settling...' : remainingAfterDeposit > 0 ? `Settle Order — Collect ${formatCurrency(remainingAfterDeposit)}` : 'Settle Order'}
                        </button>
                      </form>
                      {settleOrder.error && <p className="text-sm text-red-600">{(settleOrder.error as Error).message}</p>}
                    </div>
                  );
                })()}
              </section>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ PAYMENTS TAB ═══════════════════ */}
      {tab === 'payments' && (
        <div className="space-y-2">
          {(payments as unknown[]).length === 0 ? (
            <p className="text-sm text-gray-500">No payments recorded.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">Method</th>
                  <th className="pb-2">Ref</th>
                </tr>
              </thead>
              <tbody>
                {(payments as Array<{ transactionDate: string; amount: number; paymentMethodId: string; paymentType?: string; settlementStatus?: string | null; settlementRef?: string | null }>).map((p, idx) => {
                  const isExt = p.paymentType === 'extension';
                  return (
                    <tr key={idx} className={`border-b hover:bg-gray-50 ${isExt ? 'bg-amber-50' : ''}`}>
                      <td className="py-2 pr-4">{formatDate(p.transactionDate)}</td>
                      <td className="py-2 pr-4">
                        {isExt ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Extension</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.settlementStatus === 'pending' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {p.settlementStatus === 'pending' ? 'Unpaid' : 'Paid'}
                            </span>
                          </span>
                        ) : (
                          <span className="capitalize">{p.paymentType ?? 'rental'}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-medium">{formatCurrency(p.amount)}</td>
                      <td className="py-2 pr-4">{isExt && p.paymentMethodId === 'pending' ? '—' : (pmLookup.get(p.paymentMethodId)?.name ?? p.paymentMethodId)}</td>
                      <td className="py-2 text-gray-500">{p.settlementRef ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-2 pr-4" colSpan={2}>Total Paid</td>
                  <td className="py-2 pr-4">{formatCurrency(totalPaid)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ═══════════════════ VEHICLES TAB ═══════════════════ */}
      {tab === 'vehicles' && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Current Assignments</h3>
            {itemsList.length === 0 ? (
              <p className="text-sm text-gray-500">No vehicle assignments.</p>
            ) : (
              <div className="space-y-3">
                {itemsList.map((i) => {
                  const isEditing = editingItemId === i.id;
                  return (
                    <div key={i.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-900">{i.vehicleName}</div>
                        <div className="text-sm text-gray-500">
                          {i.rentalDaysCount} day{i.rentalDaysCount !== 1 ? 's' : ''} × {formatCurrency(i.rentalRate)} = {formatCurrency((i.rentalRate ?? 0) * (i.rentalDaysCount ?? 0))}
                        </div>
                      </div>

                      {!isEditing ? (
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                          <span>Pickup: {formatDate(i.pickupDatetime)}</span>
                          <span>Dropoff: {formatDate(i.dropoffDatetime)}</span>
                          {canAct && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItemId(i.id);
                                setEditPickup(i.pickupDatetime ? new Date(i.pickupDatetime).toISOString().slice(0, 16) : '');
                                setEditDropoff(i.dropoffDatetime ? new Date(i.dropoffDatetime).toISOString().slice(0, 16) : '');
                              }}
                              className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-800"
                            >
                              Adjust Dates
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
                          <div className="flex flex-wrap gap-4">
                            <label className="block">
                              <span className="text-xs font-medium text-gray-600">Pickup</span>
                              <input
                                type="datetime-local"
                                value={editPickup}
                                onChange={(e) => setEditPickup(e.target.value)}
                                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-medium text-gray-600">Dropoff</span>
                              <input
                                type="datetime-local"
                                value={editDropoff}
                                onChange={(e) => setEditDropoff(e.target.value)}
                                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </label>
                          </div>
                          {editPickup && editDropoff && (() => {
                            const ms = new Date(editDropoff).getTime() - new Date(editPickup).getTime();
                            const newDays = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
                            const daysDiff = newDays - i.rentalDaysCount;
                            const priceDiff = daysDiff * (i.rentalRate ?? 0);
                            return (
                              <div className={`text-sm ${daysDiff > 0 ? 'text-amber-700' : daysDiff < 0 ? 'text-green-700' : 'text-gray-600'}`}>
                                {newDays} day{newDays !== 1 ? 's' : ''}
                                {daysDiff !== 0 && (
                                  <span className="ml-2 font-medium">
                                    ({daysDiff > 0 ? '+' : ''}{daysDiff} day{Math.abs(daysDiff) !== 1 ? 's' : ''}, {daysDiff > 0 ? '+' : ''}{formatCurrency(priceDiff)})
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={adjustDatesMut.isPending || !editPickup || !editDropoff}
                              onClick={() => {
                                adjustDatesMut.mutate(
                                  {
                                    id: orderId,
                                    orderItemId: i.id,
                                    pickupDatetime: new Date(editPickup).toISOString(),
                                    dropoffDatetime: new Date(editDropoff).toISOString(),
                                  },
                                  { onSuccess: () => setEditingItemId(null) },
                                );
                              }}
                              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {adjustDatesMut.isPending ? 'Saving...' : 'Save Dates'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingItemId(null)}
                              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                          {adjustDatesMut.error && <p className="text-sm text-red-600">{(adjustDatesMut.error as Error).message}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {(swaps as Array<{ id: string; oldVehicleName: string; newVehicleName: string; swapDate: string; swapTime: string; reason: string }>).length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Swap History</h3>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">From</th>
                    <th className="pb-2 pr-4">To</th>
                    <th className="pb-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(swaps as Array<{ id: string; oldVehicleName: string; newVehicleName: string; swapDate: string; swapTime: string; reason: string }>).map((s) => (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-4">{formatDate(s.swapDate)}{s.swapTime ? ` ${s.swapTime.slice(0, 5)}` : ''}</td>
                      <td className="py-2 pr-4 text-red-600">{s.oldVehicleName ?? '—'}</td>
                      <td className="py-2 pr-4 text-green-600">{s.newVehicleName ?? '—'}</td>
                      <td className="py-2 text-gray-600">{s.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ ADDONS TAB ═══════════════════ */}
      {tab === 'addons' && (
        <div className="space-y-6">
          {/* Current add-ons */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Current Add-ons</h3>
            {(orderAddons ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No add-ons on this order.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Add-on</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Price</th>
                    <th className="pb-2 pr-4">Qty</th>
                    <th className="pb-2 pr-4">Total</th>
                    {canAct && <th className="pb-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {(orderAddons ?? []).map((a) => {
                    const isMarkedForRemoval = pendingAddonRemoves.includes(a.id);
                    return (
                      <tr key={a.id} className={`border-b hover:bg-gray-50 ${isMarkedForRemoval ? 'opacity-40 line-through' : ''}`}>
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
                              className={`text-xs font-medium ${isMarkedForRemoval ? 'text-blue-600 hover:text-blue-800' : 'text-red-600 hover:text-red-800'}`}
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
                    <td className="py-2" colSpan={canAct ? 2 : 1}>{formatCurrency((orderAddons ?? []).reduce((s, a) => s + (a.totalAmount ?? 0), 0))}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Available add-ons to toggle */}
          {canAct && (configAddons ?? []).length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Available Add-ons</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(configAddons ?? [])
                  .filter((ca) => ca.isActive !== false && ca.is_active !== false)
                  .map((ca) => {
                    const type = (ca.addonType ?? ca.addon_type ?? 'one_time') as string;
                    const price = type === 'per_day' ? Number(ca.pricePerDay ?? ca.price_per_day ?? 0) : Number(ca.priceOneTime ?? ca.price_one_time ?? 0);
                    const total = type === 'per_day' ? price * rentalDays : price;
                    const isOnOrder = activeOrderAddonNames.has(ca.name.toLowerCase()) && !pendingAddonRemoves.some((id) => (orderAddons ?? []).find((a) => a.id === id)?.addonName.toLowerCase() === ca.name.toLowerCase());
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
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div>
                          <div className="font-medium">{ca.name}</div>
                          <div className="text-xs text-gray-500">
                            {type === 'per_day' ? `${formatCurrency(price)}/day × ${rentalDays} days` : formatCurrency(price)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatCurrency(total)}</div>
                          {isOnOrder && <span className="text-xs text-green-600">Active</span>}
                          {isPendingAdd && <span className="text-xs text-blue-600">Adding</span>}
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
                  {pendingAddonRemoves.map((id) => (orderAddons ?? []).find((a) => a.id === id)?.addonName ?? id).join(', ')}
                </div>
              )}

              {pendingAddonAdds.length > 0 && (
                <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-blue-200">
                  <label className="block">
                    <span className="text-xs font-medium text-blue-800">Payment Method</span>
                    <select value={addonPaymentMethodId} onChange={(e) => { setAddonPaymentMethodId(e.target.value); setAddonAccountId(''); setAddonSettlementRef(''); }} required
                      className="mt-1 block w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="">Select method</option>
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
                      <select value={addonAccountId} onChange={(e) => setAddonAccountId(e.target.value)} required
                        className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                        <option value="">Select</option>
                        {paymentAccountOptions.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.name)}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-amber-600">No routing rule — select manually</p>
                    </label>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveAddons}
                  disabled={modifyAddonsMut.isPending || (pendingAddonAdds.length > 0 && (!addonPaymentMethodId || (!isAddonCardPayment && !addonAccountId)))}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {modifyAddonsMut.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => { setPendingAddonAdds([]); setPendingAddonRemoves([]); setAddonPaymentMethodId(''); setAddonAccountId(''); setAddonSettlementRef(''); }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
              {modifyAddonsMut.error && <p className="text-sm text-red-600">{(modifyAddonsMut.error as Error).message}</p>}
            </div>
          )}
        </div>
      )}

      {/* ─── Extend modal (rendered here so it stacks above the detail modal) ─── */}
      {enrichedData && (
        <ExtendOrderModal
          open={extendOpen}
          onClose={() => setExtendOpen(false)}
          enrichedData={enrichedData}
        />
      )}

      {/* ═══════════════════ HISTORY TAB ═══════════════════ */}
      {tab === 'history' && (
        <div>
          {(history ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">No history events recorded.</p>
          ) : (
            <div className="relative ml-4 border-l-2 border-gray-200 pl-6 space-y-0">
              {(history ?? []).map((evt, idx) => {
                const iconColor =
                  evt.type === 'extension' ? 'bg-orange-500' :
                  evt.type === 'payment' ? 'bg-green-500' :
                  evt.type === 'swap' ? 'bg-amber-500' :
                  evt.type === 'addon' ? 'bg-purple-500' :
                  evt.type === 'settled' ? 'bg-blue-600' :
                  evt.type === 'activated' ? 'bg-blue-500' :
                  'bg-gray-400';

                return (
                  <div key={idx} className="relative pb-6 last:pb-0">
                    <div className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${iconColor}`} />
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{evt.description}</div>
                        {evt.detail && <div className="text-xs text-gray-500">{evt.detail}</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        {evt.amount != null && evt.amount > 0 && (
                          <div className="text-sm font-semibold text-green-600">{formatCurrency(evt.amount)}</div>
                        )}
                        <div className="text-xs text-gray-400">
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleString('en-PH', {
                            timeZone: 'Asia/Manila',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }) : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
