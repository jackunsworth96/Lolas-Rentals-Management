import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '../common/Badge.js';
import { ExtendOrderModal } from './ExtendOrderModal.js';
import { InspectionModal } from './InspectionModal.js';
import { MayaPaymentModal } from './MayaPaymentModal.js';
import { useInspectionByOrder } from '../../api/inspections.js';
import { useCollectPayment, useSettleOrder, useSwapVehicle } from '../../api/orders.js';
import { useFleet } from '../../api/fleet.js';
import { usePaymentMethods, useChartOfAccounts, useFleetStatuses } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatDate, formatDateTime } from '../../utils/date.js';
import { useCustomerPawCardSavings } from '../../api/paw-card.js';
import { useAuthStore } from '../../stores/auth-store.js';
import type { EnrichedOrder } from '../../types/api.js';
import type { OrderAddon, OrderDetail, OrderItem, OrderPayment } from './useOrderDetail.js';

function waiverFetchApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '/api';
  const base = raw.replace(/\/+$/, '');
  if (base.startsWith('http')) return base.endsWith('/api') ? base : `${base}/api`;
  return base || '/api';
}

function moneyAmount(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'object' && 'amount' in val && typeof (val as { amount: number }).amount === 'number') return (val as { amount: number }).amount;
  return Number(val) || 0;
}

interface OrderDetailSummaryTabProps {
  orderId: string;
  storeId: string;
  readOnly: boolean;
  enrichedData?: EnrichedOrder;
  order: OrderDetail;
  items: OrderItem[];
  payments: OrderPayment[];
  orderAddons: OrderAddon[];
  onClose: () => void;
  pushToast: (msg: string, type: 'success' | 'error') => void;
}

