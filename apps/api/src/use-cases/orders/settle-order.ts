import {
  type OrderRepository,
  type OrderItemRepository,
  type PaymentRepository,
  type Payment,
  type FleetRepository,
  type AccountingPort,
  type CardSettlementRepository,
  type CardSettlement,
  type JournalLeg,
  Money,
  calculateRefundableDeposit,
} from '@lolas/domain';
import { supabase } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';

export interface SettleOrderDeps {
  orderRepo: OrderRepository;
  orderItemRepo: OrderItemRepository;
  paymentRepo: PaymentRepository;
  fleetRepo: FleetRepository;
  accountingPort: AccountingPort;
  cardSettlementRepo: CardSettlementRepository;
}

export interface SettleOrderInput {
  orderId: string;
  settlementDate: string;
  depositLiabilityAccountId: string;
  receivableAccountId: string;
  refundAccountId: string;
  finalPaymentMethodId?: string | null;
  finalPaymentAccountId?: string | null;
  /**
   * Inclusive of card surcharge when the final payment method is a card.
   * See `cardFeeSurchargeDelta` for the surcharge portion.
   */
  finalPaymentAmount?: number;
  isCardPayment?: boolean;
  /**
   * Peso amount of the card-fee surcharge that should be bumped on
   * `orders.final_total` + `orders.card_fee_surcharge` at settle time.
   * Only set when `isCardPayment` is true and the underlying payment
   * method has a non-zero surcharge percent. The caller is responsible
   * for pre-computing this so the `finalPaymentAmount` above is the
   * inclusive (grossed-up) figure charged to the customer.
   */
  cardFeeSurchargeDelta?: number;
  /**
   * Peso amount of fuel, condition, or other return-time charges assessed
   * at the point of settlement. Bumped onto `orders.final_total` and
   * `orders.return_charges` atomically in the RPC. It is paired with a
   * separately tendered return-charge payment, so it does not consume the
   * security deposit.
   */
  returnChargesDelta?: number;
  /**
   * Free-text label describing what the return charge is for,
   * e.g. "Fuel shortage", "Damage". Stored in orders.return_charges_note.
   */
  returnChargesNote?: string | null;
  /** Cash or GCash method used to pay the return charge. */
  returnChargesPaymentMethodId?: string | null;
  /** Asset account receiving the return-charge payment. */
  returnChargesAccountId?: string | null;
  settlementRef?: string | null;
  /**
   * Payment method used to return the security deposit to the customer
   * (e.g. 'gcash' when the deposit was collected in cash but returned
   * via GCash). When provided a payments row with
   * payment_type = 'deposit_refund' is persisted alongside the journal
   * entries so the method is auditable on the order's payment history.
   * When omitted the deposit return is recorded via journal entries only
   * (backward-compatible behaviour).
   */
  depositRefundMethodId?: string | null;
}

function serialiseLeg(leg: JournalLeg): Record<string, unknown> {
  return {
    id: leg.entryId,
    account_id: leg.accountId,
    debit: leg.debit.toNumber(),
    credit: leg.credit.toNumber(),
    description: leg.description,
    reference_type: leg.referenceType,
    reference_id: leg.referenceId,
  };
}

