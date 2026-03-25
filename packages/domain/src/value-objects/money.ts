import { InvalidAmountError } from '../errors/domain-error.js';

const CURRENCY_SYMBOL = '₱';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function validate(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new InvalidAmountError(amount);
  }
  return round2(amount);
}

export class Money {
  readonly amount: number;

  private constructor(amount: number) {
    this.amount = validate(amount);
    Object.freeze(this);
  }

  static php(amount: number): Money {
    return new Money(amount);
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.amount + other.amount);
  }

  subtract(other: Money): Money {
    return new Money(this.amount - other.amount);
  }

  multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new InvalidAmountError(factor);
    }
    return new Money(this.amount * factor);
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount;
  }

  toNumber(): number {
    return this.amount;
  }

  formatCurrency(): string {
    const abs = Math.abs(this.amount);
    const formatted = abs.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return this.amount < 0
      ? `-${CURRENCY_SYMBOL}${formatted}`
      : `${CURRENCY_SYMBOL}${formatted}`;
  }
}
