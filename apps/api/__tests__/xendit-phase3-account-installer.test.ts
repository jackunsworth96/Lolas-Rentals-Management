import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const phase3 = readFileSync(new URL('../../../scripts/manual/apply-xendit-phase3.sql', import.meta.url), 'utf8');
const staging = readFileSync(new URL('../../../scripts/manual/prepare-xendit-phase3-staging-accounts.sql', import.meta.url), 'utf8');
const resolver = phase3.split('CREATE OR REPLACE FUNCTION public.resolve_xendit_deposit_accounts')[1]
  ?.split('CREATE OR REPLACE FUNCTION public.create_xendit_order_deposit_draft')[0];

describe('Phase 3 manual account contracts', () => {
  it('does not cast the deposit allocation table before the installer creates it', () => {
    const preflight = phase3.split('DO $preflight$')[1]?.split('$preflight$;')[0];
    expect(preflight).toBeDefined();
    expect(preflight).toContain("IF to_regclass('public.xendit_payment_session_deposits') IS NOT NULL THEN");
    expect(preflight).not.toContain("'public.xendit_payment_session_deposits'::regclass");
  });

  it('selects only one active, store-owned designated security deposit liability', () => {
    expect(resolver).toBeDefined();
    expect(resolver).toContain('a.store_id = p_store_id AND a.is_active');
    expect(resolver).toContain("a.id LIKE 'DEPOSITS-HELD-%'");
    expect(resolver).toContain("a.id = 'DEPOSIT-LIAB-' || p_store_id");
    expect(resolver).toContain('IF v_liability_count <> 1 THEN');
    expect(resolver).not.toContain('lower(a.name)');
  });

  it('keeps the staging bootstrap scoped, transactional, and conflict-safe', () => {
    expect(staging).toContain('BEGIN;');
    expect(staging).toContain('COMMIT;');
    expect(staging).toContain('Staging has journal history');
    expect(staging).toContain("status IN ('creating', 'active', 'reconciliation_required')");
    expect(staging).toContain("'XENDIT-CLEARING-store-lolas', 'Xendit Clearing (unsettled)', 'Asset'");
    expect(staging).toContain("'DEPOSITS-HELD-LOLAS', 'Deposits Held Lolas', 'Liability'");
    expect(staging).toContain('ON CONFLICT (id) DO NOTHING');
    expect(staging).toContain('ON CONFLICT (store_id, payment_method_id) DO NOTHING');
    expect(staging).not.toContain('Customer Deposits Received');
  });
});
