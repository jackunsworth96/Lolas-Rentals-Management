import { InvalidStatusTransitionError } from '../errors/domain-error.js';

const TRANSITIONS: Record<string, readonly string[]> = {
  unprocessed: ['active', 'cancelled'],
  active: ['confirmed', 'completed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
} as const;

const VALID_VALUES = Object.keys(TRANSITIONS);

export class OrderStatus {
  static readonly Unprocessed = new OrderStatus('unprocessed');
  static readonly Active = new OrderStatus('active');
  static readonly Confirmed = new OrderStatus('confirmed');
  static readonly Completed = new OrderStatus('completed');
  static readonly Cancelled = new OrderStatus('cancelled');

  readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static from(value: string): OrderStatus {
    const normalized = value.toLowerCase().trim();
    if (!VALID_VALUES.includes(normalized)) {
      throw new Error(`Invalid order status: "${value}"`);
    }
    return new OrderStatus(normalized);
  }

  canTransitionTo(target: OrderStatus): boolean {
    const allowed = TRANSITIONS[this.value];
    return allowed !== undefined && allowed.includes(target.value);
  }

  transitionTo(target: OrderStatus): OrderStatus {
    if (!this.canTransitionTo(target)) {
      throw new InvalidStatusTransitionError(this.value, target.value);
    }
    return target;
  }

  equals(other: OrderStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
