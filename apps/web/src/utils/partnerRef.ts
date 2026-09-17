import type { PublicPartnerBenefit } from '../api/partners.js';
import { partnerSlugFromHost } from './partnerHost.js';

const REF_STORAGE_KEY = 'lolaPartnerRef';
const BENEFIT_STORAGE_KEY = 'lolaPartnerBenefit';
const LOCATION_DEFAULT_HANDLED_KEY_PREFIX = 'lolaPartnerLocationDefaultHandled:';

/**
 * Reads the ?ref= query param from the current URL.
 * If present and non-empty, stores it in sessionStorage so it persists
 * across the full booking funnel within the same browser tab.
 * Call this on every page that may be entered with a ?ref= deep link.
 */
export function capturePartnerRefFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref')?.trim();
    if (ref) {
      sessionStorage.setItem(REF_STORAGE_KEY, ref);
      return ref;
    }
    const hostRef = partnerSlugFromHost();
    if (hostRef) {
      sessionStorage.setItem(REF_STORAGE_KEY, hostRef);
      return hostRef;
    }
  } catch {
    // sessionStorage may be unavailable in some environments — safe to ignore
  }
  return null;
}

/**
 * Returns the stored partner ref slug, or null if none was captured.
 */
export function getPartnerRef(): string | null {
  try {
    return sessionStorage.getItem(REF_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Returns the cached partner benefit (if any) without making a network call. */
export function getStoredPartnerBenefit(): PublicPartnerBenefit | null {
  try {
    const raw = sessionStorage.getItem(BENEFIT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PublicPartnerBenefit;
  } catch {
    return null;
  }
}

export function setStoredPartnerBenefit(benefit: PublicPartnerBenefit | null): void {
  try {
    if (benefit) {
      sessionStorage.setItem(BENEFIT_STORAGE_KEY, JSON.stringify(benefit));
    } else {
      sessionStorage.removeItem(BENEFIT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * The reserve page uses this session-scoped marker so an automatic partner
 * location default is only considered once. This prevents a later remount
 * from replacing a location the guest deliberately changed.
 */
export function hasHandledPartnerLocationDefault(ref: string): boolean {
  try {
    return sessionStorage.getItem(`${LOCATION_DEFAULT_HANDLED_KEY_PREFIX}${ref}`) === 'true';
  } catch {
    return false;
  }
}

export function markPartnerLocationDefaultHandled(ref: string): void {
  try {
    sessionStorage.setItem(`${LOCATION_DEFAULT_HANDLED_KEY_PREFIX}${ref}`, 'true');
  } catch {
    // sessionStorage may be unavailable — safe to ignore
  }
}

/**
 * Clears the stored partner ref + cached benefit after a successful booking
 * submission (or whenever the funnel restarts).
 */
export function clearPartnerRef(): void {
  try {
    const ref = sessionStorage.getItem(REF_STORAGE_KEY);
    if (ref) sessionStorage.removeItem(`${LOCATION_DEFAULT_HANDLED_KEY_PREFIX}${ref}`);
    sessionStorage.removeItem(REF_STORAGE_KEY);
    sessionStorage.removeItem(BENEFIT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
