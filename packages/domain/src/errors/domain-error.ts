export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnbalancedTransactionError extends DomainError {
  constructor(debitTotal: number, creditTotal: number) {
    super(
      `Transaction is unbalanced: debits (${debitTotal}) != credits (${creditTotal})`,
    );
  }
}

export class InvalidStatusTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Cannot transition from "${from}" to "${to}"`);
  }
}

export class InsufficientLeaveBalanceError extends DomainError {
  constructor(
    available: number,
    requested: number,
    type?: 'holiday' | 'sick',
  ) {
    super(
      type
        ? `Insufficient ${type} leave: ${available} remaining, ${requested} requested`
        : `Insufficient leave balance: ${available} available, ${requested} requested`,
    );
  }
}

export class NonRentableVehicleError extends DomainError {
  constructor(vehicleId: string, reason: string) {
    super(`Vehicle "${vehicleId}" is not rentable: ${reason}`);
  }
}

/** An entry broke one or more business rules; each reason is shown to the user. */
export class EntryRejectedError extends DomainError {
  constructor(public readonly reasons: string[]) {
    super(reasons.join(' '));
  }
}

/** An entry looks unusual; it is saved only after the user confirms each warning. */
export class ConfirmationRequiredError extends DomainError {
  constructor(public readonly confirmations: Array<{ code: string; message: string }>) {
    super(confirmations.map((c) => c.message).join(' '));
  }
}

export class InvalidAmountError extends DomainError {
  constructor(amount: unknown) {
    super(`Invalid monetary amount: ${String(amount)}`);
  }
}