export function OrderDetailSummaryTab({
  orderId,
  storeId,
  readOnly,
  enrichedData,
  order,
  items,
  payments,
  orderAddons,
  onClose,
  pushToast,
}: OrderDetailSummaryTabProps) {
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

  // ── Modal open/close ──
  const [extendOpen, setExtendOpen] = useState(false);
  const [inspectionModalOpen, setInspectionModalOpen] = useState(false);
  const [showMayaModal, setShowMayaModal] = useState(false);
  const [sendingWaiverLink, setSendingWaiverLink] = useState(false);

  // ── Data / config queries ──
  const { data: vehicles = [] } = useFleet(storeId);
  const { data: paymentMethods = [] } = usePaymentMethods() as { data: Array<{ id: string; name: string; surchargePercent?: number; surcharge_percent?: number; isActive?: boolean; is_active?: boolean }> | undefined };
  const cardSurchargePercent = Number(paymentMethods.find((m) => m.id === 'Card')?.surcharge_percent ?? paymentMethods.find((m) => m.id === 'Card')?.surchargePercent ?? 0);
  const { data: accounts = [] } = useChartOfAccounts() as { data: Array<Record<string, unknown>> | undefined };
  const { data: fleetStatuses = [] } = useFleetStatuses() as { data: Array<{ id: string; name: string; isRentable?: boolean; is_rentable?: boolean }> | undefined };

  const collectPaymentMut = useCollectPayment();
  const settleOrder = useSettleOrder();
  const swapVehicle = useSwapVehicle();
  const routing = usePaymentRouting();

  const customerEmailForPaw = useMemo(
    () =>
      enrichedData?.customerEmail?.trim() ||
      order?.customerEmail?.trim() ||
      undefined,
    [enrichedData?.customerEmail, order],
  );
  const { data: pawCardSavings } = useCustomerPawCardSavings(customerEmailForPaw);

  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const canEditOrders = useAuthStore((s) => s.hasPermission('can_edit_orders'));

  const { data: inspectionOrderPayload, isLoading: inspectionOrderLoading, refetch: refetchInspection } =
    useInspectionByOrder(orderId);

  const orderStatusStr = String((order?.status as { value?: string } | undefined)?.value ?? order?.status ?? '');
  const isActive = !!order && orderStatusStr === 'active';
  const canAct = isActive && !readOnly;
  /** Handover inspection is allowed for active and confirmed rentals (matches Active orders list). */
  const canStartInspection =
    !readOnly && (orderStatusStr === 'active' || orderStatusStr === 'confirmed');

  // ── Store-filtered accounts (include company-wide accounts) ──
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
    () => new Map(paymentMethods.map((pm) => [pm.id, pm])),
    [paymentMethods],
  );
  const activePaymentMethods = useMemo(
    () => paymentMethods.filter((m) => m.isActive !== false && m.is_active !== false),
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

  // ── Available vehicles for swap ──
  const rentableStatusSet = useMemo(() => {
    const statuses = fleetStatuses;
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

  // ── Derived totals ──
  const total = enrichedData?.finalTotal ?? moneyAmount(order.finalTotal);
  const totalPaid = enrichedData?.totalPaid ?? payments.reduce((s, p) => s + (p.amount ?? 0), 0);
  const balance = Math.max(0, total - totalPaid);

  const wooOrderId = enrichedData?.wooOrderId ?? null;
  const customerName = enrichedData?.customerName ?? order.customerId ?? '—';
  const customerMobile = enrichedData?.customerMobile ?? null;
  const vehicleNames = enrichedData?.vehicleNames ?? null;
  const returnDatetime = enrichedData?.returnDatetime ?? null;
  const securityDeposit = enrichedData?.securityDeposit ?? moneyAmount(order.securityDeposit);
  const surcharge = enrichedData?.cardFeeSurcharge ?? moneyAmount(order.cardFeeSurcharge);
  const paymentMethodName = order.paymentMethodId ? pmLookup.get(order.paymentMethodId)?.name ?? order.paymentMethodId : null;

  const waiverStatus = enrichedData?.waiverStatus ?? 'pending';
  const waiverSignedAt = enrichedData?.waiverSignedAt ?? null;
  const orderRefForWaiver = enrichedData?.bookingToken ?? null;

  const statusVal = (order.status as { value?: string } | undefined)?.value ?? order.status;

  const itemsList = items;
  const rentalSubtotal = itemsList.reduce((sum, i) => sum + (i.rentalRate ?? 0) * (i.rentalDaysCount ?? 0), 0);
  const addonTotal = orderAddons.reduce((sum, a) => sum + (a.totalAmount ?? 0), 0);

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

  const sendWaiverLinkToClipboard = async () => {
    if (!orderRefForWaiver || sendingWaiverLink) return;
    const token = useAuthStore.getState().token;
    if (!token) {
      pushToast('You must be signed in to send a waiver link.', 'error');
      return;
    }
    setSendingWaiverLink(true);
    try {
      const res = await fetch(`${waiverFetchApiBase()}/waiver/send-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderReference: orderRefForWaiver }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string }; success?: boolean };
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
      }
      const url = json?.url;
      if (!url || typeof url !== 'string') {
        throw new Error('No waiver URL returned');
      }
      await navigator.clipboard.writeText(url);
      pushToast('Waiver link copied to clipboard', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Could not copy waiver link', 'error');
    } finally {
      setSendingWaiverLink(false);
    }
  };

  return (
    <>
      <div className="space-y-5">
        {/* Customer & Vehicle header */}
        <div className="rounded-lg bg-sand-brand p-4">
          <div className="flex flex-wrap gap-6">
            <div className="min-w-0 max-w-md">
              <div className="text-xs font-medium uppercase text-charcoal-brand/60">Customer</div>
              <div className="text-base font-semibold text-gray-900">{customerName}</div>
              {customerMobile && <div className="text-sm text-charcoal-brand/60">{customerMobile}</div>}
              {customerEmailForPaw && <div className="text-sm text-charcoal-brand/60">{customerEmailForPaw}</div>}
              {pawCardSavings?.hasPawCard && (
                <div className="mt-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs text-teal-900">
                  <span className="mr-1" aria-hidden>🐾</span>
                  Paw Card member — {formatCurrency(pawCardSavings.totalSaved)} total savings across{' '}
                  {pawCardSavings.entryCount} {pawCardSavings.entryCount === 1 ? 'visit' : 'visits'}
                </div>
              )}
            </div>

            {enrichedData && (
              <div className="min-w-0 max-w-xs">
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase text-charcoal-brand/60">Waiver</div>
                  {waiverStatus === 'signed' ? (
                    <div className="mt-2 flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Waiver signed</div>
                        {waiverSignedAt && (
                          <div className="text-xs text-gray-600">{formatDateTime(waiverSignedAt)}</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                        <div className="text-sm font-semibold text-gray-900">
                          {waiverStatus === 'expired' ? 'Waiver expired' : 'Waiver not yet signed'}
                        </div>
                      </div>
                      {orderRefForWaiver && canEditOrders ? (
                        <button
                          type="button"
                          disabled={sendingWaiverLink}
                          onClick={() => void sendWaiverLinkToClipboard()}
                          className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-sand-brand disabled:opacity-50"
                        >
                          {sendingWaiverLink ? 'Working…' : 'Send waiver link'}
                        </button>
                      ) : !orderRefForWaiver ? (
                        <p className="mt-2 text-xs text-charcoal-brand/60">No booking reference on this order.</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="min-w-0 max-w-xs">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase text-charcoal-brand/60">Inspection</div>
                {inspectionOrderLoading ? (
                  <p className="mt-2 text-sm text-charcoal-brand/60">Loading…</p>
                ) : inspectionOrderPayload?.exists && inspectionOrderPayload.inspection?.status === 'completed' ? (
                  <div className="mt-2 flex items-start gap-2">
                    <span className="text-lg leading-none" aria-hidden>
                      ✅
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Inspection completed</div>
                      {inspectionOrderPayload.inspection?.createdAt && (
                        <div className="text-xs text-gray-600">
                          {formatDateTime(String(inspectionOrderPayload.inspection.createdAt))}
                        </div>
                      )}
                      {inspectionOrderPayload.inspection?.vehicleName && (
                        <div className="mt-1 text-xs text-gray-600">
                          Vehicle: {inspectionOrderPayload.inspection.vehicleName}
                        </div>
                      )}
                    </div>
                  </div>
                ) : inspectionOrderPayload?.exists && inspectionOrderPayload.inspection?.status === 'pending' ? (
                  <p className="mt-2 text-sm text-amber-800">Inspection in progress (not completed).</p>
                ) : (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">No inspection on record</p>
                    {canStartInspection && (
                      <button
                        type="button"
                        onClick={() => setInspectionModalOpen(true)}
                        className="mt-3 w-full rounded-lg border border-teal-brand bg-white px-3 py-2 text-sm font-medium text-teal-brand hover:bg-teal-50"
                      >
                        Start Inspection
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {vehicleNames && (
              <div>
                <div className="text-xs font-medium uppercase text-charcoal-brand/60">Vehicle</div>
                <div className="text-base font-semibold text-gray-900">{vehicleNames}</div>
              </div>
            )}
            {returnDatetime && (
              <div>
                <div className="text-xs font-medium uppercase text-charcoal-brand/60">Return date</div>
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
          <h3 className="mb-2 text-sm font-medium text-charcoal-brand">Pricing Breakdown</h3>
          <div className="rounded-lg border border-gray-200 divide-y divide-sand-brand text-sm">
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
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {wooOrderId && (
            <div>
              <dt className="text-charcoal-brand/60">Order Ref</dt>
              <dd className="font-medium">{wooOrderId}</dd>
            </div>
          )}
          <div>
            <dt className="text-charcoal-brand/60">Order ID</dt>
            <dd className="font-mono text-xs">{order.id}</dd>
          </div>
          <div>
            <dt className="text-charcoal-brand/60">Order date</dt>
            <dd>{order.orderDate ? formatDate(order.orderDate) : '—'}</dd>
          </div>
          {paymentMethodName && (
            <div>
              <dt className="text-charcoal-brand/60">Payment method</dt>
              <dd>{paymentMethodName}</dd>
            </div>
          )}
        </dl>

        {order.webNotes && (
          <div>
            <dt className="text-sm text-charcoal-brand/60">Notes</dt>
            <dd className="mt-1 rounded bg-sand-brand p-2 text-sm">{order.webNotes}</dd>
          </div>
        )}

        {/* ── Action sections (only for active orders) ── */}
        {canAct && (
          <div className="mt-6 space-y-6 border-t border-gray-200 pt-6">

            {/* ─── COLLECT PAYMENT ─── */}
            <section>
              <h3 className="mb-3 font-medium text-gray-900">Collect Payment</h3>
              <form onSubmit={handleCollectPayment} className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-end gap-4">
                  <label className="block">
                    <span className="text-sm text-gray-600">Amount</span>
                    <input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required
                      placeholder={balance > 0 ? String(balance) : '0'}
                      className="mt-1 block w-full sm:w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </label>
                  <label className="block">
                    <span className="text-sm text-gray-600">Method</span>
                    <select value={paymentMethodId} onChange={(e) => { setPaymentMethodId(e.target.value); setPaymentAccountId(''); setSettlementRef(''); }} required
                      className="mt-1 block w-full sm:w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      <option value="">Select method</option>
                      {activePaymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                    </select>
                  </label>
                  {paymentMethodId && isCardPayment && (
                    <label className="block">
                      <span className="text-sm text-gray-600">Card Reference #</span>
                      <input type="text" value={settlementRef} onChange={(e) => setSettlementRef(e.target.value)}
                        placeholder="Terminal receipt #"
                        className="mt-1 block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </label>
                  )}
                  {paymentMethodId && !isCardPayment && !routedCollectAcct && (
                    <label className="block">
                      <span className="text-sm text-gray-600">Account</span>
                      <select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} required
                        className="mt-1 block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">Select</option>
                        {paymentAccountOptions.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.name)}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-amber-600">No routing rule — select manually</p>
                    </label>
                  )}
                  <button type="submit" disabled={collectPaymentMut.isPending}
                    className="w-full sm:w-auto rounded-lg bg-teal-brand px-5 py-2 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50">
                    {collectPaymentMut.isPending ? 'Saving...' : 'Record Payment'}
                  </button>
                </div>
                {collectPaymentMut.error && <p className="text-sm text-red-600">{(collectPaymentMut.error as Error).message}</p>}
              </form>
            </section>

            {/* ─── REQUEST PAYMENT VIA MAYA ─── */}
            <section>
              <h3 className="mb-3 font-medium text-gray-900">Request Payment via Maya</h3>
              <p className="mb-3 text-sm text-charcoal-brand/60">
                Generate a hosted Maya checkout link to send to the customer for online card payment.
              </p>
              <button
                type="button"
                onClick={() => setShowMayaModal(true)}
                className="flex w-full sm:w-auto items-center gap-2 rounded-lg border border-green-600 px-5 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                Request Payment via Maya…
              </button>
            </section>

            {/* ─── EXTEND BOOKING ─── */}
            <section>
              <h3 className="mb-3 font-medium text-gray-900">Extend Booking</h3>
              <p className="mb-3 text-sm text-charcoal-brand/60">
                Push the return date forward for this customer without them needing to use the website.
              </p>
              <button
                type="button"
                onClick={() => setExtendOpen(true)}
                className="w-full sm:w-auto rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
              >
                Extend Return Date…
              </button>
            </section>

            {/* ─── SWAP VEHICLE ─── */}
            <section>
              <h3 className="mb-3 font-medium text-gray-900">Swap Vehicle</h3>
              <form onSubmit={handleSwapVehicle} className="flex flex-col sm:flex-row sm:flex-wrap items-end gap-4">
                <div className="block">
                  <span className="text-sm text-gray-600">Current vehicle</span>
                  <div className="mt-1 flex h-9 w-full sm:w-48 items-center rounded-lg border border-gray-200 bg-sand-brand px-3 text-sm text-charcoal-brand">
                    {itemsList[0]?.vehicleName ?? '—'}
                  </div>
                </div>
                <label className="block">
                  <span className="text-sm text-gray-600">New vehicle</span>
                  <select value={swapNewVehicleId} onChange={(e) => setSwapNewVehicleId(e.target.value)} required
                    className="mt-1 block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Select available vehicle</option>
                    {availableVehicles.map((v) => (
                      <option key={String(v.id)} value={String(v.id)}>{String(v.name)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-gray-600">Reason</span>
                  <input type="text" value={swapReason} onChange={(e) => setSwapReason(e.target.value)} required placeholder="e.g. customer request"
                    className="mt-1 block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </label>
                <button type="submit" disabled={swapVehicle.isPending || !itemsList[0]}
                  className="w-full sm:w-auto rounded-lg bg-teal-brand px-5 py-2 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50">
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
                    <div className="rounded-lg border border-gray-200 divide-y divide-sand-brand text-sm">
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
                        <div className="flex flex-col sm:flex-row sm:flex-wrap items-end gap-3">
                          <label className="block">
                            <span className="text-xs font-medium text-amber-800">Payment Method</span>
                            <select value={settleFinalMethodId} onChange={(e) => { setSettleFinalMethodId(e.target.value); setSettleFinalAccountId(''); setSettleFinalRef(''); }} required
                              className="mt-1 block w-full sm:w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                              <option value="">Select method</option>
                              {activePaymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                            </select>
                          </label>
                          {settleFinalMethodId && !isSettleFinalCard && !routedSettleFinalAcct && (
                            <label className="block">
                              <span className="text-xs font-medium text-amber-800">Account</span>
                              <select value={settleFinalAccountId} onChange={(e) => setSettleFinalAccountId(e.target.value)} required
                                className="mt-1 block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm">
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
                                className="mt-1 block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
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
                            className="mt-1 block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          >
                            <option value="">Select method</option>
                            {refundPaymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                          </select>
                        </label>
                        {settleRefundMethodId && !routedRefundResolved && (
                          <label className="block">
                            <span className="text-xs font-medium text-amber-800">Refund Account</span>
                            <select value={settleRefundAccountId} onChange={(e) => setSettleRefundAccountId(e.target.value)} required
                              className="mt-1 block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm">
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

      {/* ─── Extend modal (rendered here so it stacks above the detail modal) ─── */}
      {enrichedData && (
        <ExtendOrderModal
          open={extendOpen}
          onClose={() => setExtendOpen(false)}
          enrichedData={enrichedData}
        />
      )}

      {inspectionModalOpen &&
        createPortal(
          <InspectionModal
            open={inspectionModalOpen}
            onClose={() => setInspectionModalOpen(false)}
            orderId={orderId}
            orderReference={enrichedData?.bookingToken ?? enrichedData?.wooOrderId ?? orderId}
            storeId={storeId}
            employeeName={authUser?.username ?? 'Staff'}
            onComplete={() => {
              void refetchInspection();
              void queryClient.invalidateQueries({ queryKey: ['orders', 'enriched'] });
            }}
          />,
          document.body,
        )}

      <MayaPaymentModal
        isOpen={showMayaModal}
        onClose={() => setShowMayaModal(false)}
        orderId={order.id ?? orderId}
        orderReference={String(order.booking_token ?? orderId)}
        balanceDue={Number(order.balance_due ?? 0)}
        cardSurchargePercent={cardSurchargePercent}
      />
    </>
  );
}
