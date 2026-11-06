import { useCallback, useEffect, useState } from 'react';
import { freshDenoms, type Denoms } from './DenominationCounter.js';

export interface CashupDraft {
  tillDenoms: Denoms;
  envelopeDenoms: Denoms;
  /** Deposit-register payment IDs ticked as present in the envelope. */
  tickedDeposits: string[];
  varianceNote: string;
}

const KEY_PREFIX = 'cashup-draft:';
const MAX_AGE_DAYS = 14;

function emptyDraft(): CashupDraft {
  return { tillDenoms: freshDenoms(), envelopeDenoms: freshDenoms(), tickedDeposits: [], varianceNote: '' };
}

function storageKey(storeId: string, date: string) {
  return `${KEY_PREFIX}${storeId}:${date}`;
}

function readDraft(storeId: string, date: string): CashupDraft {
  if (!storeId || !date) return emptyDraft();
  try {
    const raw = localStorage.getItem(storageKey(storeId, date));
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as Partial<CashupDraft>;
    return {
      tillDenoms: { ...freshDenoms(), ...(parsed.tillDenoms ?? {}) },
      envelopeDenoms: { ...freshDenoms(), ...(parsed.envelopeDenoms ?? {}) },
      tickedDeposits: parsed.tickedDeposits ?? [],
      varianceNote: parsed.varianceNote ?? '',
    };
  } catch {
    return emptyDraft();
  }
}

function pruneOldDrafts() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const date = key.split(':').pop() ?? '';
      if (date < cutoffStr) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable (private mode) — drafts simply won't persist.
  }
}

/**
 * Count-in-progress for one store and date. Switching store or date swaps to
 * that day's own draft (or a blank count), so one store's count can never be
 * submitted for another.
 */
export function useCashupDraft(storeId: string, date: string) {
  const [draft, setDraft] = useState<CashupDraft>(() => readDraft(storeId, date));
  const [loadedFor, setLoadedFor] = useState(`${storeId}:${date}`);

  const currentKey = `${storeId}:${date}`;
  if (loadedFor !== currentKey) {
    setLoadedFor(currentKey);
    setDraft(readDraft(storeId, date));
  }

  useEffect(() => {
    pruneOldDrafts();
  }, []);

  useEffect(() => {
    if (!storeId || !date || loadedFor !== currentKey) return;
    try {
      localStorage.setItem(storageKey(storeId, date), JSON.stringify(draft));
    } catch {
      // Ignore quota / private-mode errors.
    }
  }, [draft, storeId, date, loadedFor, currentKey]);

  const update = useCallback((patch: Partial<CashupDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const setTillDenom = useCallback((denom: number, count: number) => {
    setDraft((prev) => ({ ...prev, tillDenoms: { ...prev.tillDenoms, [denom]: Math.max(0, count) } }));
  }, []);

  const setEnvelopeDenom = useCallback((denom: number, count: number) => {
    setDraft((prev) => ({ ...prev, envelopeDenoms: { ...prev.envelopeDenoms, [denom]: Math.max(0, count) } }));
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(storeId, date));
    } catch {
      // ignore
    }
    setDraft(emptyDraft());
  }, [storeId, date]);

  return { draft, update, setTillDenom, setEnvelopeDenom, clear };
}