export async function settleOrder(
  deps: SettleOrderDeps,
  input: SettleOrderInput,
) {
  const { orderRepo, orderItemRepo, paymentRepo } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error(`Order ${input.orderId} not found`);

  const [payments, orderItems] = await Promise.all([
    paymentRepo.findByOrderId(order.id),
    orderItemRepo.findByOrderId(order.id),
  ]);

  // ── Payment categorisation ──
  // • Deposits live against `orders.security_deposit`, not `final_total` — summing
  //   them into `totalPayments` would make the balance look overpaid.
  // • Pending extension IOUs represent amounts owed that haven't been collected
  //   yet; they must NOT count as payments received.
  // • Absorbed extensions are IOUs that were rolled into a previous settlement —
  //   the cash was captured by the final-payment row, not the extension row.
  const pendingExtensions = payments.filter(
    (p) => p.paymentType === 'extension' && p.settlementStatus === 'pending',
  );
  const paidNonDepositPayments = payments.filter((p) => {
    if (p.paymentType === 'deposit') return false;
    if (p.paymentType === 'extension' && (p.settlementStatus === 'pending' || p.settlementStatus === 'absorbed')) return false;
    if (p.paymentType === 'addon' && p.paymentMethodId === 'pending' && p.settlementStatus === 'pending') return false;
    return true;
  });

  const rentalPaid = paidNonDepositPayments.reduce(
    (sum, p) => sum.add(Money.php(p.amount)),
    Money.zero(),
  );
  const pendingExtensionsTotal = pendingExtensions.reduce(
    (sum, p) => sum.add(Money.php(p.amount)),
    Money.zero(),
  );

  const returnChargesDelta =
    input.returnChargesDelta && input.returnChargesDelta > 0
      ? Money.php(input.returnChargesDelta)
      : Money.zero();

  if (
    returnChargesDelta.isPositive() &&
    (!input.returnChargesPaymentMethodId || !input.returnChargesAccountId)
  ) {
    throw new Error('Return-charge payment method and account are required');
  }

  // Balance = rental/addon/extension charges not yet paid.
  //   (a) final_total − rentalPaid         — works when migration 091 has bumped final_total
  //   (b) pendingExtensionsTotal           — fallback if final_total is stale
  // Use the greater so the calc is resilient either way.
  // Return charges are collected as a separate payment at settlement and do not
  // consume the deposit. The order total and received payment are both bumped
  // below, keeping the final balance unchanged by an already-paid charge.
  const balanceFromFinalTotal = order.calculateBalanceDue(rentalPaid);
  const balanceBeforeDeposit =
    balanceFromFinalTotal.toNumber() >= pendingExtensionsTotal.toNumber()
      ? balanceFromFinalTotal
      : pendingExtensionsTotal;

  const { amountApplied, refund } = calculateRefundableDeposit(
    order.securityDeposit,
    balanceBeforeDeposit,
  );

  const balanceAfterDeposit = balanceBeforeDeposit.subtract(amountApplied);

  // All side effects are collected here and posted by the
  // settle_order_atomic RPC in a single DB transaction.
  const legs: JournalLeg[] = [];
  let finalPayment: Payment | null = null;
  let cardSettlement: CardSettlement | null = null;
  let depositRefundPayment: Payment | null = null;
  let returnChargePayment: Payment | null = null;

  // Return charges are collected separately from the rental balance so an
  // already-paid fuel/damage charge does not reduce the security-deposit refund.
  // Persisting a payment row also puts the receipt in Cash-Up under its tender.
  if (returnChargesDelta.isPositive()) {
    returnChargePayment = {
      id: crypto.randomUUID(),
      storeId: order.storeId,
      orderId: order.id,
      rawOrderId: null,
      orderItemId: null,
      orderAddonId: null,
      paymentType: 'return_charge',
      amount: returnChargesDelta.toNumber(),
      paymentMethodId: input.returnChargesPaymentMethodId!,
      transactionDate: input.settlementDate,
      settlementStatus: null,
      settlementRef: input.returnChargesNote ?? null,
      customerId: order.customerId,
      accountId: input.returnChargesAccountId!,
    };

    legs.push(
      {
        entryId: crypto.randomUUID(),
        accountId: input.returnChargesAccountId!,
        debit: returnChargesDelta,
        credit: Money.zero(),
        description: `Order ${order.id} return charge received`,
        referenceType: 'payment',
        referenceId: returnChargePayment.id,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.zero(),
        credit: returnChargesDelta,
        description: `Order ${order.id} return charge receivable reduced`,
        referenceType: 'payment',
        referenceId: returnChargePayment.id,
      },
    );
  }

  // ── Final payment (optional) ─────────────────────────────
  if (
    balanceAfterDeposit.isPositive() &&
    input.finalPaymentMethodId &&
    input.finalPaymentAmount &&
    input.finalPaymentAmount > 0
  ) {
    const paymentAmount = Money.php(input.finalPaymentAmount);
    finalPayment = {
      id: crypto.randomUUID(),
      storeId: order.storeId,
      orderId: order.id,
      rawOrderId: null,
      orderItemId: null,
      orderAddonId: null,
      paymentType: 'settlement',
      amount: paymentAmount.toNumber(),
      paymentMethodId: input.finalPaymentMethodId,
      transactionDate: input.settlementDate,
      settlementStatus: input.isCardPayment ? 'pending' : null,
      settlementRef: input.settlementRef ?? null,
      customerId: order.customerId,
      accountId: input.isCardPayment ? null : (input.finalPaymentAccountId ?? null),
    };

    if (!input.isCardPayment && input.finalPaymentAccountId) {
      legs.push(
        {
          entryId: crypto.randomUUID(),
          accountId: input.finalPaymentAccountId,
          debit: paymentAmount,
          credit: Money.zero(),
          description: `Order ${order.id} final settlement payment`,
          referenceType: 'payment',
          referenceId: finalPayment.id,
        },
        {
          entryId: crypto.randomUUID(),
          accountId: input.receivableAccountId,
          debit: Money.zero(),
          credit: paymentAmount,
          description: `Order ${order.id} settlement receivable reduced`,
          referenceType: 'payment',
          referenceId: finalPayment.id,
        },
      );
    }

    if (input.isCardPayment) {
      cardSettlement = {
        id: crypto.randomUUID(),
        storeId: order.storeId,
        orderId: order.id,
        customerId: order.customerId,
        paymentId: finalPayment.id,
        name: null,
        amount: paymentAmount.toNumber(),
        refNumber: input.settlementRef ?? null,
        transactionDate: input.settlementDate,
        forecastedDate: null,
        isPaid: false,
        dateSettled: null,
        settlementRef: null,
        netAmount: null,
        feeExpense: null,
        accountId: null,
        batchNo: null,
        createdAt: new Date(),
      };
    }
  }

  // ── Deposit-applied legs ─────────────────────────────────
  if (amountApplied.isPositive()) {
    legs.push(
      {
        entryId: crypto.randomUUID(),
        accountId: input.depositLiabilityAccountId,
        debit: amountApplied,
        credit: Money.zero(),
        description: `Order ${order.id} deposit applied to balance`,
        referenceType: 'deposit',
        referenceId: order.id,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.zero(),
        credit: amountApplied,
        description: `Order ${order.id} deposit applied to receivable`,
        referenceType: 'deposit',
        referenceId: order.id,
      },
    );
  }

  // ── Deposit-refund legs ──────────────────────────────────
  if (refund.isPositive()) {
    // When a specific refund method is provided, build a payments row so the
    // method is stored and auditable (e.g. deposit collected in cash but
    // returned via GCash). The journal legs reference the payment ID so that
    // the cashup deduplication logic suppresses the journal-only path.
    if (input.depositRefundMethodId) {
      depositRefundPayment = {
        id: crypto.randomUUID(),
        storeId: order.storeId,
        orderId: order.id,
        rawOrderId: null,
        orderItemId: null,
        orderAddonId: null,
        paymentType: 'deposit_refund',
        amount: refund.toNumber(),
        paymentMethodId: input.depositRefundMethodId,
        transactionDate: input.settlementDate,
        settlementStatus: null,
        settlementRef: null,
        customerId: order.customerId,
        accountId: input.refundAccountId,
      };
    }

    const refundReferenceId = depositRefundPayment?.id ?? order.id;
    legs.push(
      {
        entryId: crypto.randomUUID(),
        accountId: input.depositLiabilityAccountId,
        debit: refund,
        credit: Money.zero(),
        description: `Order ${order.id} deposit refund`,
        referenceType: 'refund',
        referenceId: refundReferenceId,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.refundAccountId,
        debit: Money.zero(),
        credit: refund,
        description: `Order ${order.id} deposit refund to customer`,
        referenceType: 'refund',
        referenceId: refundReferenceId,
      },
    );
  }

  // Compute the post-settlement balance locally so we can
  // stamp it on orders.balance_due inside the same RPC call.
  // Include the final_payment + the deposit_applied + the
  // absorbed pending extensions (all of which count toward the
  // rental side of the ledger). Deposits paid pre-settlement are
  // intentionally excluded because they're tracked separately.
  //
  // When a card surcharge is applied at settlement, orders.final_total
  // is bumped by the surcharge delta (inside the RPC). We must mirror
  // that bump locally so finalBalanceDue reflects the post-update
  // total — otherwise the balance would go negative by the surcharge.
  const absorbedExtensionTotal = pendingExtensionsTotal;
  const surchargeDelta =
    input.isCardPayment && input.cardFeeSurchargeDelta && input.cardFeeSurchargeDelta > 0
      ? Money.php(input.cardFeeSurchargeDelta)
      : Money.zero();
  const paymentsAfter = rentalPaid
    .add(amountApplied)
    .add(absorbedExtensionTotal)
    .add(returnChargePayment ? Money.php(returnChargePayment.amount) : Money.zero())
    .add(finalPayment ? Money.php(finalPayment.amount) : Money.zero());
  const adjustedFinalTotal = order.finalTotal.add(surchargeDelta).add(returnChargesDelta);
  const finalBalanceDue = adjustedFinalTotal.subtract(paymentsAfter);

  const fleetReleases = orderItems.map((item) => ({
    vehicle_id: item.vehicleId,
  }));

  const journalTransactionId =
    legs.length > 0 ? crypto.randomUUID() : '';
  const journalDate = formatManilaDate();
  const journalPeriod = journalDate.slice(0, 7);

  const rpcPayload = {
    p_order_id: order.id,
    p_store_id: order.storeId,
    p_settled_at: new Date().toISOString(),
    p_final_balance_due: finalBalanceDue.toNumber(),
    p_final_payment: finalPayment
      ? {
          id: finalPayment.id,
          amount: finalPayment.amount,
          payment_type: finalPayment.paymentType,
          payment_method_id: finalPayment.paymentMethodId,
          transaction_date: finalPayment.transactionDate,
          settlement_status: finalPayment.settlementStatus,
          settlement_ref: finalPayment.settlementRef,
          customer_id: finalPayment.customerId,
          account_id: finalPayment.accountId,
        }
      : null,
    p_card_settlement: cardSettlement
      ? {
          store_id: cardSettlement.storeId,
          customer_id: cardSettlement.customerId,
          name: cardSettlement.name,
          amount: cardSettlement.amount,
          ref_number: cardSettlement.refNumber,
          raw_date: cardSettlement.transactionDate,
          forecasted_date: cardSettlement.forecastedDate,
          is_paid: cardSettlement.isPaid,
          date_settled: cardSettlement.dateSettled,
          settlement_ref: cardSettlement.settlementRef,
          net_amount: cardSettlement.netAmount,
          fee_expense: cardSettlement.feeExpense,
          account_id: cardSettlement.accountId,
          batch_no: cardSettlement.batchNo,
        }
      : null,
    p_fleet_releases: fleetReleases,
    p_journal_transaction_id: journalTransactionId,
    p_journal_period: journalPeriod,
    p_journal_date: journalDate,
    p_journal_legs: legs.map(serialiseLeg),
    p_absorbed_extension_payment_ids: pendingExtensions.map((p) => p.id),
    p_card_fee_surcharge_delta: surchargeDelta.toNumber(),
    p_return_charges_delta: returnChargesDelta.toNumber(),
    p_return_charges_note: input.returnChargesNote ?? null,
    p_deposit_refund_payment: depositRefundPayment
      ? {
          id: depositRefundPayment.id,
          amount: depositRefundPayment.amount,
          payment_type: depositRefundPayment.paymentType,
          payment_method_id: depositRefundPayment.paymentMethodId,
          transaction_date: depositRefundPayment.transactionDate,
          customer_id: depositRefundPayment.customerId,
          account_id: depositRefundPayment.accountId,
      }
      : null,
    p_return_charge_payment: returnChargePayment
      ? {
          id: returnChargePayment.id,
          amount: returnChargePayment.amount,
          payment_type: returnChargePayment.paymentType,
          payment_method_id: returnChargePayment.paymentMethodId,
          transaction_date: returnChargePayment.transactionDate,
          settlement_ref: returnChargePayment.settlementRef,
          customer_id: returnChargePayment.customerId,
          account_id: returnChargePayment.accountId,
        }
      : null,
  };

  let { error: rpcErr } = await supabase.rpc('settle_order_atomic', rpcPayload);

  if (
    rpcErr &&
    rpcErr.message.includes('settle_order_atomic') &&
    rpcErr.message.includes('p_return_charges_note')
  ) {
    const legacyPayload: Omit<typeof rpcPayload, 'p_return_charges_note'> &
      Partial<Pick<typeof rpcPayload, 'p_return_charges_note'>> = { ...rpcPayload };
    delete legacyPayload.p_return_charges_note;
    const retry = await supabase.rpc('settle_order_atomic', legacyPayload);
    rpcErr = retry.error;
  }

  if (rpcErr) {
    throw new Error(`settle_order_atomic RPC failed: ${rpcErr.message}`);
  }

  // Reload the order so we return a fresh domain object that
  // reflects the status/balance the RPC just persisted.
  const reloaded = await orderRepo.findById(order.id);
  if (!reloaded) {
    throw new Error(
      `settle_order_atomic succeeded but order ${order.id} could not be reloaded`,
    );
  }

  return {
    order: reloaded,
    balanceBeforeDeposit: balanceBeforeDeposit.toNumber(),
    depositApplied: amountApplied.toNumber(),
    depositRefund: refund.toNumber(),
    balanceAfterDeposit: balanceAfterDeposit.toNumber(),
    finalPaymentCollected: finalPayment?.amount ?? 0,
    finalBalanceDue: finalBalanceDue.toNumber(),
    absorbedExtensionsCount: pendingExtensions.length,
    absorbedExtensionsTotal: absorbedExtensionTotal.toNumber(),
    cardFeeSurchargeApplied: surchargeDelta.toNumber(),
    returnChargesApplied: returnChargesDelta.toNumber(),
  };
}
