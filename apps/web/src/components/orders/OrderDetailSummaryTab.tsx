import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, Phone, MessageCircle } from 'lucide-react';
import { Badge } from '../common/Badge.js';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { ExtendOrderModal } from './ExtendOrderModal.js';
import { InspectionModal } from './InspectionModal.js';
import { MayaPaymentModal } from './MayaPaymentModal.js';
import { WaiverViewModal } from './WaiverViewModal.js';
import { useSignedWaiverDetails, useResendWaiverConfirmation } from '../../api/waivers.js';
import { useInspectionByOrder } from '../../api/inspections.js';
import { useCollectPayment, useRefundOrder, useSettleOrder, useSwapHelmet, useSwapVehicle, useUpdateDropoffNote } from '../../api/orders.js';
import { useFleet } from '../../api/fleet.js';
import { usePaymentMethods, useChartOfAccounts, useFleetStatuses } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatDate, formatDateTime } from '../../utils/date.js';
import { useCustomerPawCardSavings } from '../../api/paw-card.js';
import { useAuthStore } from '../../stores/auth-store.js';
import type { EnrichedOrder } from '../../types/api.js';
import type { HelmetSwap, OrderAddon, OrderDetail, OrderItem, OrderPayment } from './useOrderDetail.js';

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
  helmetSwaps: HelmetSwap[];
  canAct: boolean;
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
  helmetSwaps,
  canAct,
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

  // ── Issue refund state ──
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethodId, setRefundMethodId] = useState('');
  const [refundAccountId, setRefundAccountId] = useState('');
  const [refundReason, setRefundReason] = useState('');

  // ── Settle order state ──
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settleDepositAccountId, setSettleDepositAccountId] = useState('');
  const [settleReceivableAccountId, setSettleReceivableAccountId] = useState('');
  const [settleRefundAccountId, setSettleRefundAccountId] = useState('');
  const [settleRefundMethodId, setSettleRefundMethodId] = useState('');
  const depositRefundDefaultApplied = useRef(false);
  const [settleFinalMethodId, setSettleFinalMethodId] = useState('');
  const [settleFinalAccountId, setSettleFinalAccountId] = useState('');
  const [settleFinalRef, setSettleFinalRef] = useState('');
  const [returnCharges, setReturnCharges] = useState('');
  const [returnChargesNote, setReturnChargesNote] = useState('');
  const [returnChargesMethodId, setReturnChargesMethodId] = useState('');
  const [returnChargesAccountId, setReturnChargesAccountId] = useState('');

  // ── Helmet swap state ──
  const [swappingHelmetItemId, setSwappingHelmetItemId] = useState<string | null>(null);
  const [newHelmetNumbers, setNewHelmetNumbers] = useState('');
  const [helmetSwapReason, setHelmetSwapReason] = useState('');
  const [showHelmetHistory, setShowHelmetHistory] = useState(false);

  // ── Modal open/close ──
  const [extendOpen, setExtendOpen] = useState(false);
  const [inspectionModalOpen, setInspectionModalOpen] = useState(false);
  const [showMayaModal, setShowMayaModal] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [waiverViewOpen, setWaiverViewOpen] = useState(false);
  // ── Refs ──
  const settleRef = useRef<HTMLElement>(null);
  // ── Data / config queries ──
  const { data: vehicles = [] } = useFleet(storeId);
  const { data: paymentMethods = [] } = usePaymentMethods() as { data: Array<{ id: string; name: string; surchargePercent?: number; surcharge_percent?: number; isActive?: boolean; is_active?: boolean }> | undefined };
  const cardSurchargePercent = Number(paymentMethods.find((m) => m.id === 'Card')?.surcharge_percent ?? paymentMethods.find((m) => m.id === 'Card')?.surchargePercent ?? 0);
  const { data: accounts = [] } = useChartOfAccounts() as { data: Array<Record<string, unknown>> | undefined };
  const { data: fleetStatuses = [] } = useFleetStatuses() as { data: Array<{ id: string; name: string; isRentable?: boolean; is_rentable?: boolean }> | undefined };

  const collectPaymentMut = useCollectPayment();
  const refundOrderMut = useRefundOrder();
  const settleOrder = useSettleOrder();
  const swapVehicle = useSwapVehicle();
  const swapHelmetMut = useSwapHelmet();
  const updateDropoffNote = useUpdateDropoffNote();
  const routing = usePaymentRouting();
  const resendWaiverMut = useResendWaiverConfirmation();

  const [dropoffNote, setDropoffNote] = useState(order.dropoffLocationNote ?? '');
  const [dropoffNoteEditing, setDropoffNoteEditing] = useState(false);

  useEffect(() => {
    setDropoffNote(order.dropoffLocationNote ?? '');
  }, [order.dropoffLocationNote]);

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
  const returnChargePaymentMethods = useMemo(
    () => activePaymentMethods.filter((method) => {
      const label = `${method.id} ${method.name}`.toLowerCase();
      return label.includes('cash');
    }),
    [activePaymentMethods],
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
  const returnChargePM = returnChargesMethodId ? pmLookup.get(returnChargesMethodId) : null;
  const routedReturnChargeAcct = returnChargesMethodId
    ? routing.resolveReceivedIntoForStore(storeId, returnChargesMethodId, returnChargePM?.name ?? null)
    : null;
  const effectiveReturnChargeAccountId = routedReturnChargeAcct ?? returnChargesAccountId;
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

  const depositMethodId = enrichedData?.depositMethodId ?? order.depositMethodId ?? null;
  const depositMethodLabel = depositMethodId
    ? pmLookup.get(depositMethodId)?.name ?? depositMethodId
    : null;

  // Returning a deposit through its original method is the common case. Preselect
  // it once when available, while keeping the selector editable for exceptions.
  useEffect(() => {
    if (depositRefundDefaultApplied.current || !depositMethodId) return;
    if (!refundPaymentMethods.some((method) => method.id === depositMethodId)) return;
    depositRefundDefaultApplied.current = true;
    setSettleRefundMethodId(depositMethodId);
  }, [depositMethodId, refundPaymentMethods]);

  useEffect(() => {
    if (routedCollectAcct && !paymentAccountId) setPaymentAccountId(routedCollectAcct);
  }, [routedCollectAcct, paymentAccountId]);
  useEffect(() => {
    if (routedSettleFinalAcct && !settleFinalAccountId) setSettleFinalAccountId(routedSettleFinalAcct);
  }, [routedSettleFinalAcct, settleFinalAccountId]);

  // Auto-fill refund account from routing rules when a refund method is chosen.
  const routedRefundAcct = routing.getReceivedInto(storeId, refundMethodId);
  useEffect(() => {
    if (routedRefundAcct) setRefundAccountId(routedRefundAcct);
    else setRefundAccountId('');
  }, [routedRefundAcct]);
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
    () => vehicles.filter((v) =>
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

  const handleRefund = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(refundAmount);
    if (!amt || amt <= 0 || !refundMethodId || !refundAccountId || !defaultReceivableId) return;
    setShowRefundConfirm(true);
  };

  const handleRefundConfirmed = () => {
    const amt = Number(refundAmount);
    if (!amt || amt <= 0 || !refundMethodId || !refundAccountId || !defaultReceivableId) return;
    refundOrderMut.mutate(
      {
        id: orderId,
        amount: amt,
        refundMethodId,
        refundAccountId,
        receivableAccountId: defaultReceivableId,
        reason: refundReason.trim() || null,
        cancelOrder: false,
        transactionDate: new Date().toISOString().slice(0, 10),
      },
      {
        onSuccess: () => {
          setShowRefundConfirm(false);
          setRefundAmount('');
          setRefundMethodId('');
          setRefundAccountId('');
          setRefundReason('');
          pushToast('Refund recorded successfully.', 'success');
        },
        onError: (err) => {
          setShowRefundConfirm(false);
          pushToast((err as Error).message, 'error');
        },
      },
    );
  };

  const settleFinalPM = settleFinalMethodId ? pmLookup.get(settleFinalMethodId) : null;
  const settleFinalSurcharge = settleFinalPM ? Number(settleFinalPM.surchargePercent ?? settleFinalPM.surcharge_percent ?? 0) : 0;
  const isSettleFinalCard = settleFinalSurcharge > 0;

  // ── Derived totals ──
  // Rules:
  //  • `final_total` = rental + addons + surcharge. Does NOT include deposit
  //    (deposit is tracked separately on `orders.security_deposit`).
  //  • `totalPaid` should reflect only payments toward rental — excluding
  //    deposit payments (held separately) and pending extension IOUs (no cash
  //    received yet).
  //  • Balance = greater of `final_total − totalPaid` and the pending
  //    extension IOU total — the latter acts as a resilient fallback when
  //    `final_total` hasn't been bumped by the extension RPC (migration 091).
  const total = enrichedData?.finalTotal ?? moneyAmount(order.finalTotal);
  const totalPaid = payments.reduce((s, p) => {
    if (p.paymentType === 'deposit') return s;
    // 'pending' → IOU not yet collected. 'absorbed' → rolled into the
    // settlement payment row (captured there, not here). Either way skip.
    if (p.paymentType === 'extension' && (p.settlementStatus === 'pending' || p.settlementStatus === 'absorbed')) return s;
    // Addon with payment_method_id='pending' is an unpaid IOU (collect later) — no cash received yet.
    if (p.paymentType === 'addon' && p.paymentMethodId === 'pending' && p.settlementStatus === 'pending') return s;
    // Refunds reduce the net amount received from the customer.
    if (p.paymentType === 'refund') return s - (p.amount ?? 0);
    return s + (p.amount ?? 0);
  }, 0);
  const pendingExtensionsTotal =
    enrichedData?.pendingExtensionsTotal ??
    payments.reduce((s, p) => {
      const isPending = p.paymentType === 'extension' && p.settlementStatus === 'pending';
      return isPending ? s + (p.amount ?? 0) : s;
    }, 0);
  const balanceFromFinalTotal = Math.max(0, total - totalPaid);
  const balance = Math.max(balanceFromFinalTotal, pendingExtensionsTotal);

  // For completed/cancelled orders the settle RPC writes the authoritative
  // balance back to orders.balance_due (often negative, meaning fully cleared).
  // Using that stored value avoids a misleading "Balance due" when a refund was
  // issued before settling — the payment-derived balance overstates the debt.
  // For active orders we keep the live payment-derived figure.
  const displayBalance = isActive
    ? balance
    : Math.max(0, moneyAmount(order.balance_due));
  const hasExtension =
    enrichedData?.hasExtension ?? payments.some((p) => p.paymentType === 'extension');

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

  const {
    data: signedWaiverDetails,
    isLoading: signedWaiverLoading,
    error: signedWaiverError,
  } = useSignedWaiverDetails(orderRefForWaiver, waiverViewOpen);

  const statusVal = (order.status as { value?: string } | undefined)?.value ?? order.status;

  const itemsList = items;
  // Rental subtotal = original rate × originally-booked days. Extensions are
  // modelled separately so the breakdown stays transparent: you can see what
  // the base rental cost vs what was added through extensions.
  const extensionCharges = payments.reduce((s, p) => {
    if (p.paymentType !== 'extension') return s;
    // 'pending' (unpaid IOU), 'absorbed' (rolled into settlement), null (paid).
    // Include them all — they are real charges regardless of collection status.
    return s + (p.amount ?? 0);
  }, 0);
  const rentalBaseSubtotal = itemsList.reduce(
    (sum, i) => sum + (i.rentalRate ?? 0) * (i.rentalDaysCount ?? 0),
    0,
  );
  // If final_total > base + addons + surcharge + deposit, the difference is
  // attributable to extensions (or back-office adjustments). When extensions
  // have been booked the rentalDaysCount includes extended days — so we must
  // subtract the extension charges to isolate the ORIGINAL rental subtotal.
  const rentalSubtotal = Math.max(0, rentalBaseSubtotal - extensionCharges);
  const addonTotal = orderAddons.reduce((sum, a) => sum + (a.totalAmount ?? 0), 0);

  // Per-day addon adjustments for extended days (e.g. Peace of Mind × extra days).
  // These are included in final_total (via the extension totalDelta RPC param) but are
  // NOT recorded as extension payment rows — they adjust order_addons.total_amount instead.
  // We surface them as the residual: total − rental − extensions − addons − deposit − surcharge.
  const explicitTotal = rentalSubtotal + extensionCharges + addonTotal + securityDeposit + surcharge;
  const addonExtensionAdjustment = Math.round((total - explicitTotal) * 100) / 100;

  // ── Late return & duration ──
  const nowMs = Date.now();
  const returnMs = returnDatetime ? new Date(returnDatetime).getTime() : null;
  const isOverdue = isActive && returnMs !== null && nowMs > returnMs;
  const overdueDays = isOverdue && returnMs !== null
    ? Math.floor((nowMs - returnMs) / (1000 * 60 * 60 * 24))
    : 0;

  const primaryPickupDatetime = itemsList[0]?.pickupDatetime ?? null;
  const pickupMs = primaryPickupDatetime ? new Date(primaryPickupDatetime).getTime() : null;
  const totalRentalDays = itemsList[0]?.rentalDaysCount ?? null;
  const daysElapsed =
    pickupMs !== null && Number.isFinite(pickupMs)
      ? Math.max(1, Math.floor((nowMs - pickupMs) / (1000 * 60 * 60 * 24)) + 1)
      : null;
  const showDuration =
    daysElapsed !== null &&
    totalRentalDays !== null &&
    totalRentalDays > 0 &&
    daysElapsed > 0;

  // ── Jump-to-Settle visibility ──
  // Show only when rental balance is fully paid and there is a deposit to return.
  const showJumpToSettle = canAct && balance === 0 && securityDeposit > 0;

  const handleJumpToSettle = () => {
    settleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Over-payment guard ──
  // Only block when balance > 0; allow recording when balance is already 0
  // (operator may need to record an additional deposit or tip).
  const isOverPayment = paymentAmount !== '' && Number(paymentAmount) > balance && balance > 0;

  const handleSettle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlementDate || !settleDepositAccountId || !settleReceivableAccountId) return;

    const returnChargesAmount = Math.max(0, Number(returnCharges) || 0);

    // Mirror the backend settle-order RPC: refund payments are included as positive
    // amounts in rentalPaid, which can push balance negative (fully overpaid after
    // refund), resulting in the full deposit being returned to the customer.
    const settleRentalPaidH = payments.reduce((s, p) => {
      if (p.paymentType === 'deposit') return s;
      if (p.paymentType === 'extension' && (p.settlementStatus === 'pending' || p.settlementStatus === 'absorbed')) return s;
      if (p.paymentType === 'addon' && p.paymentMethodId === 'pending' && p.settlementStatus === 'pending') return s;
      return s + (p.amount ?? 0);
    }, 0);
    // Return charges are collected separately using their selected tender, so
    // they do not consume the security deposit or alter the rental balance.
    const settleBalanceH = Math.max(0, total - settleRentalPaidH);

    const depositApplied = Math.min(securityDeposit, settleBalanceH);
    const depositRefund = Math.max(0, securityDeposit - settleBalanceH);
    const remainingAfterDeposit = Math.max(0, settleBalanceH - depositApplied);
    const needsFinalPayment = remainingAfterDeposit > 0;

    // Grosses up the customer-facing figure by the card surcharge %
    // so Lola's stops silently absorbing the 5% card fee on card
    // settlements. When the final method is cash/bank this is a no-op.
    const cardFeeSurchargeDelta = needsFinalPayment && isSettleFinalCard
      ? Math.round(remainingAfterDeposit * (settleFinalSurcharge / 100) * 100) / 100
      : 0;
    const inclusiveFinalPaymentAmount = needsFinalPayment
      ? Math.round((remainingAfterDeposit + cardFeeSurchargeDelta) * 100) / 100
      : 0;

    if (depositRefund > 0 && !effectiveRefundAccountId.trim()) return;

    if (returnChargesAmount > 0 && (!returnChargesMethodId || !effectiveReturnChargeAccountId)) return;

    if (needsFinalPayment && !settleFinalMethodId) return;
    if (needsFinalPayment && !isSettleFinalCard && !settleFinalAccountId) return;

    // Safety net: surface outstanding balance to the operator before committing.
    // The button text already shows the amount, but a second explicit confirmation
    // guards against accidental settlement when the customer hasn't paid the
    // extension/final balance yet.
    if (settleBalanceH > 0 || returnChargesAmount > 0) {
      const parts: string[] = [];
      if (returnChargesAmount > 0) {
        const noteLabel = returnChargesNote.trim() ? ` (${returnChargesNote.trim()})` : '';
        const methodLabel = pmLookup.get(returnChargesMethodId)?.name ?? returnChargesMethodId;
        parts.push(`Return Charges${noteLabel}: ${formatCurrency(returnChargesAmount)} via ${methodLabel}`);
      }
      if (settleBalanceH > 0) parts.push(`Rental Balance Due: ${formatCurrency(settleBalanceH)}`);
      if (pendingExtensionsTotal > 0) parts.push(`Unpaid Extensions: ${formatCurrency(pendingExtensionsTotal)}`);
      if (securityDeposit > 0) parts.push(`Security Deposit Held: ${formatCurrency(securityDeposit)}`);
      if (depositApplied > 0) parts.push(`Deposit Applied: ${formatCurrency(depositApplied)}`);
      if (remainingAfterDeposit > 0) {
        if (cardFeeSurchargeDelta > 0) {
          parts.push(`Card surcharge (${settleFinalSurcharge}%): ${formatCurrency(cardFeeSurchargeDelta)}`);
          parts.push(`Card to Collect NOW: ${formatCurrency(inclusiveFinalPaymentAmount)}`);
        } else {
          parts.push(`Cash/Bank to Collect NOW: ${formatCurrency(remainingAfterDeposit)}`);
        }
      }

      const confirmed = window.confirm(
        `⚠ CONFIRM COLLECTION\n\n${parts.join('\n')}\n\nHave all amounts shown above been collected from the customer?\n\nClick OK to proceed with settlement, or Cancel to review.`,
      );
      if (!confirmed) return;
    }

    settleOrder.mutate(
      {
        id: orderId,
        settlementDate,
        depositLiabilityAccountId: settleDepositAccountId,
        receivableAccountId: settleReceivableAccountId,
        refundAccountId: depositRefund > 0 ? effectiveRefundAccountId : settleRefundAccountId,
        depositRefundMethodId: depositRefund > 0 ? (settleRefundMethodId || null) : null,
        finalPaymentMethodId: needsFinalPayment ? settleFinalMethodId : null,
        finalPaymentAccountId: needsFinalPayment && !isSettleFinalCard ? settleFinalAccountId : null,
        finalPaymentAmount: needsFinalPayment ? inclusiveFinalPaymentAmount : undefined,
        isCardPayment: needsFinalPayment ? isSettleFinalCard : undefined,
        cardFeeSurchargeDelta: cardFeeSurchargeDelta > 0 ? cardFeeSurchargeDelta : undefined,
        returnChargesDelta: returnChargesAmount > 0 ? returnChargesAmount : undefined,
        returnChargesNote: returnChargesAmount > 0 && returnChargesNote.trim() ? returnChargesNote.trim() : undefined,
        returnChargesPaymentMethodId: returnChargesAmount > 0 ? returnChargesMethodId : undefined,
        returnChargesAccountId: returnChargesAmount > 0 ? effectiveReturnChargeAccountId : undefined,
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

  const openWaiver = () => {
    if (!orderRefForWaiver) return;
    const url = `${window.location.origin}/waiver/${encodeURIComponent(orderRefForWaiver)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="space-y-5">
        {/* Jump-to-Settle shortcut — shown when balance is clear and deposit awaits return */}
        {showJumpToSettle && (
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2.5">
            <p className="text-sm font-medium text-green-800">
              Balance settled — deposit of {formatCurrency(securityDeposit)} ready to return.
            </p>
            <button
              type="button"
              onClick={handleJumpToSettle}
              className="ml-4 shrink-0 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
            >
              Jump to Settle ↓
            </button>
          </div>
        )}

        {/* Compact summary header */}
        <div className="rounded-lg bg-sand-brand px-4 py-3">
          {/* Row 1 — customer name + contact + badges on the right */}
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="text-sm font-semibold text-gray-900">{customerName}</span>
                {customerMobile && (
                  <>
                    <a href={`tel:${customerMobile}`} className="flex items-center gap-1 text-xs text-charcoal-brand/60 hover:text-teal-brand">
                      <Phone className="h-3 w-3 shrink-0" aria-hidden />
                      {customerMobile}
                    </a>
                    <a
                      href={`https://wa.me/${customerMobile.replace(/^\+/, '').replace(/[\s-]/g, '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800"
                      title="Open in WhatsApp"
                    >
                      <MessageCircle className="h-3 w-3 shrink-0" aria-hidden />
                      WA
                    </a>
                  </>
                )}
                {customerEmailForPaw && <span className="text-xs text-charcoal-brand/60 break-all">{customerEmailForPaw}</span>}
              </div>
              {pawCardSavings?.hasPawCard && (
                <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs text-teal-900">
                  <span aria-hidden>🐾</span>
                  Paw Card — {formatCurrency(pawCardSavings.totalSaved)} across {pawCardSavings.entryCount} {pawCardSavings.entryCount === 1 ? 'visit' : 'visits'}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {enrichedData?.partnerRef && (
                <span title={`Affiliate / partner booking (${enrichedData.partnerRef}) — handle with extra care`} className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">★ Affiliate</span>
              )}
              {enrichedData?.hasNinePmAddon && (
                <span title="9PM late return add-on" className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">9PM</span>
              )}
              {hasExtension && (
                <span title="Rental has been extended" className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Extended</span>
              )}
              {isOverdue && (
                <Badge color="red">Overdue — {overdueDays === 0 ? 'today' : `${overdueDays}d ago`}</Badge>
              )}
              <Badge color={statusVal === 'active' ? 'blue' : statusVal === 'completed' ? 'green' : 'gray'}>
                {String(statusVal)}
              </Badge>
            </div>
          </div>

          {/* Divider */}
          <div className="my-2.5 border-t border-charcoal-brand/10" />

          {/* Row 2 — trip info (vehicle · helmets · collection · return) on the left; waiver + inspection compact inline on the right */}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            {/* Left cluster: vehicle, helmets, collection, return */}
            <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
              {vehicleNames && (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-charcoal-brand/50">Vehicle</div>
                  <div className="text-sm font-semibold text-gray-900">{vehicleNames}</div>
                </div>
              )}
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-charcoal-brand/50">Helmets</div>
                {items.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
                    <span className={`text-sm font-semibold ${i.helmetNumbers ? 'text-gray-900' : 'text-charcoal-brand/40'}`}>{i.helmetNumbers || '—'}</span>
                    {canAct && swappingHelmetItemId !== i.id && (
                      <button
                        type="button"
                        onClick={() => { setSwappingHelmetItemId(i.id); setNewHelmetNumbers(i.helmetNumbers ?? ''); setHelmetSwapReason(''); }}
                        className="text-xs font-medium text-teal-brand hover:text-teal-brand/80"
                      >
                        {i.helmetNumbers ? 'Edit' : 'Assign'}
                      </button>
                    )}
                  </div>
                ))}
                {helmetSwaps.length > 0 && (
                  <button type="button" onClick={() => setShowHelmetHistory((v) => !v)} className="mt-0.5 text-xs text-charcoal-brand/50 hover:text-charcoal-brand underline-offset-2 hover:underline">
                    {showHelmetHistory ? 'Hide history' : `History (${helmetSwaps.length})`}
                  </button>
                )}
              </div>
              {primaryPickupDatetime && (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-charcoal-brand/50">Collection</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {new Date(primaryPickupDatetime).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {itemsList[0]?.pickupLocation && <div className="text-xs text-charcoal-brand/70">{itemsList[0].pickupLocation}</div>}
                </div>
              )}
              {returnDatetime && (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-charcoal-brand/50">Return</div>
                  <div className={`text-sm font-semibold ${isOverdue ? 'text-red-700' : 'text-gray-900'}`}>
                    {new Date(returnDatetime).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {showDuration && (
                    <div className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-charcoal-brand/60'}`}>
                      Day {Math.min(daysElapsed!, totalRentalDays!)} of {totalRentalDays}{isOverdue ? ' (overdue)' : ''}
                    </div>
                  )}
                  {itemsList[0]?.dropoffLocation && <div className="text-xs text-charcoal-brand/70">{itemsList[0].dropoffLocation}</div>}
                </div>
              )}
            </div>

            {/* Right cluster: waiver + inspection as compact inline rows */}
            {enrichedData && (
              <div className="ml-auto flex shrink-0 flex-col gap-2">
                {/* Waiver row */}
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  {waiverStatus === 'signed' ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-gray-900">Waiver signed</span>
                        {waiverSignedAt && <span className="ml-1.5 text-xs text-gray-500">{formatDateTime(waiverSignedAt)}</span>}
                      </div>
                      <div className="ml-2 flex shrink-0 gap-1.5">
                        <button type="button" onClick={() => setWaiverViewOpen(true)} className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-sand-brand">View</button>
                        <button
                          type="button"
                          disabled={resendWaiverMut.isPending}
                          onClick={() => {
                            if (!orderRefForWaiver) return;
                            resendWaiverMut.mutate(orderRefForWaiver, {
                              onSuccess: (data) => pushToast(`Waiver confirmation sent to ${data.sentTo}`, 'success'),
                              onError: (err) => pushToast(err instanceof Error ? err.message : 'Failed to resend', 'error'),
                            });
                          }}
                          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-sand-brand disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {resendWaiverMut.isPending ? '…' : 'Resend'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                      <span className="text-xs font-semibold text-gray-900">
                        {waiverStatus === 'expired' ? 'Waiver expired' : 'Waiver not signed'}
                      </span>
                      {orderRefForWaiver && canEditOrders ? (
                        <button type="button" onClick={openWaiver} className="ml-2 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-sand-brand">
                          Start
                        </button>
                      ) : !orderRefForWaiver ? (
                        <span className="ml-1 text-xs text-charcoal-brand/50">No reference</span>
                      ) : null}
                    </>
                  )}
                </div>

                {/* Inspection row */}
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  {inspectionOrderLoading ? (
                    <span className="text-xs text-charcoal-brand/60">Loading…</span>
                  ) : inspectionOrderPayload?.exists && inspectionOrderPayload.inspection?.status === 'completed' ? (
                    <>
                      <span className="text-sm leading-none shrink-0" aria-hidden>✅</span>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-gray-900">Inspection done</span>
                        {inspectionOrderPayload.inspection?.createdAt && (
                          <span className="ml-1.5 text-xs text-gray-500">{formatDateTime(String(inspectionOrderPayload.inspection.createdAt))}</span>
                        )}
                        {inspectionOrderPayload.inspection?.vehicleName && (
                          <span className="ml-1.5 text-xs text-gray-500">· {inspectionOrderPayload.inspection.vehicleName}</span>
                        )}
                      </div>
                    </>
                  ) : inspectionOrderPayload?.exists && inspectionOrderPayload.inspection?.status === 'pending' ? (
                    <>
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                      <span className="text-xs font-semibold text-amber-800">Inspection in progress</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-gray-500">No inspection</span>
                      <div className="ml-auto flex shrink-0 gap-1.5">
                        {canStartInspection && waiverStatus !== 'signed' && orderRefForWaiver && (
                          <a
                            href={`${window.location.origin}/waiver/${encodeURIComponent(orderRefForWaiver)}`}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                            Sign Waiver ↗
                          </a>
                        )}
                        {canStartInspection && (
                          <button type="button" onClick={() => setInspectionModalOpen(true)} className="rounded border border-teal-brand bg-white px-2 py-0.5 text-xs font-medium text-teal-brand hover:bg-teal-50">
                            Start
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Inline helmet swap form ── */}
        {swappingHelmetItemId && (() => {
          const item = items.find((i) => i.id === swappingHelmetItemId);
          if (!item) return null;
          return (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 space-y-3">
              <p className="text-sm font-medium text-teal-900">
                {item.helmetNumbers ? 'Update helmet numbers' : 'Assign helmet numbers'}
                {items.length > 1 && <span className="ml-1 font-normal text-teal-700">— {item.vehicleName}</span>}
              </p>
              {item.helmetNumbers && (
                <p className="text-xs text-teal-700">
                  Current: <span className="font-medium">{item.helmetNumbers}</span>
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-teal-800">
                    {item.helmetNumbers ? 'New helmet numbers' : 'Helmet numbers'}
                  </span>
                  <input
                    type="text"
                    value={newHelmetNumbers}
                    onChange={(e) => setNewHelmetNumbers(e.target.value)}
                    placeholder="e.g. H34, H35"
                    className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
                  />
                </label>
                <label className="block flex-1 min-w-[160px]">
                  <span className="text-xs font-medium text-teal-800">Reason (optional)</span>
                  <input
                    type="text"
                    value={helmetSwapReason}
                    onChange={(e) => setHelmetSwapReason(e.target.value)}
                    placeholder="e.g. Defective strap"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={swapHelmetMut.isPending || !newHelmetNumbers.trim()}
                  onClick={() => {
                    swapHelmetMut.mutate(
                      { id: orderId, itemId: swappingHelmetItemId, newHelmetNumbers: newHelmetNumbers.trim(), reason: helmetSwapReason.trim() || undefined },
                      {
                        onSuccess: () => {
                          setSwappingHelmetItemId(null);
                          setShowHelmetHistory(true);
                        },
                      },
                    );
                  }}
                  className="rounded-lg bg-teal-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
                >
                  {swapHelmetMut.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setSwappingHelmetItemId(null)}
                  className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-sand-brand"
                >
                  Cancel
                </button>
              </div>
              {swapHelmetMut.error && (
                <p className="text-sm text-red-600">{(swapHelmetMut.error as Error).message}</p>
              )}
            </div>
          );
        })()}

        {/* ── Helmet swap history ── */}
        {showHelmetHistory && helmetSwaps.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-charcoal-brand/60">Helmet History</h4>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-charcoal-brand/60 text-xs">
                  <th className="pb-1.5 pr-4">Date</th>
                  <th className="pb-1.5 pr-4">From</th>
                  <th className="pb-1.5 pr-4">To</th>
                  <th className="pb-1.5">Reason</th>
                </tr>
              </thead>
              <tbody>
                {helmetSwaps.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-4 text-charcoal-brand/60 text-xs">{formatDateTime(s.createdAt)}</td>
                    <td className="py-1.5 pr-4 text-red-600">{s.oldHelmetNumbers || '—'}</td>
                    <td className="py-1.5 pr-4 text-green-700 font-medium">{s.newHelmetNumbers || '—'}</td>
                    <td className="py-1.5 text-charcoal-brand/60">{s.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pricing breakdown */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-charcoal-brand">Pricing Breakdown</h3>
          <div className="rounded-lg border border-gray-200 divide-y divide-sand-brand text-sm">
            <div className="flex justify-between px-4 py-2">
              <span className="text-gray-600">Rental subtotal</span>
              <span>{formatCurrency(rentalSubtotal)}</span>
            </div>
            {extensionCharges > 0 && (
              <div className="flex justify-between px-4 py-2">
                <span className="text-gray-600">Extensions (rental)</span>
                <span>{formatCurrency(extensionCharges)}</span>
              </div>
            )}
            {addonTotal > 0 && (
              <div className="flex justify-between px-4 py-2">
                <span className="text-gray-600">Add-ons</span>
                <span>{formatCurrency(addonTotal)}</span>
              </div>
            )}
            {extensionCharges > 0 && addonExtensionAdjustment > 0.005 && (
              <div className="flex justify-between px-4 py-2">
                <span className="text-gray-600" title="Per-day add-ons adjusted for extended rental days (e.g. Peace of Mind)">
                  Add-on adjustments (ext.)
                </span>
                <span>{formatCurrency(addonExtensionAdjustment)}</span>
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
              <span className="text-gray-600">Payments received (rental)</span>
              <span className="text-green-600">−{formatCurrency(totalPaid)}</span>
            </div>
            {pendingExtensionsTotal > 0 && (
              <div className="flex justify-between px-4 py-2 bg-amber-50">
                <span className="font-medium text-amber-800">Unpaid extensions (IOU)</span>
                <span className="font-bold text-amber-800">+{formatCurrency(pendingExtensionsTotal)}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-2 font-semibold">
              <span>Balance due</span>
              <span className={displayBalance > 0 ? 'text-red-600' : 'text-green-600'}>{formatCurrency(displayBalance)}</span>
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
            <dd className="font-medium">{order.bookingToken ?? order.booking_token ?? order.id}</dd>
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

        {/* ── Dropoff meeting point ── */}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-charcoal-brand/60">Dropoff meeting point</span>
            {!dropoffNoteEditing && canEditOrders && (
              <button
                type="button"
                onClick={() => setDropoffNoteEditing(true)}
                className="text-xs text-teal-brand hover:underline"
              >
                {dropoffNote ? 'Edit' : 'Add'}
              </button>
            )}
          </div>
          {dropoffNoteEditing ? (
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={dropoffNote}
                onChange={(e) => setDropoffNote(e.target.value)}
                placeholder="e.g. Bravo Resort, General Luna"
                maxLength={500}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
              />
              <button
                type="button"
                disabled={updateDropoffNote.isPending}
                onClick={() => {
                  updateDropoffNote.mutate(
                    { id: orderId, note: dropoffNote.trim() || null },
                    { onSuccess: () => setDropoffNoteEditing(false) },
                  );
                }}
                className="rounded bg-teal-brand px-3 py-1 text-sm text-white hover:bg-teal-brand/90 disabled:opacity-50"
              >
                {updateDropoffNote.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setDropoffNote(order.dropoffLocationNote ?? ''); setDropoffNoteEditing(false); }}
                className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <p className="mt-0.5 text-sm">
              {dropoffNote || <span className="italic text-charcoal-brand/40">Not set</span>}
            </p>
          )}
          {updateDropoffNote.error && (
            <p className="mt-1 text-xs text-red-600">{(updateDropoffNote.error as Error).message}</p>
          )}
        </div>

        {/* ── Pickup / return addresses (set when non-store location chosen at booking) ── */}
        {(order.pickupLocationAddress || order.dropoffLocationAddress) && (
          <div className="space-y-2 rounded-lg border border-gray-200 p-4 text-sm">
            <h4 className="text-xs font-medium uppercase tracking-wide text-charcoal-brand/60">Delivery / Collection Addresses</h4>
            {order.pickupLocationAddress && (
              <div>
                <span className="text-charcoal-brand/60">Pickup address: </span>
                <span className="font-medium">{order.pickupLocationAddress}</span>
              </div>
            )}
            {order.dropoffLocationAddress && (
              <div>
                <span className="text-charcoal-brand/60">Return address: </span>
                <span className="font-medium">{order.dropoffLocationAddress}</span>
              </div>
            )}
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
                      className={`mt-1 block w-full sm:w-32 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${isOverPayment ? 'border-red-400 focus:border-red-400 focus:ring-red-400' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`} />
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
                  <button type="submit" disabled={collectPaymentMut.isPending || isOverPayment}
                    className="w-full sm:w-auto rounded-lg bg-teal-brand px-5 py-2 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50">
                    {collectPaymentMut.isPending ? 'Saving...' : 'Record Payment'}
                  </button>
                </div>
                {isOverPayment && (
                  <p className="text-sm font-medium text-red-600">
                    Amount exceeds balance due of {formatCurrency(balance)}
                  </p>
                )}
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

            {/* ─── ISSUE REFUND ─── */}
            <section className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
                <h3 className="font-medium text-red-900">Issue Refund</h3>
              </div>
              <p className="mb-3 text-sm text-red-800/70">
                Record a cash refund to the customer (e.g. early return due to accident). A journal entry is created immediately and cannot be undone.
              </p>
              <form onSubmit={handleRefund} className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-end gap-4">
                  <div className="block">
                    <span className="text-sm text-gray-600">Refund Amount</span>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        required
                        placeholder="0.00"
                        className="block w-full sm:w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                      />
                      {totalPaid > 0 && (
                        <button
                          type="button"
                          onClick={() => setRefundAmount(String(Math.max(0, totalPaid)))}
                          className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Use full amount ({formatCurrency(Math.max(0, totalPaid))})
                        </button>
                      )}
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-sm text-gray-600">Refund via</span>
                    <select
                      value={refundMethodId}
                      onChange={(e) => { setRefundMethodId(e.target.value); setRefundAccountId(''); }}
                      required
                      className="mt-1 block w-full sm:w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                    >
                      <option value="">Select method</option>
                      {activePaymentMethods.map((pm) => (
                        <option key={pm.id} value={pm.id}>{pm.name}</option>
                      ))}
                    </select>
                  </label>
                  {refundMethodId && !routedRefundAcct && (
                    <label className="block">
                      <span className="text-sm text-gray-600">From Account</span>
                      <select
                        value={refundAccountId}
                        onChange={(e) => setRefundAccountId(e.target.value)}
                        required
                        className="mt-1 block w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                      >
                        <option value="">Select account</option>
                        {refundAccountOptions.map((a) => (
                          <option key={String(a.id)} value={String(a.id)}>{String(a.name)}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-amber-600">No routing rule — select manually</p>
                    </label>
                  )}
                  <label className="block flex-1 min-w-[160px]">
                    <span className="text-sm text-gray-600">Reason</span>
                    <input
                      type="text"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="e.g. minor accident — customer unsafe to drive"
                      maxLength={500}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </label>
                </div>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={refundOrderMut.isPending}
                  loading={refundOrderMut.isPending}
                >
                  {refundOrderMut.isPending ? 'Processing…' : 'Issue Refund'}
                </Button>
                {refundOrderMut.error && (
                  <p className="text-sm text-red-600">{(refundOrderMut.error as Error).message}</p>
                )}
              </form>
            </section>

            {/* ─── SETTLE ORDER ─── */}
            <section ref={settleRef as React.RefObject<HTMLElement>}>
              <h3 className="mb-3 font-medium text-gray-900">Settle Order</h3>

              {(() => {
                const returnChargesAmount = Math.max(0, Number(returnCharges) || 0);

                // Refunds (Issue Refund payments) represent a price reduction, not
                // an additional cash receipt. The backend settle-order RPC includes
                // refund rows as positive "paid" amounts, which inflates rentalPaid
                // above finalTotal and produces a negative balance → full deposit
                // returned. We mirror that logic here so the preview matches reality.
                const refundsTotal = payments.reduce(
                  (s, p) => (p.paymentType === 'refund' ? s + (p.amount ?? 0) : s),
                  0,
                );
                // settleBalance uses the same formula as the backend: add refunds
                // as positive received payments, which reduces effective balance.
                // Return charges are paid separately by their selected tender.
                const settleRentalPaid = payments.reduce((s, p) => {
                  if (p.paymentType === 'deposit') return s;
                  if (p.paymentType === 'extension' && (p.settlementStatus === 'pending' || p.settlementStatus === 'absorbed')) return s;
                  if (p.paymentType === 'addon' && p.paymentMethodId === 'pending' && p.settlementStatus === 'pending') return s;
                  return s + (p.amount ?? 0);
                }, 0);
                const settleBalance = Math.max(0, total - settleRentalPaid);

                const depositApplied = Math.min(securityDeposit, settleBalance);
                const depositRefund = Math.max(0, securityDeposit - settleBalance);
                const remainingAfterDeposit = Math.max(0, settleBalance - depositApplied);
                const isFullyPaid = remainingAfterDeposit <= 0 && depositRefund <= 0;

                // Surcharge preview — only shown once a card method is selected.
                const cardSurchargePreview = remainingAfterDeposit > 0 && isSettleFinalCard
                  ? Math.round(remainingAfterDeposit * (settleFinalSurcharge / 100) * 100) / 100
                  : 0;
                const inclusivePreview = remainingAfterDeposit > 0
                  ? Math.round((remainingAfterDeposit + cardSurchargePreview) * 100) / 100
                  : 0;

                const refundReady = depositRefund <= 0 || (!!settleRefundMethodId && !!effectiveRefundAccountId.trim());
                const finalPayReady = remainingAfterDeposit <= 0 || (!!settleFinalMethodId && (isSettleFinalCard || !!settleFinalAccountId));
                const returnChargeReady = returnChargesAmount <= 0 || (!!returnChargesMethodId && !!effectiveReturnChargeAccountId);
                const settleReady = !!settleDepositAccountId && !!settleReceivableAccountId && refundReady && finalPayReady && returnChargeReady;

                return (
                  <div className="space-y-4">
                    {/* Return charges input */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                      <div>
                        <span className="text-sm font-medium text-gray-700">Return Charges (optional)</span>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Fuel shortage, damage, or other charges assessed at return — added to the balance before deposit is applied
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="block">
                          <span className="text-xs text-gray-500">Amount</span>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-sm text-gray-500">₱</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={returnCharges}
                              onChange={(e) => setReturnCharges(e.target.value)}
                              placeholder="0.00"
                              className="block w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
                            />
                          </div>
                        </label>
                        <label className="block flex-1 min-w-[180px]">
                          <span className="text-xs text-gray-500">Label / reason</span>
                          <input
                            type="text"
                            value={returnChargesNote}
                            onChange={(e) => setReturnChargesNote(e.target.value)}
                            placeholder="e.g. Fuel shortage, Damage"
                            maxLength={200}
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
                          />
                        </label>
                        <label className="block min-w-[160px]">
                          <span className="text-xs text-gray-500">Payment Method</span>
                          <select
                            value={returnChargesMethodId}
                            onChange={(e) => {
                              setReturnChargesMethodId(e.target.value);
                              setReturnChargesAccountId('');
                            }}
                            disabled={returnChargesAmount <= 0}
                            required={returnChargesAmount > 0}
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <option value="">Select method</option>
                            {returnChargePaymentMethods.map((pm) => (
                              <option key={pm.id} value={pm.id}>{pm.name}</option>
                            ))}
                          </select>
                        </label>
                        {returnChargesAmount > 0 && returnChargesMethodId && !routedReturnChargeAcct && (
                          <label className="block min-w-[180px]">
                            <span className="text-xs text-gray-500">Receiving Account</span>
                            <select
                              value={returnChargesAccountId}
                              onChange={(e) => setReturnChargesAccountId(e.target.value)}
                              required
                              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            >
                              <option value="">Select account</option>
                              {paymentAccountOptions.map((account) => (
                                <option key={String(account.id)} value={String(account.id)}>{String(account.name)}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        {returnChargesAmount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setReturnCharges('');
                              setReturnChargesNote('');
                              setReturnChargesMethodId('');
                              setReturnChargesAccountId('');
                            }}
                            className="text-xs text-gray-400 hover:text-gray-600 pb-2"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {returnChargesAmount > 0 && (
                        <p className="text-sm font-medium text-red-700">
                          {formatCurrency(returnChargesAmount)} recorded as a separate payment
                          {returnChargesNote.trim() && <span className="font-normal text-red-600"> — {returnChargesNote.trim()}</span>}
                          {returnChargesMethodId && (
                            <span className="font-normal text-red-600"> · paid via {pmLookup.get(returnChargesMethodId)?.name ?? returnChargesMethodId}</span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Settlement summary */}
                    <div className="rounded-lg border border-gray-200 divide-y divide-sand-brand text-sm">
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-gray-600">Order Total</span>
                        <span className="font-medium">{formatCurrency(total)}</span>
                      </div>
                      {returnChargesAmount > 0 && (
                        <div className="flex justify-between px-4 py-2.5 bg-red-50">
                          <span className="font-medium text-red-800">
                            Return Charges
                            {returnChargesNote.trim() && (
                              <span className="ml-1 font-normal text-red-700">({returnChargesNote.trim()})</span>
                            )}
                          </span>
                          <span className="font-bold text-red-800">+{formatCurrency(returnChargesAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-gray-600">Total Paid (rental)</span>
                        <span className="font-medium text-green-600">{formatCurrency(totalPaid)}</span>
                      </div>
                      {refundsTotal > 0 && (
                        <div className="flex justify-between px-4 py-2.5 bg-orange-50">
                          <span
                            className="font-medium text-orange-800"
                            title="Refund issued reduces the effective balance owed — the deposit is not used to cover refunded amounts"
                          >
                            Refunds Issued
                          </span>
                          <span className="font-bold text-orange-800">−{formatCurrency(refundsTotal)}</span>
                        </div>
                      )}
                      {pendingExtensionsTotal > 0 && (
                        <div className="flex justify-between px-4 py-2.5 bg-amber-50">
                          <span className="font-medium text-amber-800">Unpaid Extensions</span>
                          <span className="font-bold text-amber-800">{formatCurrency(pendingExtensionsTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="font-medium text-gray-900">Balance Due</span>
                        <span className={`font-bold ${settleBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(settleBalance)}</span>
                      </div>
                      {securityDeposit > 0 && (
                        <div className="flex justify-between px-4 py-2.5">
                          <span className="text-gray-600">
                            Security Deposit Held
                            <span className={`ml-2 text-xs font-medium ${depositMethodLabel ? 'text-teal-700' : 'text-amber-600'}`}>
                              ({depositMethodLabel ?? 'Method not recorded'})
                            </span>
                          </span>
                          <span className="font-medium">{formatCurrency(securityDeposit)}</span>
                        </div>
                      )}
                      {depositApplied > 0 && (
                        <div className="flex justify-between px-4 py-2.5 bg-teal-50">
                          <span
                            className="font-medium text-teal-900"
                            title="Portion of the held deposit that will be applied against the outstanding balance"
                          >
                            Deposit Applied
                          </span>
                          <span className="font-bold text-teal-900">
                            −{formatCurrency(depositApplied)}
                          </span>
                        </div>
                      )}
                      {remainingAfterDeposit > 0 && (
                        <div className="flex justify-between px-4 py-2.5">
                          <span className="text-gray-600">
                            Remaining to Collect{isSettleFinalCard ? ' (before fee)' : ''}
                          </span>
                          <span className="font-medium">
                            {formatCurrency(remainingAfterDeposit)}
                          </span>
                        </div>
                      )}
                      {cardSurchargePreview > 0 && (
                        <div className="flex justify-between px-4 py-2.5">
                          <span
                            className="text-gray-600"
                            title="Card processing fee grossed up onto the amount collected"
                          >
                            Card surcharge ({settleFinalSurcharge}%)
                          </span>
                          <span className="font-medium">
                            +{formatCurrency(cardSurchargePreview)}
                          </span>
                        </div>
                      )}
                      {cardSurchargePreview > 0 && (
                        <div className="flex justify-between px-4 py-2.5 bg-blue-50">
                          <span className="font-medium text-blue-900">
                            Card Total to Charge
                          </span>
                          <span className="font-bold text-blue-900">
                            {formatCurrency(inclusivePreview)}
                          </span>
                        </div>
                      )}
                      {depositRefund > 0 && (
                        <div className="flex justify-between px-4 py-2.5 bg-amber-50">
                          <span className="font-medium text-amber-800">
                            Deposit to Refund
                            {depositMethodLabel && <span className="ml-2 text-xs">(paid via {depositMethodLabel})</span>}
                          </span>
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
                          {cardSurchargePreview > 0 && (
                            <>
                              {' '}— charge customer{' '}
                              <span className="font-bold">{formatCurrency(inclusivePreview)}</span>{' '}
                              (incl. {settleFinalSurcharge}% card fee of{' '}
                              {formatCurrency(cardSurchargePreview)})
                            </>
                          )}
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
                        {depositMethodLabel && (
                          <p className="text-xs text-amber-800">
                            Deposit was originally paid via <span className="font-semibold">{depositMethodLabel}</span>.
                          </p>
                        )}
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
                        {(() => {
                          if (settleOrder.isPending) return 'Settling...';
                          if (remainingAfterDeposit > 0) {
                            if (cardSurchargePreview > 0) {
                              return `Settle Order — Collect ${formatCurrency(inclusivePreview)} (incl. ${settleFinalSurcharge}% card fee)`;
                            }
                            return `Settle Order — Collect ${formatCurrency(remainingAfterDeposit)}`;
                          }
                          if (depositApplied > 0 && depositRefund > 0) {
                            return `Settle Order — Apply ${formatCurrency(depositApplied)} Deposit & Refund ${formatCurrency(depositRefund)}`;
                          }
                          if (depositApplied > 0) {
                            return `Settle Order — Apply ${formatCurrency(depositApplied)} Deposit`;
                          }
                          if (depositRefund > 0) {
                            return `Settle Order — Refund ${formatCurrency(depositRefund)} Deposit`;
                          }
                          return 'Settle Order';
                        })()}
                      </button>
                      {!settleReady && !settleOrder.isPending && (
                        <p className="mt-2 text-xs text-amber-700">
                          {!settleDepositAccountId || !settleReceivableAccountId
                            ? 'Accounting accounts not configured — contact admin.'
                            : returnChargesAmount > 0 && !returnChargesMethodId
                            ? 'Select Cash or GCash for the return charge.'
                            : returnChargesAmount > 0 && !effectiveReturnChargeAccountId
                            ? 'Select the account receiving the return charge.'
                            : depositRefund > 0 && !settleRefundMethodId
                            ? 'Select a deposit refund method to continue.'
                            : remainingAfterDeposit > 0 && !settleFinalMethodId
                            ? 'Select a payment method for the remaining balance.'
                            : 'Complete all required fields to settle.'}
                        </p>
                      )}
                    </form>
                    {settleOrder.error && <p className="text-sm text-red-600">{(settleOrder.error as Error).message}</p>}
                  </div>
                );
              })()}
            </section>
          </div>
        )}
      </div>

      {/* ─── Refund confirmation dialog ─── */}
      {showRefundConfirm && createPortal(
        <Modal
          open={showRefundConfirm}
          onClose={() => setShowRefundConfirm(false)}
          title="Confirm Refund"
          size="sm"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">This action cannot be undone.</p>
              <p className="mt-0.5">A journal entry will be created immediately upon confirmation.</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-charcoal-brand/60">Refund amount</dt>
                <dd className="font-semibold">{formatCurrency(Number(refundAmount))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-charcoal-brand/60">Method</dt>
                <dd className="font-medium">{pmLookup.get(refundMethodId)?.name ?? refundMethodId}</dd>
              </div>
              {refundReason.trim() && (
                <div className="flex justify-between gap-4">
                  <dt className="text-charcoal-brand/60">Reason</dt>
                  <dd className="text-right font-medium">{refundReason.trim()}</dd>
                </div>
              )}
            </dl>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowRefundConfirm(false)}
                disabled={refundOrderMut.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleRefundConfirmed}
                loading={refundOrderMut.isPending}
              >
                {refundOrderMut.isPending ? 'Processing…' : 'Confirm Refund'}
              </Button>
            </div>
          </div>
        </Modal>,
        document.body,
      )}

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
            preAssignedVehicleId={enrichedData?.primaryVehicleId ?? null}
            preAssignedVehicleName={enrichedData?.primaryVehicleName ?? null}
            orderItemId={enrichedData?.primaryOrderItemId ?? null}
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
        // Use the derived balance (final_total − totalPaid, excluding pending
        // extension IOUs) rather than the stored orders.balance_due column,
        // which can drift after paid extensions (see migration 091).
        balanceDue={balance}
        cardSurchargePercent={cardSurchargePercent}
      />

      {/* ─── Signed waiver view modal ─── */}
      {waiverViewOpen &&
        createPortal(
          <WaiverViewModal
            open={waiverViewOpen}
            onClose={() => setWaiverViewOpen(false)}
            orderReference={orderRefForWaiver ?? orderId}
            details={signedWaiverDetails}
            loading={signedWaiverLoading}
            error={signedWaiverError as Error | null}
          />,
          document.body,
        )}
    </>
  );
}
