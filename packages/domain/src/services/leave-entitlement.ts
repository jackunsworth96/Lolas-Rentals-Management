export interface LeaveEntitlementInput {
  /** Full annual allowance in days once probation ends. */
  allowance: number;
  startDate: string | null;
  probationEndDate: string | null;
  /** 'YYYY-MM-DD' */
  asOf: string;
  /** Days earned per completed month on probation. 0 = pro rata over the probation length. */
  probationAccrualPerMonth: number;
  /**
   * What is available during probation: 'accrue' builds up monthly (default),
   * 'none' is nothing until probation ends, 'full' is the whole allowance from day one.
   */
  probationRule?: ProbationLeaveRule;
}

export type ProbationLeaveRule = 'accrue' | 'none' | 'full';

export interface LeaveEntitlement {
  entitlement: number;
  onProbation: boolean;
}

/**
 * Leave available to an employee on a given date. After probation the full
 * allowance applies; during probation it builds up month by month.
 */
export function leaveEntitlement(input: LeaveEntitlementInput): LeaveEntitlement {
  const allowance = Math.max(0, input.allowance);
  const { startDate, probationEndDate, asOf } = input;
  if (!probationEndDate || asOf >= probationEndDate) {
    return { entitlement: allowance, onProbation: false };
  }
  if (input.probationRule === 'none') return { entitlement: 0, onProbation: true };
  if (input.probationRule === 'full') return { entitlement: allowance, onProbation: true };
  const start = startDate ?? asOf;
  const probationMonths = Math.max(1, monthsBetween(start, probationEndDate));
  const perMonth = input.probationAccrualPerMonth > 0
    ? input.probationAccrualPerMonth
    : allowance / probationMonths;
  const earned = Math.floor(monthsBetween(start, asOf) * perMonth * 2) / 2;
  return { entitlement: Math.min(allowance, Math.max(0, earned)), onProbation: true };
}

/** Whole months completed between two 'YYYY-MM-DD' dates. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}
