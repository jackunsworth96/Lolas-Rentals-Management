import { InvalidAmountError } from '../errors/domain-error.js';

const CURRENCY_SYMBOL = '₱';

/** Convert pesos (float) to integer centavos, safely */
function toCentavos(pesos: number): number {
  if (!Number.isFinite(pesos)) {
    throw new InvalidAmountError(pesos);
  }
  // toPrecision(15) strips IEEE 754 noise (e.g. 1.005*100 → 100.4999… → "100.500000000000")
  // then Math.round produces the correct integer centavos.
  return Math.round(+(pesos * 100).toPrecision(15));
}

/** Convert integer centavos back to pesos */
function toPhp(centavos: number): number {
  return centavos / 100;
}

export class Money {
  /** Internal representation: integer centavos. Never expose directly. */
  private readonly _centavos: number;

  /** Public amount in pesos (2dp). Read-only for compatibility. */
  get amount(): number {
    return toPhp(this._centavos);
  }

  private constructor(centavos: number) {
    this._centavos = centavos;
    Object.freeze(this);
  }

  static php(pesos: number): Money {
    return new Money(toCentavos(pesos));
  }

  static zero(): Money {
    return new Money(0);
  }

  /** Create directly from centavos (integer). For internal use. */
  private static fromCentavos(centavos: number): Money {
    return new Money(centavos);
  }

  add(other: Money): Money {
    return Money.fromCentavos(this._centavos + other._centavos);
  }

  subtract(other: Money): Money {
    return Money.fromCentavos(this._centavos - other._centavos);
  }

  multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new InvalidAmountError(factor);
    }
    // Multiply centavos by factor, then round to integer centavos.
    return new Money(Math.round(this._centavos * factor));
  }

  isPositive(): boolean {
    return this._centavos > 0;
  }

  isZero(): boolean {
    return this._centavos === 0;
  }

  isNegative(): boolean {
    return this._centavos < 0;
  }

  equals(other: Money): boolean {
    return this._centavos === other._centavos;
  }

  toNumber(): number {
    return toPhp(this._centavos);
  }

  formatCurrency(): string {
    const abs = Math.abs(this.amount);
    const formatted = abs.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return this._centavos < 0
      ? `-${CURRENCY_SYMBOL}${formatted}`
      : `${CURRENCY_SYMBOL}${formatted}`;
  }
}
