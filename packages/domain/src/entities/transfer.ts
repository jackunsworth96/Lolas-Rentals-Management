import { Money } from '../value-objects/money.js';

export type TransferPaymentStatus = 'Pending' | 'Partially Paid' | 'Paid';

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
    });
  }
}
