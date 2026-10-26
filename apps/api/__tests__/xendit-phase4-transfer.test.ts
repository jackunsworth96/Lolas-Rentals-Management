import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { configuredTransferPrice } from '../src/routes/public-transfers.js';
import { createXenditReturnState, verifyXenditReturnState } from '../src/services/xendit.js';

describe('Phase 4 transfer checkout boundaries', () => {
  const routes = [
    { route: 'Airport', vanType: 'Shared Van', price: 250, pricingType: 'per_head', isActive: true },
    { route: 'Airport', vanType: 'Private Van', price: 900, pricingType: 'fixed', isActive: true },
  ];

  it('uses an active matching server route and per-head price', () => {
    expect(configuredTransferPrice(routes, 'Airport', 'Shared', 3)).toBe(750);
    expect(configuredTransferPrice(routes, 'Airport', 'Private', 3)).toBe(900);
    expect(configuredTransferPrice(routes, 'Other', 'Shared', 3)).toBeNull();
    expect(configuredTransferPrice([{ ...routes[0]!, isActive: false }], 'Airport', 'Shared', 1)).toBeNull();
    expect(configuredTransferPrice([routes[0]!, routes[0]!], 'Airport', 'Shared', 1)).toBeNull();
  });

  it('binds checkout capability to one transfer and expiry', () => {
    process.env.XENDIT_RETURN_STATE_SECRET = 'phase4-transfer-test-secret';
    const valid = createXenditReturnState({ sessionId: 'transfer:TRF-1', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const expired = createXenditReturnState({ sessionId: 'transfer:TRF-1', expiresAt: new Date(Date.now() - 1_000).toISOString() });
    expect(verifyXenditReturnState(valid, 'transfer:TRF-1')).toBe(true);
    expect(verifyXenditReturnState(valid, 'transfer:TRF-2')).toBe(false);
    expect(verifyXenditReturnState(`${valid}x`, 'transfer:TRF-1')).toBe(false);
    expect(verifyXenditReturnState(expired, 'transfer:TRF-1')).toBe(false);
  });

  it('keeps older completion behind the Phase 4 transfer wrapper', () => {
    const sql = readFileSync(new URL('../../../scripts/manual/apply-xendit-phase4.sql', import.meta.url), 'utf8');
    expect(sql).toContain('complete_xendit_session_phase3_atomic');
    expect(sql).toContain("status = 'reconciliation_required'");
    expect(sql).not.toContain('record_transfer_terminal_payment_atomic');
    expect(sql).toContain('record_transfer_manual_payment_atomic');
    expect(sql).toContain("payment_status = 'Paid',collected_at = now(),collected_amount = v_session.amount_php");
    expect(sql).toContain('claim_xendit_link_email');
    expect(sql).toContain("status IN ('creating','active','reconciliation_required')");
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_xendit_transfer_session_draft');
  });

  it('counts customer income credits without treating driver payouts as receipts', () => {
    const sql = readFileSync(new URL('../../../scripts/manual/apply-xendit-phase4.sql', import.meta.url), 'utf8');
    expect(sql.match(/JOIN public.chart_of_accounts a ON a.id = j.account_id/g)).toHaveLength(3);
    expect(sql.match(/j.credit > 0 AND a.account_type = 'Income'/g)).toHaveLength(3);
    expect(sql).not.toMatch(/FROM public.journal_entries\s+WHERE reference_type = 'transfer'/);
  });
});
