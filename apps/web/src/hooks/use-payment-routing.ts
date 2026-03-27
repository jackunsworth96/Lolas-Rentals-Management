import { useMemo } from 'react';
import { usePaymentRoutingConfig, type PaymentRoutingRule } from '../api/config.js';

function normalizeMethodKey(id: string): string {
  return id.toLowerCase().replace(/[\s_-]/g, '');
}

function isCardKey(id: string): boolean {
  const k = normalizeMethodKey(id);
  return k === 'card' || k === 'creditcard' || k === 'debitcard';
}

function isCashKey(id: string): boolean {
  return normalizeMethodKey(id) === 'cash';
}

function isGcashKey(id: string): boolean {
  return normalizeMethodKey(id).includes('gcash');
}

function nonEmptyAccountId(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function usePaymentRouting() {
  const { data, isLoading } = usePaymentRoutingConfig();

  const rules = data?.rules ?? [];
  const storeDefaults = data?.storeDefaults ?? {};

  const ruleMap = useMemo(() => {
    const map = new Map<string, PaymentRoutingRule>();
    for (const r of rules) map.set(`${r.storeId}::${r.paymentMethodId}`, r);
    return map;
  }, [rules]);

  function getRule(storeId: string, paymentMethodId: string): PaymentRoutingRule | null {
    return ruleMap.get(`${storeId}::${paymentMethodId}`) ?? null;
  }

  function getReceivedInto(storeId: string, paymentMethodId: string): string | null {
    return nonEmptyAccountId(getRule(storeId, paymentMethodId)?.receivedIntoAccountId ?? null);
  }

  /** Resolves deposit / refund destination when exact store+method rule is missing or has blank account. */
  function resolveReceivedIntoForStore(
    storeId: string,
    paymentMethodId: string,
    methodDisplayName?: string | null,
  ): string | null {
    const exact = nonEmptyAccountId(getRule(storeId, paymentMethodId)?.receivedIntoAccountId ?? null);
    if (exact) return exact;

    const wantId = normalizeMethodKey(paymentMethodId);
    for (const r of rules) {
      if (r.storeId !== storeId) continue;
      if (normalizeMethodKey(r.paymentMethodId) === wantId) {
        const a = nonEmptyAccountId(r.receivedIntoAccountId);
        if (a) return a;
      }
    }

    const nameKey = methodDisplayName ? normalizeMethodKey(methodDisplayName) : '';
    if (isCashKey(paymentMethodId) || nameKey === 'cash') {
      return nonEmptyAccountId(getCashAccount(storeId)) ?? nonEmptyAccountId(getDefaultCashAccount(storeId));
    }
    if (isGcashKey(paymentMethodId) || nameKey.includes('gcash')) {
      for (const r of rules) {
        if (r.storeId !== storeId) continue;
        if (isGcashKey(r.paymentMethodId)) {
          const a = nonEmptyAccountId(r.receivedIntoAccountId);
          if (a) return a;
        }
      }
    }

    return null;
  }

  function getCardSettlement(storeId: string): string | null {
    for (const r of rules) {
      if (r.storeId === storeId && isCardKey(r.paymentMethodId)) return r.cardSettlementAccountId ?? null;
    }
    return null;
  }

  function getCardReceivable(storeId: string): string | null {
    for (const r of rules) {
      if (r.storeId === storeId && isCardKey(r.paymentMethodId)) return r.receivedIntoAccountId ?? null;
    }
    return null;
  }

  function getCashAccount(storeId: string): string | null {
    for (const r of rules) {
      if (r.storeId === storeId && isCashKey(r.paymentMethodId)) return r.receivedIntoAccountId ?? null;
    }
    return null;
  }

  function getCardFeeAccount(storeId: string): string | null {
    return storeDefaults[storeId]?.cardFeeAccountId ?? null;
  }

  function getDefaultCashAccount(storeId: string): string | null {
    return storeDefaults[storeId]?.defaultCashAccountId ?? null;
  }

  function hasRule(storeId: string, paymentMethodId: string): boolean {
    return ruleMap.has(`${storeId}::${paymentMethodId}`);
  }

  function resolveDepositLiability(
    accounts: Array<{ id: string; name: string; accountType?: string; account_type?: string; storeId?: string | null; store_id?: string | null }>,
    storeId: string,
  ): string | null {
    const matches = accounts.filter((a) => {
      const sid = a.storeId ?? a.store_id ?? null;
      const type = (a.accountType ?? a.account_type ?? '').toLowerCase();
      return (sid === storeId || sid === 'company') && type === 'liability' && a.name.toLowerCase().includes('deposit');
    });
    return matches.length === 1 ? matches[0].id : null;
  }

  function resolveReceivable(
    accounts: Array<{ id: string; name: string; accountType?: string; account_type?: string; storeId?: string | null; store_id?: string | null }>,
    storeId: string,
  ): string | null {
    const matches = accounts.filter((a) => {
      const sid = a.storeId ?? a.store_id ?? null;
      const type = (a.accountType ?? a.account_type ?? '').toLowerCase();
      return (sid === storeId || sid === 'company') && type === 'asset' && a.name.toLowerCase().includes('receivable');
    });
    return matches.length === 1 ? matches[0].id : null;
  }

  return {
    getRule,
    getReceivedInto,
    resolveReceivedIntoForStore,
    getCardSettlement,
    getCardReceivable,
    getCashAccount,
    getCardFeeAccount,
    getDefaultCashAccount,
    hasRule,
    resolveDepositLiability,
    resolveReceivable,
    isLoading,
  };
}
