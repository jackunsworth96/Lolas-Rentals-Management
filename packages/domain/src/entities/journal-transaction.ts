import { Money } from '../value-objects/money.js';
import { DomainError, UnbalancedTransactionError } from '../errors/domain-error.js';

export class InvalidJournalLegError extends DomainError {
  constructor(entryId: string) {
    super(
      `Journal leg ${entryId} must have either debit > 0 or credit > 0, not both`,
    );
    this.name = 'InvalidJournalLegError';
  }
}

export interface JournalLeg {
  entryId: string;
  accountId: string;
  debit: Money;
  credit: Money;
  description: string | null;
  referenceType: string;
  referenceId: string | null;
}

export interface JournalTransactionProps {
  transactionId: string;
  period: string;
  date: string;
  storeId: string;
  legs: JournalLeg[];
  createdBy: string | null;
}

export class JournalTransaction {
  readonly transactionId: string;
  readonly period: string;
  readonly date: string;
  readonly storeId: string;
  readonly legs: ReadonlyArray<JournalLeg>;
  readonly createdBy: string | null;

  private constructor(props: JournalTransactionProps) {
    this.transactionId = props.transactionId;
    this.period = props.period;
    this.date = props.date;
    this.storeId = props.storeId;
    this.legs = Object.freeze([...props.legs]);
    this.createdBy = props.createdBy;
  }

  static create(props: JournalTransactionProps): JournalTransaction {
    for (const leg of props.legs) {
      const d = leg.debit.toNumber();
      const c = leg.credit.toNumber();
      const bothPositive = d > 0 && c > 0;
      const bothZero = d === 0 && c === 0;
      if (bothPositive || bothZero) {
        throw new InvalidJournalLegError(leg.entryId);
      }
    }

    const totals = props.legs.reduce(
      (acc, leg) => ({
        debits: acc.debits.add(leg.debit),
        credits: acc.credits.add(leg.credit),
      }),
      { debits: Money.zero(), credits: Money.zero() },
    );

    if (totals.debits.toNumber() !== totals.credits.toNumber()) {
      throw new UnbalancedTransactionError(
        totals.debits.toNumber(),
        totals.credits.toNumber(),
      );
    }

    return new JournalTransaction(props);
  }

  isBalanced(): boolean {
    const totals = this.legs.reduce(
      (acc, leg) => ({
        debits: acc.debits.add(leg.debit),
        credits: acc.credits.add(leg.credit),
      }),
      { debits: Money.zero(), credits: Money.zero() },
    );
    return totals.debits.toNumber() === totals.credits.toNumber();
  }
}
