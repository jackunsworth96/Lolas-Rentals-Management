import { Money } from '../value-objects/money.js';
import { InvalidAmountError } from '../errors/domain-error.js';

/**
 * When settling an order, the security deposit paid by the customer reduces
 * the balance due. Any excess deposit is refundable.
 *
 * refund = max(0, securityDeposit - balanceDueBeforeDeposit)
 */
export function calculateRefundableDeposit(
  securityDeposit: Money,
  balanceDueBeforeDeposit: Money,
): { amountApplied: Money; refund: Money } {
  if (securityDeposit.isNegative()) {
    throw new InvalidAmountError('Security deposit cannot be negative');
  }

  if (balanceDueBeforeDeposit.isNegative()) {
    return { amountApplied: Money.zero(), refund: securityDeposit };
  }

  if (balanceDueBeforeDeposit.isZero()) {
    return { amountApplied: Money.zero(), refund: securityDeposit };
  }

  const depositNum = securityDeposit.toNumber();
  const balanceNum = balanceDueBeforeDeposit.toNumber();

  if (depositNum >= balanceNum) {
    return {
      amountApplied: balanceDueBeforeDeposit,
      refund: Money.php(depositNum - balanceNum),
    };
  }

  return {
    amountApplied: securityDeposit,
    refund: Money.zero(),
  };
}
