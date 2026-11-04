const DEFAULT_ORIGIN = 'https://www.lolasrentals.com';

/**
 * Normalizes the public web origin from WEB_URL for absolute links (emails, API responses).
 * - Trims and removes trailing slashes
 * - Prepends https:// when the value is host-only
 * - Collapses accidental double schemes (e.g. https://https://example.com from env + tooling)
 * - Replaces the legacy production Vercel host with the customer-facing domain
 */
export function normalizePublicWebOrigin(input: string): string {
  let s = input.trim().replace(/\/+$/, '');
  while (/^https?:\/\/https?:\/\//i.test(s)) {
    s = s.replace(/^https?:\/\//i, '');
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  return s
    .replace(/^https?:\/\/lolas-rentals-management-web\.vercel\.app(?=\/|$)/i, DEFAULT_ORIGIN)
    .replace(/\/+$/, '');
}

/** Uses env when set; otherwise default. Always returns a normalized origin (no trailing slash). */
export function publicWebOriginFromEnv(envValue: string | undefined, fallback: string = DEFAULT_ORIGIN): string {
  const raw = (envValue ?? '').trim();
  if (!raw) return normalizePublicWebOrigin(fallback);
  return normalizePublicWebOrigin(raw);
}
