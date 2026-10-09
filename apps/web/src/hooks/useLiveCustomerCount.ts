import { useCallback, useEffect, useState } from 'react';
import { normalizeApiBase } from '../api/normalize-api-base.js';

/**
 * Customers from the old website who predate this system. Mirrors
 * `LEGACY_CUSTOMER_OFFSET` in `apps/api/src/routes/public-stats.ts` — the
 * displayed count can never fall below this even if the live fetch fails.
 */
export const CUSTOMER_COUNT_FLOOR = 6300;

const POLL_MS = 2 * 60 * 1000; // 2 minutes — matches the API's cache TTL.

/**
 * Live cumulative "explorers served" count for public trust pills.
 *
 * Value = legacy offset (pre-system customers) + every order that is
 * `active`, `confirmed`, or `completed` (see `public-stats.ts`). Cancelled
 * and unprocessed orders are excluded server-side, so this always reflects
 * real/active customers only.
 *
 * Polls `/public/stats/order-count` every 2 minutes. If the fetch fails for
 * any reason, the last known value (or the floor on first load) is kept —
 * the number never goes backwards or disappears.
 */
export function useLiveCustomerCount(): number {
  const [totalCustomers, setTotalCustomers] = useState<number>(CUSTOMER_COUNT_FLOOR);

  const fetchCount = useCallback(() => {
    const apiBase = normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);
    fetch(`${apiBase}/public/stats/order-count`)
      .then((r) => r.json())
      .then((json) => {
        const count = json?.data?.totalOrders;
        if (typeof count === 'number' && !Number.isNaN(count) && count >= 0) {
          setTotalCustomers(Math.max(CUSTOMER_COUNT_FLOOR, count));
        }
      })
      .catch(() => { /* keep last known value */ });
  }, []);

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(id);
  }, [fetchCount]);

  return totalCustomers;
}
