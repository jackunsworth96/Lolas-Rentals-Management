const STORAGE_KEY = 'lolaPartnerRef';

/**
 * Reads the ?ref= query param from the current URL.
 * If present and non-empty, stores it in sessionStorage so it persists
 * across the full booking funnel within the same browser tab.
 * Call this once when the booking entry page mounts.
 */
export function capturePartnerRefFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref')?.trim();
    if (ref) {
      sessionStorage.setItem(STORAGE_KEY, ref);
    }
  } catch {
    // sessionStorage may be unavailable in some environments — safe to ignore
  }
}

/**
 * Returns the stored partner ref slug, or null if none was captured.
 */
export function getPartnerRef(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Clears the stored partner ref after a successful booking submission.
 */
export function clearPartnerRef(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
