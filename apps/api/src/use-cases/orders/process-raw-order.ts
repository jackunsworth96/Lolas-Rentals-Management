import {
  type OrderRepository,
  type OrderItemRepository,
  type OrderAddonRepository,
  type OrderAddonRecord,
  type FleetRepository,
  type CustomerRepository,
  type PaymentRepository,
  type AccountingPort,
  type CardSettlementRepository,
  type JournalLeg,
  type Customer,
  type TransferRepository,
  Order as OrderEntity,
  OrderStatus,
  Money,
  Transfer,
  NonRentableVehicleError,
} from '@lolas/domain';
import { v5 as uuidv5 } from 'uuid';
import { supabase } from '../../adapters/supabase/client.js';
import { resolveCharityPayableAccount } from '../../adapters/supabase/maintenance-expense-rpc.js';
import { type VehicleAssignment } from './activate-order.js';
import { formatManilaDate } from '../../utils/manila-date.js';

// Deterministic namespace for order ids derived from raw order ids.
// Generated once and frozen — changing this value would break
// idempotency for any raw orders already processed against it.
const ORDER_NS = '7f3e8d4c-0b26-4a5a-91e0-6c9a0e3b4b5f';

function extractWooOrderId(payload: Record<string, unknown>): string | null {
  for (const key of ['number', 'id', 'order_key']) {
    const val = payload[key];
    if (val !== undefined && val !== null && val !== '') return String(val);
  }
  return null;
}

export interface ProcessRawOrderDeps {
  orderRepo: OrderRepository;
  orderItemRepo: OrderItemRepository;
  orderAddonRepo: OrderAddonRepository;
  fleetRepo: FleetRepository;
  customerRepo: CustomerRepository;
  paymentRepo: PaymentRepository;
  accountingPort: AccountingPort;
  cardSettlementRepo: CardSettlementRepository;
  transferRepo: TransferRepository;
}

export interface ProcessRawOrderInput {
  rawOrderId: string;
  storeId: string;
  employeeId: string;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  vehicleAssignments: VehicleAssignment[];
  addons: OrderAddonRecord[];
  securityDeposit: number;
  webQuoteRaw: number | null;
  webNotes: string | null;
  receivableAccountId: string;
  incomeAccountId: string;
  paymentMethodId: string | null;
  depositMethodId: string | null;
  cardFeeSurcharge: number;
  paymentAccountId?: string | null;
  depositLiabilityAccountId?: string | null;
  isCardPayment?: boolean;
  settlementRef?: string | null;
  /**
   * When true the transfer fee is excluded from finalTotal / balance_due.
   * Use this when the customer has agreed to pay the driver directly — the
   * Transfer record is still created and linked, but the money never flows
   * through Lola's books so staff should not collect it at the counter.
   */
  excludeTransferFromBalance?: boolean;
  /** Accommodation/hotel name to attach to the transfer record. Takes precedence over payload.accommodation_name. */
  transferAccommodation?: string | null;
  /**
   * When provided and less than rentalIncomeTotal, the payment created at
   * activation is recorded for this amount only. The difference becomes
   * balance_due so staff can collect the remainder later.
   */
  partialPaymentAmount?: number;
}

