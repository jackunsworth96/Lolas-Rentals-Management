import { describe, it, expect } from 'vitest';
import { leaveEntitlement } from '../src/services/leave-entitlement.js';

const base = {
  allowance: 18,
  startDate: '2026-10-05',
  probationEndDate: '2027-04-12',
  asOf: '2027-01-20',
  probationAccrualPerMonth: 0,
};

describe('leaveEntitlement', () => {
  it('spreads the allowance over probation by default', () => {
    expect(leaveEntitlement(base)).toEqual({ entitlement: 9, onProbation: true });
  });

  it("gives nothing during probation when the rule is 'none'", () => {
    expect(leaveEntitlement({ ...base, probationRule: 'none' })).toEqual({ entitlement: 0, onProbation: true });
  });

  it("gives the full allowance during probation when the rule is 'full'", () => {
    expect(leaveEntitlement({ ...base, allowance: 7, probationRule: 'full' })).toEqual({ entitlement: 7, onProbation: true });
  });

  it('gives the full allowance once probation ends', () => {
    expect(leaveEntitlement({ ...base, asOf: '2027-04-12', probationRule: 'none' })).toEqual({ entitlement: 18, onProbation: false });
  });
});
