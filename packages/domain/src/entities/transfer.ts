import { Money } from '../value-objects/money.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TransferPaymentStatus = 'Pending' | 'Partially Paid' | 'Paid';

/** Who takes the customer's money: Lola's staff, or the driver directly. */
export type TransferCollector = 'lolas' | 'driver';

export interface TransferProps {
  id: string;
  orderId: string | null;
  serviceDate: string;
  customerName: string;
  contactNumber: string | null;
  customerEmail: string | null;
  customerType: 'Walk-in' | 'Online' | null;
  route: string;
  flightTime: string | null;
  flightNumber: string | null;
  paxCount: number;
  vanType: string | null;
  accommodation: string | null;
  status: string;
  opsNotes: string | null;
  totalPrice: Money;
  paymentMethod: string | null;
  paymentStatus: TransferPaymentStatus;
  driverFee: Money | null;
  netProfit: Money | null;
  driverPaidStatus: string | null;
  bookingSource: string | null;
  bookingToken: string | null;
  storeId: string;
  createdAt: Date;
  updatedAt: Date;
  /** Set when cash for this transfer has been physically collected by the store. */
  collectedAt?: Date | null;
  /** Actual amount collected (may differ from totalPrice if discounted). */
  collectedAmount?: number | null;
  /** driver_cut from the matching transfer_routes row (read-only, not persisted on this entity). */
  routeDriverCut?: number | null;
  /** pricing_type from the matching transfer_routes row ('fixed' | 'per_head'). */
  routePricingType?: 'fixed' | 'per_head' | null;
  /** Scheduled pickup time in HH:MM format, stored as Postgres time. */
  pickupTime?: string | null;
  /** Upper bound of the pickup window in HH:MM format (shared van only). */
  pickupTimeEnd?: string | null;
  /** Telegram message_id returned after posting to the driver channel. */
  telegramMessageId?: string | null;
  /** Whether the driver has tapped the Confirm button in Telegram. */
  driverConfirmed?: boolean;
  /** Timestamp when the driver tapped Confirm. */
  driverConfirmedAt?: Date | null;
  /** Expected collector, chosen at booking. */
  collectVia?: TransferCollector;
  /** Who took the most recent payment; null until anything is paid. */
  collectedBy?: TransferCollector | null;
  /** Running total paid by the customer, whoever took it. */
  amountPaid?: number;
  /** Portion of amountPaid the driver is holding until settlement. */
  driverCollectedAmount?: number;
  /** Driver cut snapshotted at creation (per-head cut x pax for shared vans). */
  driverCut?: number | null;
  /** Fare is part of the linked order's balance, so payments go through the order. */
  billedToOrder?: boolean;
  driverSettledAt?: Date | null;
  driverSettlementId?: string | null;
}

export class Transfer {
  readonly id: string;
  readonly orderId: string | null;
  readonly serviceDate: string;
  readonly customerName: string;
  readonly contactNumber: string | null;
  readonly customerEmail: string | null;
  readonly customerType: 'Walk-in' | 'Online' | null;
  readonly route: string;
  readonly flightTime: string | null;
  readonly flightNumber: string | null;
  readonly paxCount: number;
  readonly vanType: string | null;
  readonly accommodation: string | null;
  readonly status: string;
  readonly opsNotes: string | null;
  readonly totalPrice: Money;
  readonly paymentMethod: string | null;
  readonly paymentStatus: TransferPaymentStatus;
  readonly driverFee: Money | null;
  readonly netProfit: Money | null;
  readonly driverPaidStatus: string | null;
  readonly bookingSource: string | null;
  readonly bookingToken: string | null;
  readonly storeId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly collectedAt: Date | null;
  readonly collectedAmount: number | null;
  readonly routeDriverCut: number | null;
  readonly routePricingType: 'fixed' | 'per_head' | null;
  readonly pickupTime: string | null;
  readonly pickupTimeEnd: string | null;
  readonly telegramMessageId: string | null;
  readonly driverConfirmed: boolean;
  readonly driverConfirmedAt: Date | null;
  readonly collectVia: TransferCollector;
  readonly collectedBy: TransferCollector | null;
  readonly amountPaid: number;
  readonly driverCollectedAmount: number;
  readonly driverCut: number | null;
  readonly billedToOrder: boolean;
  readonly driverSettledAt: Date | null;
  readonly driverSettlementId: string | null;

