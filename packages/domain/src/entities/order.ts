import { Money } from '../value-objects/money.js';
import { OrderStatus } from '../value-objects/order-status.js';
import {
  InvalidStatusTransitionError,
  InvalidAmountError,
} from '../errors/domain-error.js';

export interface OrderAddonData {
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
  mutualExclusivityGroup?: string;
}

export interface OrderProps {
  id: string;
  storeId: string;
  wooOrderId?: string | null;
  customerId: string | null;
  employeeId: string | null;
  orderDate: string;
  status: OrderStatus;
  webNotes: string | null;
  quantity: number;
  webQuoteRaw: number | null;
  securityDeposit: Money;
  depositStatus: string | null;
  cardFeeSurcharge: Money;
  returnCharges: Money;
  finalTotal: Money;
  balanceDue: Money;
  paymentMethodId: string | null;
  depositMethodId: string | null;
  bookingToken: string | null;
  tips: Money;
  charityDonation: Money;
  addons: OrderAddonData[];
  createdAt: Date;
  updatedAt: Date;
}

export class Order {
  readonly id: string;
  readonly storeId: string;
  readonly customerId: string | null;
  readonly orderDate: string;
  readonly webNotes: string | null;
  readonly quantity: number;
  readonly webQuoteRaw: number | null;
  readonly paymentMethodId: string | null;
  readonly depositMethodId: string | null;
  readonly bookingToken: string | null;
  readonly wooOrderId: string | null;
  readonly createdAt: Date;

  private _employeeId: string | null;
  private _status: OrderStatus;
  private _securityDeposit: Money;
  private _depositStatus: string | null;
  private _cardFeeSurcharge: Money;
  private _returnCharges: Money;
  private _finalTotal: Money;
  private _balanceDue: Money;
  private _tips: Money;
  private _charityDonation: Money;
  private _addons: OrderAddonData[];
  private _updatedAt: Date;

  private constructor(props: OrderProps) {
    this.id = props.id;
    this.storeId = props.storeId;
    this.customerId = props.customerId;
    this.orderDate = props.orderDate;
    this.webNotes = props.webNotes;
    this.quantity = props.quantity;
    this.webQuoteRaw = props.webQuoteRaw;
    this.paymentMethodId = props.paymentMethodId;
    this.depositMethodId = props.depositMethodId;
    this.bookingToken = props.bookingToken;
    this.wooOrderId = props.wooOrderId ?? null;
    this.createdAt = props.createdAt;

    this._employeeId = props.employeeId;
    this._status = props.status;
    this._securityDeposit = props.securityDeposit;
    this._depositStatus = props.depositStatus;
    this._cardFeeSurcharge = props.cardFeeSurcharge;
    this._returnCharges = props.returnCharges;
    this._finalTotal = props.finalTotal;
    this._balanceDue = props.balanceDue;
    this._tips = props.tips;
    this._charityDonation = props.charityDonation;
    this._addons = [...props.addons];
    this._updatedAt = props.updatedAt;
  }

  get employeeId(): string | null { return this._employeeId; }
  get status(): OrderStatus { return this._status; }
  get securityDeposit(): Money { return this._securityDeposit; }
  get depositStatus(): string | null { return this._depositStatus; }
  get cardFeeSurcharge(): Money { return this._cardFeeSurcharge; }
  get returnCharges(): Money { return this._returnCharges; }
  get finalTotal(): Money { return this._finalTotal; }
  get balanceDue(): Money { return this._balanceDue; }
  get tips(): Money { return this._tips; }
  get charityDonation(): Money { return this._charityDonation; }
  get addons(): ReadonlyArray<OrderAddonData> { return this._addons; }
  get updatedAt(): Date { return this._updatedAt; }

  static create(props: OrderProps): Order {
    return new Order(props);
  }

  toJSON() {
    return {
      id: this.id,
      storeId: this.storeId,
      wooOrderId: this.wooOrderId,
      customerId: this.customerId,
      employeeId: this._employeeId,
      orderDate: this.orderDate,
      status: this._status,
      webNotes: this.webNotes,
      quantity: this.quantity,
      webQuoteRaw: this.webQuoteRaw,
      securityDeposit: this._securityDeposit,
      depositStatus: this._depositStatus,
      cardFeeSurcharge: this._cardFeeSurcharge,
      returnCharges: this._returnCharges,
      finalTotal: this._finalTotal,
      balanceDue: this._balanceDue,
      paymentMethodId: this.paymentMethodId,
      depositMethodId: this.depositMethodId,
      bookingToken: this.bookingToken,
      tips: this._tips,
      charityDonation: this._charityDonation,
      addons: this._addons,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  activate(employeeId: string, vehicleCount: number): void {
    if (vehicleCount < 1) {
      throw new InvalidAmountError('Cannot activate order with 0 vehicles');
    }
    const target = OrderStatus.Active;
    if (!this._status.canTransitionTo(target)) {
      throw new InvalidStatusTransitionError(this._status.value, target.value);
    }
    this._status = this._status.transitionTo(target);
    this._employeeId = employeeId;
    this._updatedAt = new Date();
  }

  settle(): void {
    const target = OrderStatus.Completed;
    if (!this._status.canTransitionTo(target)) {
      throw new InvalidStatusTransitionError(this._status.value, target.value);
    }
    this._status = this._status.transitionTo(target);
    this._updatedAt = new Date();
  }

  cancel(): void {
    const target = OrderStatus.Cancelled;
    if (!this._status.canTransitionTo(target)) {
      throw new InvalidStatusTransitionError(this._status.value, target.value);
    }
    this._status = this._status.transitionTo(target);
    this._updatedAt = new Date();
  }

  addAddon(addon: OrderAddonData): void {
    if (addon.mutualExclusivityGroup) {
      this._addons = this._addons.filter(
        (a) => a.mutualExclusivityGroup !== addon.mutualExclusivityGroup,
      );
    }
    this._addons.push(addon);
    this._updatedAt = new Date();
  }

  adjustTotal(delta: Money): void {
    this._finalTotal = this._finalTotal.add(delta);
    this._balanceDue = this._balanceDue.add(delta);
    this._updatedAt = new Date();
  }

  calculateBalanceDue(totalPayments: Money): Money {
    return this._finalTotal.subtract(totalPayments);
  }

  applyPayments(totalPayments: Money): void {
    this._balanceDue = this._finalTotal.subtract(totalPayments);
    this._updatedAt = new Date();
  }
}
