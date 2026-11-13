import { DomainError } from '../errors/domain-error.js';
import { round2, type PayrollResult } from './payroll-calculator.js';

export interface PayrollJournalAccounts {
  wagesAccountId: string;
  commissionExpenseId: string;
  tipsPayableId: string;
  sssPayableId: string;
  philhealthPayableId: string;
  pagibigPayableId: string;
  employerContribExpenseId: string;
  thirteenthMonthExpenseId: string;
  thirteenthMonthPayableId: string;
  vehicleAllowanceExpenseId: string;
  vehicleAllowancePayableId: string;
  transferFeeExpenseId: string;
  advanceAccountId: string | null;
}

export interface PayoutLine {
  /** Asset account the money leaves from (till, safe, GCash, bank). */
  accountId: string;
  amount: number;
  /** Transfer fee charged on top of the amount, paid from the same account. */
  fee: number;
  label: string;
}

export interface PayrollJournalLeg {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

const EPS = 0.005;

/**
 * Builds the gross-to-net journal for one payslip:
 *
 *   DR Wages (basic, leave, overtime, holiday premium, 9pm, bonuses)
 *      less 9pm cash already paid from the till on the day
 *   DR Staff commission
 *   DR Tips payable (the pool is paid out)
 *   DR Employer statutory contributions
 *   DR 13th month expense          CR 13th month payable
 *   DR Vehicle allowance expense   CR Vehicle allowance payable
 *   DR Transfer fees
 *        CR SSS / PhilHealth / Pag-IBIG payable (employee + employer share)
 *        CR Cash advance receivable
 *        CR each payout account (amount + fee)
 */
export function buildPayslipJournal(
  result: PayrollResult,
  payouts: PayoutLine[],
  accounts: PayrollJournalAccounts,
  description: string,
): PayrollJournalLeg[] {
  const paid = round2(payouts.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - result.netPay) > EPS) {
    throw new DomainError(
      `Payment lines total ${paid.toFixed(2)} but net pay is ${result.netPay.toFixed(2)}`,
    );
  }
  for (const p of payouts) {
    if (p.amount < 0 || p.fee < 0) throw new DomainError('Payment amounts and fees must be non-negative');
  }
  if (result.cashAdvanceDeduction > 0 && !accounts.advanceAccountId) {
    throw new DomainError('A cash advance is being deducted but no Cash Advance asset account exists');
  }

  const legs: PayrollJournalLeg[] = [];
  const push = (accountId: string, signed: number, note: string) => {
    const amt = round2(signed);
    if (Math.abs(amt) < EPS) return;
    legs.push({
      accountId,
      debit: amt > 0 ? amt : 0,
      credit: amt < 0 ? -amt : 0,
      description: note ? `${description} (${note})` : description,
    });
  };

  const wages =
    result.basicPay + result.leavePay + result.overtimePay + result.holidayPremium +
    result.ninePmEarnings + result.bonuses - result.ninePmPrepaid;
  push(accounts.wagesAccountId, wages, result.ninePmPrepaid > 0 ? 'net of 9pm cash paid on the day' : '');
  push(accounts.commissionExpenseId, result.commission, 'POM commission');
  push(accounts.tipsPayableId, result.tips, 'tips share');

  const er = result.employerContributions;
  const ee = result.employeeContributions;
  push(accounts.employerContribExpenseId, er.sss + er.philhealth + er.pagibig, 'employer contributions');
  push(accounts.sssPayableId, -(ee.sss + er.sss), 'SSS');
  push(accounts.philhealthPayableId, -(ee.philhealth + er.philhealth), 'PhilHealth');
  push(accounts.pagibigPayableId, -(ee.pagibig + er.pagibig), 'Pag-IBIG');

  push(accounts.thirteenthMonthExpenseId, result.thirteenthMonthAccrual, '13th month accrual');
  push(accounts.thirteenthMonthPayableId, -result.thirteenthMonthAccrual, '13th month accrual');
  push(accounts.vehicleAllowanceExpenseId, result.vehicleAllowanceAccrual, 'vehicle allowance');
  push(accounts.vehicleAllowancePayableId, -result.vehicleAllowanceAccrual, 'vehicle allowance');

  if (result.cashAdvanceDeduction > 0) {
    push(accounts.advanceAccountId!, -result.cashAdvanceDeduction, 'cash advance recovered');
  }

  appendPayouts(push, payouts, accounts.transferFeeExpenseId);
  assertBalanced(legs);
  return legs;
}

/** December payout of the accrued 13th month: clears the payable. */
export function buildThirteenthMonthPayoutJournal(
  amount: number,
  payouts: PayoutLine[],
  accounts: Pick<PayrollJournalAccounts, 'thirteenthMonthPayableId' | 'thirteenthMonthExpenseId' | 'transferFeeExpenseId'>,
  accrued: number,
  description: string,
): PayrollJournalLeg[] {
  const paid = round2(payouts.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - round2(amount)) > EPS) {
    throw new DomainError(`Payment lines total ${paid.toFixed(2)} but the 13th month pay is ${amount.toFixed(2)}`);
  }
  const legs: PayrollJournalLeg[] = [];
  const push = (accountId: string, signed: number, note: string) => {
    const amt = round2(signed);
    if (Math.abs(amt) < EPS) return;
    legs.push({
      accountId,
      debit: amt > 0 ? amt : 0,
      credit: amt < 0 ? -amt : 0,
      description: note ? `${description} (${note})` : description,
    });
  };
  // Anything paid beyond what was accrued (e.g. a top-up) is expensed now.
  const fromPayable = Math.min(Math.max(0, accrued), amount);
  push(accounts.thirteenthMonthPayableId, fromPayable, 'accrued');
  push(accounts.thirteenthMonthExpenseId, amount - fromPayable, 'top-up');
  appendPayouts(push, payouts, accounts.transferFeeExpenseId);
  assertBalanced(legs);
  return legs;
}

function appendPayouts(
  push: (accountId: string, signed: number, note: string) => void,
  payouts: PayoutLine[],
  feeAccountId: string,
): void {
  for (const p of payouts) {
    push(p.accountId, -(p.amount + p.fee), p.label);
    push(feeAccountId, p.fee, `${p.label} transfer fee`);
  }
}

function assertBalanced(legs: PayrollJournalLeg[]): void {
  const dr = round2(legs.reduce((s, l) => s + l.debit, 0));
  const cr = round2(legs.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(dr - cr) > EPS) {
    throw new DomainError(`Payroll journal does not balance: debits ${dr.toFixed(2)} vs credits ${cr.toFixed(2)}`);
  }
}
