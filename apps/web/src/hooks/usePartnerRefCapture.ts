import { useEffect, useState } from 'react';
import {
  capturePartnerRefFromUrl,
  getPartnerRef,
  getStoredPartnerBenefit,
  setStoredPartnerBenefit,
} from '../utils/partnerRef.js';
import { fetchPublicPartnerBenefit, type PublicPartnerBenefit } from '../api/partners.js';

interface UsePartnerRefCaptureResult {
  ref: string | null;
  benefit: PublicPartnerBenefit | null;
  loading: boolean;
}

/**
 * Centralised hook used by every customer-entry page that may receive a
 * `?ref=<slug>` deep link. Captures the ref into sessionStorage, then resolves
 * the active partner benefit and caches it alongside the ref. Subsequent
 * pages can read the cached benefit via getStoredPartnerBenefit().
 */
export function usePartnerRefCapture(): UsePartnerRefCaptureResult {
  const [ref, setRef] = useState<string | null>(() => getPartnerRef());
  const [benefit, setBenefit] = useState<PublicPartnerBenefit | null>(() => getStoredPartnerBenefit());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const previousRef = getPartnerRef();
    const captured = capturePartnerRefFromUrl();
    const activeRef = captured ?? getPartnerRef();
    setRef(activeRef);

    // A tab can enter a second partner's link after previously browsing under
    // another referral. Never expose the prior partner's cached defaults while
    // the new lookup is in flight.
    if (captured && previousRef && captured !== previousRef) {
      setBenefit(null);
      setStoredPartnerBenefit(null);
    }

    if (!activeRef) {
      setBenefit(null);
      setStoredPartnerBenefit(null);
      return;
    }

    // If we already have a cached benefit for the same ref skip the fetch.
    const cached = captured && previousRef && captured !== previousRef
      ? null
      : getStoredPartnerBenefit();
    if (cached && cached.name) {
      setBenefit(cached);
    }

    let cancelled = false;
    setLoading(true);
    fetchPublicPartnerBenefit(activeRef)
      .then((b) => {
        if (cancelled) return;
        setBenefit(b);
        setStoredPartnerBenefit(b);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { ref, benefit, loading };
}