export async function processRawOrder(
  deps: ProcessRawOrderDeps,
  input: ProcessRawOrderInput,
) {
  // ── 1. Load raw order payload ─────────────────────────────
  const { data: rawOrder, error: rawErr } = await supabase
    .from('orders_raw')
    .select('*')
    .eq('id', input.rawOrderId)
    .single();

  if (rawErr || !rawOrder) {
    throw new Error(`Raw order ${input.rawOrderId} not found`);
  }

  // ── 2. Deterministic order id (idempotent under retry) ────
  const orderId = uuidv5(input.rawOrderId, ORDER_NS);

  // ── 3. Pre-flight: assert every assigned vehicle is rentable
  // so we fail before mutating anything.
  for (const a of input.vehicleAssignments) {
    const vehicle = await deps.fleetRepo.findById(a.vehicleId);
    if (!vehicle) throw new Error(`Vehicle ${a.vehicleId} not found`);
    if (!vehicle.isRentable()) {
      throw new NonRentableVehicleError(vehicle.id, vehicle.status);
    }
  }

  // ── 4. Resolve or build the customer record. ──────────────
  let customer: Customer | null = null;
  if (input.customer.email) {
    customer = await deps.customerRepo.findByEmail(input.customer.email);
  }
  if (!customer && input.customer.phone) {
    customer = await deps.customerRepo.findByMobile(input.customer.phone);
  }
  if (!customer) {
    customer = {
      id: crypto.randomUUID(),
      storeId: input.storeId,
      name: input.customer.name,
      email: input.customer.email,
      mobile: input.customer.phone,
      totalSpent: 0,
      notes: null,
      blacklisted: false,
      whatsappReviewOptOut: false,
    };
  } else {
    // A booking name is not necessarily the customer's profile name (for
    // example, a second scooter may be booked for a partner). Do not replace
    // the shared customer identity with an order-specific renter label.
    // Contact details remain safe to refresh from the latest booking.
    customer = {
      ...customer,
      email: input.customer.email ?? customer.email,
      mobile: input.customer.phone ?? customer.mobile,
    };
  }

  // ── 5. Compute totals and build the domain order entity. ──
  const wooOrderId = extractWooOrderId(
    (rawOrder.payload ?? {}) as Record<string, unknown>,
  );
  const rentalTotal = input.vehicleAssignments.reduce((sum, v) => {
    const days = v.rentalDaysCount || 1;
    return sum + v.rentalRate * days + v.pickupFee + v.dropoffFee - v.discount;
  }, 0);
  const addonTotal = input.addons.reduce((sum, a) => sum + a.totalAmount, 0);
  const charityAmount = Number(rawOrder.charity_donation ?? 0);

  // Transfer amount is stored on `raw_orders.transfer_amount` (direct bookings)
  // or inside the JSON `payload.transfer_amount` (WooCommerce webhooks). Extract
  // it here so it can be included in finalTotal — the customer owes the transfer
  // fee and it must be reflected in balance_due alongside the rental charges.
  const rawPayload =
    typeof rawOrder.payload === 'object' && rawOrder.payload !== null
      ? (rawOrder.payload as Record<string, unknown>)
      : {};
  const transferAmountRaw =
    rawPayload.transfer_amount !== undefined
      ? rawPayload.transfer_amount
      : (rawOrder as { transfer_amount?: number | null }).transfer_amount;
  const transferAmount = Number(transferAmountRaw ?? 0);

  // Pure rental income (does not include transfer or charity — those have
  // dedicated journal legs so they must NOT be double-counted here).
  const rentalIncomeTotal = rentalTotal + addonTotal + input.cardFeeSurcharge;

  // When the customer pays the driver directly we exclude the transfer fee from
  // the order's financial obligation so staff don't try to collect it at the counter.
  // The Transfer record is still created and linked for ops purposes.
  const transferBillable =
    input.excludeTransferFromBalance ? 0 : transferAmount;

  // finalTotal = everything the customer owes = what balance_due is measured against.
  const finalTotal = rentalIncomeTotal + charityAmount + transferBillable;

  // Previous pre-activation payments (e.g. deposit paid at
  // /collect-payment) also reduce the remaining balance. Pull them
  // now so balance_due is computed once up front.
  const preActivationPayments = await deps.paymentRepo.findByRawOrderId(
    input.rawOrderId,
  );
  const preActivationPaid = preActivationPayments.reduce(
    (sum, p) => sum + Number(p.amount ?? 0),
    0,
  );

  // Determine which fresh payments will be inserted by the RPC —
  // we must include them in balance_due so the order lands in the
  // correct state on first insert.
  const willCreateRentalPayment =
    !!input.paymentMethodId &&
    !!input.receivableAccountId &&
    (input.isCardPayment || !!input.paymentAccountId);
  // The rental payment row captures everything collected at activation. When
  // the full amount is paid (no partial specified), that includes rental,
  // addons, surcharge, charity, and any billable transfer — all of which are
  // part of finalTotal and therefore part of what the customer owes.
  // Using only rentalIncomeTotal here previously left charity/transfer amounts
  // permanently in balance_due even after full payment.
  // When a partial payment is explicitly requested (< finalTotal), use that
  // exact amount so balance_due reflects what genuinely remains outstanding.
  const rentalAmount =
    input.partialPaymentAmount !== undefined && input.partialPaymentAmount < finalTotal
      ? input.partialPaymentAmount
      : finalTotal;
  const willCreateDepositPayment =
    input.securityDeposit > 0 &&
    !!input.depositMethodId &&
    !!input.paymentAccountId &&
    !!input.depositLiabilityAccountId;
  const depositAmount = input.securityDeposit;

  const totalPaid =
    preActivationPaid +
    (willCreateRentalPayment ? rentalAmount : 0) +
    (willCreateDepositPayment ? depositAmount : 0);
  const balanceDue = Math.max(0, finalTotal - totalPaid);

  const orderEntity = OrderEntity.create({
    id: orderId,
    storeId: input.storeId,
    wooOrderId,
    customerId: customer.id,
    employeeId: input.employeeId,
    orderDate: formatManilaDate(),
    status: OrderStatus.Active,
    webNotes: input.webNotes,
    quantity: input.vehicleAssignments.length,
    webQuoteRaw: input.webQuoteRaw,
    securityDeposit: Money.php(input.securityDeposit),
    depositStatus: willCreateDepositPayment ? 'paid' : null,
    cardFeeSurcharge: Money.php(input.cardFeeSurcharge),
    returnCharges: Money.zero(),
    finalTotal: Money.php(finalTotal),
    balanceDue: Money.php(balanceDue),
    paymentMethodId: input.paymentMethodId,
    depositMethodId: input.depositMethodId,
    bookingToken: (rawOrder.order_reference as string | null) ?? null,
    tips: Money.zero(),
    charityDonation: Money.php(charityAmount),
    addons: input.addons.map((a) => ({
      addonName: a.addonName,
      addonPrice: a.addonPrice,
      addonType: a.addonType,
      quantity: a.quantity,
      totalAmount: a.totalAmount,
      mutualExclusivityGroup: a.mutualExclusivityGroup ?? undefined,
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // ── 6. Build all jsonb payloads for the RPC. ──────────────
  const customerRow = {
    id: customer.id,
    store_id: customer.storeId,
    name: customer.name,
    email: customer.email?.toLowerCase() ?? null,
    mobile: customer.mobile,
    total_spent: customer.totalSpent,
    notes: customer.notes,
    blacklisted: customer.blacklisted,
  };

  const orderRow = {
    id: orderEntity.id,
    store_id: orderEntity.storeId,
    woo_order_id: (orderEntity as OrderEntity & { wooOrderId?: string | null })
      .wooOrderId ?? null,
    customer_id: orderEntity.customerId,
    employee_id: orderEntity.employeeId,
    order_date: orderEntity.orderDate,
    status: orderEntity.status.value,
    web_notes: orderEntity.webNotes,
    quantity: orderEntity.quantity,
    web_quote_raw: orderEntity.webQuoteRaw,
    security_deposit: orderEntity.securityDeposit.toNumber(),
    deposit_status: orderEntity.depositStatus,
    card_fee_surcharge: orderEntity.cardFeeSurcharge.toNumber(),
    return_charges: orderEntity.returnCharges.toNumber(),
    final_total: orderEntity.finalTotal.toNumber(),
    balance_due: orderEntity.balanceDue.toNumber(),
    payment_method_id: orderEntity.paymentMethodId,
    deposit_method_id: orderEntity.depositMethodId,
    booking_token: orderEntity.bookingToken,
    tips: orderEntity.tips.toNumber(),
    charity_donation: orderEntity.charityDonation.toNumber(),
    updated_at: orderEntity.updatedAt.toISOString(),
  };

  // Ensure every vehicle assignment has a stable id before the RPC.
  const assignments: VehicleAssignment[] = input.vehicleAssignments.map((v) => ({
    ...v,
    id: v.id || crypto.randomUUID(),
  }));

  const orderItems = assignments.map((a) => ({
    id: a.id,
    store_id: input.storeId,
    order_id: orderId,
    vehicle_id: a.vehicleId,
    vehicle_name: a.vehicleName,
    pickup_datetime: a.pickupDatetime,
    dropoff_datetime: a.dropoffDatetime,
    rental_days_count: a.rentalDaysCount,
    pickup_location: a.pickupLocation ?? null,
    dropoff_location: a.dropoffLocation ?? null,
    pickup_fee: a.pickupFee,
    dropoff_fee: a.dropoffFee,
    rental_rate: a.rentalRate,
    helmet_numbers: a.helmetNumbers ?? null,
    discount: a.discount ?? 0,
    ops_notes: a.opsNotes ?? null,
    return_condition: null,
  }));

  const orderAddons = input.addons.map((a) => ({
    id: a.id ?? crypto.randomUUID(),
    store_id: input.storeId,
    order_id: orderId,
    addon_name: a.addonName,
    addon_price: a.addonPrice,
    addon_type: a.addonType,
    quantity: a.quantity,
    total_amount: a.totalAmount,
  }));

  const fleetUpdates = assignments.map((a) => ({
    vehicle_id: a.vehicleId,
    status: 'Active',
  }));

  // ── 7. Payment + card settlement payloads. ────────────────
  const txnDate = formatManilaDate();
  const rentalPaymentId = willCreateRentalPayment ? crypto.randomUUID() : null;

  let rentalPayment: Record<string, unknown> | null = null;
  let cardSettlement: Record<string, unknown> | null = null;

  if (willCreateRentalPayment && rentalPaymentId) {
    rentalPayment = {
      id: rentalPaymentId,
      store_id: input.storeId,
      order_id: orderId,
      raw_order_id: input.rawOrderId,
      order_item_id: null,
      order_addon_id: null,
      payment_type: 'rental',
      amount: rentalAmount,
      payment_method_id: input.paymentMethodId,
      transaction_date: txnDate,
      settlement_status: input.isCardPayment ? 'pending' : null,
      settlement_ref: input.settlementRef ?? null,
      customer_id: customer.id,
      account_id: input.isCardPayment ? null : (input.paymentAccountId ?? null),
    };

    if (input.isCardPayment) {
      cardSettlement = {
        store_id: input.storeId,
        order_id: orderId,
        customer_id: customer.id,
        name: customer.name,
        amount: rentalAmount,
        ref_number: input.settlementRef ?? null,
        raw_date: txnDate,
        forecasted_date: null,
        is_paid: false,
        date_settled: null,
        settlement_ref: null,
        net_amount: null,
        fee_expense: null,
        account_id: null,
        batch_no: null,
      };
    }
  }

  const depositPaymentId = willCreateDepositPayment ? crypto.randomUUID() : null;
  let depositPayment: Record<string, unknown> | null = null;
  if (willCreateDepositPayment && depositPaymentId) {
    depositPayment = {
      id: depositPaymentId,
      store_id: input.storeId,
      order_id: orderId,
      raw_order_id: input.rawOrderId,
      order_item_id: null,
      order_addon_id: null,
      payment_type: 'deposit',
      amount: depositAmount,
      payment_method_id: input.depositMethodId,
      transaction_date: txnDate,
      settlement_status: null,
      settlement_ref: null,
      customer_id: customer.id,
      account_id: input.paymentAccountId ?? null,
    };
  }

  // ── 8. Build ALL journal legs in one concatenated array. ──
  const journalLegs: Array<Record<string, unknown>> = [];

  // (a) Activation: receivable ↔ rental income for the rental/addon/surcharge portion.
  //
  // We debit AR only for rentalIncomeTotal here. The charity and transfer portions
  // of finalTotal each have their own dedicated AR-debit legs below ((d) and (e))
  // so that the income account is never overstated by non-rental revenue.
  //
  // Total AR debits across all legs = rentalIncomeTotal + charityAmount + transferBillable
  //                                 = finalTotal  ✓
  if (rentalIncomeTotal > 0 && input.receivableAccountId && input.incomeAccountId) {
    const activationLegs: JournalLeg[] = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.php(rentalIncomeTotal),
        credit: Money.zero(),
        description: `Order ${orderId} activation`,
        referenceType: 'order',
        referenceId: orderId,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.incomeAccountId,
        debit: Money.zero(),
        credit: Money.php(rentalIncomeTotal),
        description: `Order ${orderId} rental income`,
        referenceType: 'order',
        referenceId: orderId,
      },
    ];
    for (const leg of activationLegs) journalLegs.push(serialiseLeg(leg));
  }

  // (b) Rental payment legs — only for non-card payments. Card
  // payments stay 'pending' against the card settlement account
  // until the batch is reconciled.
  if (
    willCreateRentalPayment &&
    rentalAmount > 0 &&
    !input.isCardPayment &&
    rentalPaymentId &&
    input.paymentAccountId &&
    input.receivableAccountId
  ) {
    const paymentLegs: JournalLeg[] = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.paymentAccountId,
        debit: Money.php(rentalAmount),
        credit: Money.zero(),
        description: `Order ${orderId} rental payment received`,
        referenceType: 'payment',
        referenceId: rentalPaymentId,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.zero(),
        credit: Money.php(rentalAmount),
        description: `Order ${orderId} receivable reduced`,
        referenceType: 'payment',
        referenceId: rentalPaymentId,
      },
    ];
    for (const leg of paymentLegs) journalLegs.push(serialiseLeg(leg));
  }

  // (c) Deposit payment legs.
  if (
    willCreateDepositPayment &&
    depositPaymentId &&
    input.paymentAccountId &&
    input.depositLiabilityAccountId
  ) {
    const depositLegs: JournalLeg[] = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.paymentAccountId,
        debit: Money.php(depositAmount),
        credit: Money.zero(),
        description: `Order ${orderId} deposit received`,
        referenceType: 'payment',
        referenceId: depositPaymentId,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.depositLiabilityAccountId,
        debit: Money.zero(),
        credit: Money.php(depositAmount),
        description: `Order ${orderId} deposit liability`,
        referenceType: 'payment',
        referenceId: depositPaymentId,
      },
    ];
    for (const leg of depositLegs) journalLegs.push(serialiseLeg(leg));
  }

  // (d) Charity legs — always posted when charity_donation > 0 (AC-09).
  // The receivable account is resolved inline if the caller did not supply
  // one so charity is never silently skipped regardless of payment method.
  if (charityAmount > 0) {
    let charityReceivableId = input.receivableAccountId;
    if (!charityReceivableId) {
      const { data: arAccts } = await supabase
        .from('chart_of_accounts')
        .select('id, name, account_type')
        .in('store_id', [input.storeId, 'company'])
        .eq('is_active', true);
      const arRow = (
        (arAccts ?? []) as Array<{ id: string; name: string; account_type: string }>
      ).find(
        (a) => a.account_type === 'Asset' && a.name.toLowerCase().includes('receivable'),
      );
      if (!arRow) {
        throw new Error(
          `No Accounts Receivable account found for store ${input.storeId} — cannot post charity journal`,
        );
      }
      charityReceivableId = arRow.id;
    }
    const charityPayableAccountId = await resolveCharityPayableAccount(input.storeId);
    if (charityPayableAccountId) {
      const charityLegs: JournalLeg[] = [
        {
          entryId: crypto.randomUUID(),
          accountId: charityReceivableId,
          debit: Money.php(charityAmount),
          credit: Money.zero(),
          description: `${input.customer.name} charity donation receivable (Be Pawsitive)`,
          referenceType: 'order_charity',
          referenceId: orderId,
        },
        {
          entryId: crypto.randomUUID(),
          accountId: charityPayableAccountId,
          debit: Money.zero(),
          credit: Money.php(charityAmount),
          description: `${input.customer.name} charity donation payable (Be Pawsitive)`,
          referenceType: 'order_charity',
          referenceId: orderId,
        },
      ];
      for (const leg of charityLegs) journalLegs.push(serialiseLeg(leg));
    }
  }

  // (e) Transfer legs — DR AR + CR Income when the transfer is billed through Lola's.
  // Skipped when the customer pays the driver directly (excludeTransferFromBalance).
  if (transferBillable > 0 && input.receivableAccountId && input.incomeAccountId) {
    const transferLegs: JournalLeg[] = [
      {
        entryId: crypto.randomUUID(),
        accountId: input.receivableAccountId,
        debit: Money.php(transferBillable),
        credit: Money.zero(),
        description: `Order ${orderId} transfer fee receivable`,
        referenceType: 'order',
        referenceId: orderId,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: input.incomeAccountId,
        debit: Money.zero(),
        credit: Money.php(transferBillable),
        description: `Order ${orderId} transfer fee income`,
        referenceType: 'order',
        referenceId: orderId,
      },
    ];
    for (const leg of transferLegs) journalLegs.push(serialiseLeg(leg));
  }

  // ── 9. Build transfer payload (link-existing or create-new). ─
  let transferRow: Record<string, unknown> | null = null;
  if (rawOrder.transfer_type && rawOrder.transfer_route) {
    const existingTransfer = rawOrder.order_reference
      ? await deps.transferRepo.findByBookingToken(
          rawOrder.order_reference as string,
        )
      : null;

    const nowIso = new Date().toISOString();
    if (existingTransfer) {
      // Relink the pre-created online booking transfer. ON CONFLICT
      // in the RPC only refreshes order_id + updated_at so the
      // original customer/route data is preserved.
      transferRow = {
        id: existingTransfer.id,
        order_id: orderId,
        service_date: existingTransfer.serviceDate,
        customer_name: existingTransfer.customerName,
        contact_number: existingTransfer.contactNumber,
        customer_email: existingTransfer.customerEmail,
        customer_type: existingTransfer.customerType,
        route: existingTransfer.route,
        flight_time: existingTransfer.flightTime,
        pax_count: existingTransfer.paxCount,
        van_type: existingTransfer.vanType,
        accommodation: existingTransfer.accommodation,
        status: existingTransfer.status,
        ops_notes: existingTransfer.opsNotes,
        total_price: existingTransfer.totalPrice.toNumber(),
        payment_method: existingTransfer.paymentMethod,
        payment_status: existingTransfer.paymentStatus,
        driver_fee: existingTransfer.driverFee?.toNumber() ?? null,
        net_profit: existingTransfer.netProfit?.toNumber() ?? null,
        driver_paid_status: existingTransfer.driverPaidStatus,
        booking_source: existingTransfer.bookingSource,
        booking_token: existingTransfer.bookingToken,
        store_id: existingTransfer.storeId,
        created_at: existingTransfer.createdAt.toISOString(),
        updated_at: nowIso,
      };
    } else {
      const serviceDate = rawOrder.pickup_datetime
        ? new Date(rawOrder.pickup_datetime as string)
            .toISOString()
            .split('T')[0]
        : formatManilaDate();
      // rawPayload and transferAmount are already extracted at the top of step 5.
      const paxCount =
        'transfer_pax_count' in rawPayload
          ? Number(rawPayload.transfer_pax_count ?? 1)
          : 1;

      // Prefer the value explicitly passed from the BookingModal (staff can edit
      // it in the summary step). Fall back to payload.accommodation_name which
      // is submitted automatically from the customer-facing basket.
      const accommodationName =
        typeof input.transferAccommodation === 'string' && input.transferAccommodation.trim()
          ? input.transferAccommodation.trim()
          : typeof rawPayload.accommodation_name === 'string' && rawPayload.accommodation_name.trim()
            ? rawPayload.accommodation_name.trim()
            : null;

      // When the customer pays the driver directly the transfer is already
      // financially settled — mark it collected so staff don't chase it.
      const driverDirectPayment = input.excludeTransferFromBalance === true;
      const transferPaymentStatus = driverDirectPayment ? 'Paid' : 'Pending';

      const fresh = Transfer.create({
        id: crypto.randomUUID(),
        orderId,
        serviceDate,
        customerName: rawOrder.customer_name as string,
        contactNumber: (rawOrder.customer_mobile as string | null) ?? null,
        customerEmail: (rawOrder.customer_email as string | null) ?? null,
        customerType: 'Online',
        route: rawOrder.transfer_route as string,
        flightTime: (rawOrder.flight_arrival_time as string | null) ?? null,
        flightNumber: null,
        paxCount,
        vanType: rawOrder.transfer_type as string,
        accommodation: accommodationName,
        status: 'Pending',
        opsNotes: null,
        totalPrice: Money.php(transferAmount),
        paymentMethod: null,
        paymentStatus: transferPaymentStatus,
        driverFee: null,
        netProfit: null,
        driverPaidStatus: null,
        bookingSource: 'Online',
        bookingToken: null,
        storeId: rawOrder.store_id as string,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      transferRow = {
        id: fresh.id,
        order_id: orderId,
        service_date: fresh.serviceDate,
        customer_name: fresh.customerName,
        contact_number: fresh.contactNumber,
        customer_email: fresh.customerEmail,
        customer_type: fresh.customerType,
        route: fresh.route,
        flight_time: fresh.flightTime,
        pax_count: fresh.paxCount,
        van_type: fresh.vanType,
        accommodation: fresh.accommodation,
        status: fresh.status,
        ops_notes: fresh.opsNotes,
        total_price: fresh.totalPrice.toNumber(),
        payment_method: fresh.paymentMethod,
        payment_status: fresh.paymentStatus,
        // When the driver collected the payment, stamp collected_at now so the
        // Transfers page immediately shows the row as settled.
        collected_at: driverDirectPayment ? nowIso : null,
        driver_fee: fresh.driverFee?.toNumber() ?? null,
        net_profit: fresh.netProfit?.toNumber() ?? null,
        driver_paid_status: fresh.driverPaidStatus,
        booking_source: fresh.bookingSource,
        booking_token: fresh.bookingToken,
        store_id: fresh.storeId,
        created_at: fresh.createdAt.toISOString(),
        updated_at: fresh.updatedAt.toISOString(),
      };
    }
  }

  // ── 10. Invoke the single atomic RPC. ─────────────────────
  const journalTransactionId =
    journalLegs.length > 0 ? crypto.randomUUID() : '';
  const journalDate = formatManilaDate();
  const journalPeriod = journalDate.slice(0, 7);

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'process_raw_order_atomic',
    {
      p_raw_order_id: input.rawOrderId,
      p_order_id: orderId,
      p_store_id: input.storeId,
      p_customer_row: customerRow,
      p_order_row: orderRow,
      p_order_items: orderItems,
      p_order_addons: orderAddons,
      p_fleet_updates: fleetUpdates,
      p_rental_payment: rentalPayment,
      p_deposit_payment: depositPayment,
      p_card_settlement: cardSettlement,
      p_transfer_row: transferRow,
      p_journal_transaction_id: journalTransactionId,
      p_journal_period: journalPeriod,
      p_journal_date: journalDate,
      p_journal_legs: journalLegs,
      p_settled_at: new Date().toISOString(),
    },
  );

  if (rpcErr) {
    throw new Error(
      `process_raw_order_atomic RPC failed (rawOrderId=${input.rawOrderId}, orderId=${orderId}): ${rpcErr.message}`,
    );
  }

  // Supabase returns TABLE functions as an array of rows.
  const resultRow = Array.isArray(rpcData)
    ? (rpcData[0] as { order_id: string; was_new: boolean } | undefined)
    : (rpcData as { order_id: string; was_new: boolean } | null);

  const wasNew = resultRow?.was_new === true;

  // The activation modal may intentionally change the renter name from the
  // original Inbox booking (for example, Zane -> Reymar for one scooter).
  // The insert trigger initially snapshots orders_raw.customer_name, so replace
  // that snapshot with the final name explicitly submitted at activation.
  const finalBookingCustomerName = input.customer.name.trim();
  const { error: bookingNameErr } = await supabase
    .from('orders')
    .update({ booking_customer_name: finalBookingCustomerName })
    .eq('id', orderId);
  if (bookingNameErr) {
    throw new Error(
      `Failed to preserve activation customer name for order ${orderId}: ${bookingNameErr.message}`,
    );
  }

  // Keep this booking's archived source row consistent with the activated
  // order. The other raw booking is a different row and remains unchanged.
  const { error: rawBookingNameErr } = await supabase
    .from('orders_raw')
    .update({ customer_name: finalBookingCustomerName })
    .eq('id', input.rawOrderId);
  if (rawBookingNameErr) {
    throw new Error(
      `Failed to preserve activation customer name for raw order ${input.rawOrderId}: ${rawBookingNameErr.message}`,
    );
  }

  const partnerRef = (rawOrder as { partner_ref?: string | null }).partner_ref?.trim() || null;
  if (partnerRef) {
    const { error: partnerRefErr } = await supabase
      .from('orders')
      .update({ partner_ref: partnerRef })
      .eq('id', orderId)
      .is('partner_ref', null);
    if (partnerRefErr) {
      throw new Error(`Failed to preserve partner_ref on activated order ${orderId}: ${partnerRefErr.message}`);
    }
  }

  // ── 11. Reload the persisted order so we return a clean
  // domain object with the DB-canonical values.
  const reloaded = await deps.orderRepo.findById(orderId);
  if (!reloaded) {
    throw new Error(
      `process_raw_order_atomic succeeded but order ${orderId} could not be reloaded`,
    );
  }

  // ── 12. Auto-link pre-booking waivers and inspections. ───
  // If staff captured a waiver or inspection before the booking existed
  // (via the Quick Check-In flow), those records have customer_id set but
  // no order_reference / order_id. Link them now that the order is confirmed.
  const bookingToken = rawOrder.order_reference as string | null;
  if (bookingToken && customer.id) {
    await Promise.all([
      supabase
        .from('waivers')
        .update({ order_reference: bookingToken })
        .eq('customer_id', customer.id)
        .is('order_reference', null),
      supabase
        .from('inspections')
        .update({ order_id: orderId, order_reference: bookingToken })
        .eq('customer_id', customer.id)
        .is('order_id', null),
    ]);
  }

  if (!wasNew) {
    // On a safe retry we surface the existing order and its customer
    // so the caller can short-circuit without re-sending notifications.
    const existingCustomer = reloaded.customerId
      ? await deps.customerRepo.findById(reloaded.customerId)
      : null;
    return {
      order: reloaded,
      customer: existingCustomer,
      alreadyProcessed: true,
    };
  }

  return { order: reloaded, customer, alreadyProcessed: false };
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