  private constructor(props: TransferProps) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.serviceDate = props.serviceDate;
    this.customerName = props.customerName;
    this.contactNumber = props.contactNumber;
    this.customerEmail = props.customerEmail;
    this.customerType = props.customerType;
    this.route = props.route;
    this.flightTime = props.flightTime;
    this.flightNumber = props.flightNumber;
    this.paxCount = props.paxCount;
    this.vanType = props.vanType;
    this.accommodation = props.accommodation;
    this.status = props.status;
    this.opsNotes = props.opsNotes;
    this.totalPrice = props.totalPrice;
    this.paymentMethod = props.paymentMethod;
    this.paymentStatus = props.paymentStatus;
    this.driverFee = props.driverFee;
    this.netProfit = props.netProfit;
    this.driverPaidStatus = props.driverPaidStatus;
    this.bookingSource = props.bookingSource;
    this.bookingToken = props.bookingToken;
    this.storeId = props.storeId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.collectedAt = props.collectedAt ?? null;
    this.collectedAmount = props.collectedAmount ?? null;
    this.routeDriverCut = props.routeDriverCut ?? null;
    this.routePricingType = props.routePricingType ?? null;
    this.pickupTime = props.pickupTime ?? null;
    this.pickupTimeEnd = props.pickupTimeEnd ?? null;
    this.telegramMessageId = props.telegramMessageId ?? null;
    this.driverConfirmed = props.driverConfirmed ?? false;
    this.driverConfirmedAt = props.driverConfirmedAt ?? null;
    this.collectVia = props.collectVia ?? 'lolas';
    this.collectedBy = props.collectedBy ?? null;
    this.amountPaid = props.amountPaid ?? 0;
    this.driverCollectedAmount = props.driverCollectedAmount ?? 0;
    this.driverCut = props.driverCut ?? null;
    this.billedToOrder = props.billedToOrder ?? false;
    this.driverSettledAt = props.driverSettledAt ?? null;
    this.driverSettlementId = props.driverSettlementId ?? null;
  }

  /** Amount the customer still owes. */
  balanceDue(): number {
    return Math.max(0, round2(this.totalPrice.toNumber() - this.amountPaid));
  }

  /** Saved driver cut, falling back to the current route config for legacy rows. */
  effectiveDriverCut(): number {
    if (this.driverCut != null) return this.driverCut;
    if (this.routeDriverCut == null) return 0;
    return this.routePricingType === 'per_head'
      ? this.routeDriverCut * Math.max(this.paxCount, 1)
      : this.routeDriverCut;
  }

  /** Records a customer payment taken by Lola's or by the driver; amounts accumulate. */
  withPaymentReceived(amount: number, collector: TransferCollector, paymentMethod: string | null): Transfer {
    const amountPaid = round2(this.amountPaid + amount);
    const driverCollectedAmount = collector === 'driver'
      ? round2(this.driverCollectedAmount + amount)
      : this.driverCollectedAmount;
    return Transfer.create({
      ...(this as unknown as TransferProps),
      amountPaid,
      driverCollectedAmount,
      collectedBy: collector,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      paymentStatus: this.derivePaymentStatus(Money.php(amountPaid)),
      collectedAt: this.collectedAt ?? new Date(),
      collectedAmount: amountPaid,
      updatedAt: new Date(),
    });
  }

  withCollectVia(collectVia: TransferCollector): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      collectVia,
      updatedAt: new Date(),
    });
  }

  withDriverSettled(settlementId: string, settledAt: Date): Transfer {
    const cut = Money.php(this.effectiveDriverCut());
    return Transfer.create({
      ...(this as unknown as TransferProps),
      driverCut: cut.toNumber(),
      driverFee: cut,
      netProfit: this.totalPrice.subtract(cut),
      driverPaidStatus: 'Paid',
      driverSettledAt: settledAt,
      driverSettlementId: settlementId,
      updatedAt: new Date(),
    });
  }

  static create(props: TransferProps): Transfer {
    return new Transfer(props);
  }

  derivePaymentStatus(totalPaid: Money): TransferPaymentStatus {
    const paid = totalPaid.toNumber();
    const total = this.totalPrice.toNumber();

    if (paid <= 0) return 'Pending';
    if (paid >= total) return 'Paid';
    return 'Partially Paid';
  }

  calculateNetProfit(): Money {
    const fee = this.driverFee ?? Money.zero();
    return this.totalPrice.subtract(fee);
  }

  withPaymentRecorded(paymentMethod: string, paymentStatus: TransferPaymentStatus): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      paymentMethod,
      paymentStatus,
      updatedAt: new Date(),
    });
  }

  withDriverPaid(driverFee: Money): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      driverFee,
      netProfit: this.totalPrice.subtract(driverFee),
      driverPaidStatus: 'Paid',
      updatedAt: new Date(),
    });
  }

  withCollected(collectedAt: Date, collectedAmount: number): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      collectedAt,
      collectedAmount,
    });
  }

  withPickupTime(time: string | null): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      pickupTime: time,
      pickupTimeEnd: null,
      updatedAt: new Date(),
    });
  }

  withPickupWindow(pickupTime: string, pickupTimeEnd: string | null): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      pickupTime,
      pickupTimeEnd,
      updatedAt: new Date(),
    });
  }

  withAccommodation(accommodation: string | null): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      accommodation,
      updatedAt: new Date(),
    });
  }

  withStatus(status: string): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      status,
      updatedAt: new Date(),
    });
  }

  /** Called after successfully posting to Telegram. Stores the message ID and calculated pickup window. */
  withTelegramSent(messageId: string, pickupTime: string, pickupTimeEnd: string | null): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      telegramMessageId: messageId,
      pickupTime,
      pickupTimeEnd,
      updatedAt: new Date(),
    });
  }

  /** Called when flight time is amended. Resets driver confirmation and updates pickup window. */
  withFlightTimeAmended(flightTime: string, pickupTime: string, pickupTimeEnd: string | null): Transfer {
    return Transfer.create({
      ...(this as unknown as TransferProps),
      flightTime,
      pickupTime,
      pickupTimeEnd,
      driverConfirmed: false,
      driverConfirmedAt: null,
      updatedAt: new Date(),
    });
  }
}
