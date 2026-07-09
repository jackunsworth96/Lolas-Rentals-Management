const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin', 'backoffice', 'localhost']);

export function partnerSlugFromHost(hostname = window.location.hostname): string | null {
  const rootDomain = (import.meta.env.VITE_PARTNER_ROOT_DOMAIN as string | undefined) ?? 'lolasrentals.com';
  const host = hostname.toLowerCase();
  const root = rootDomain.toLowerCase();
  if (!host.endsWith(`.${root}`)) return null;
  const subdomain = host.slice(0, -(root.length + 1)).split('.')[0];
  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) return null;
  return /^[a-z0-9-]+$/.test(subdomain) ? subdomain : null;
}

export function partnerSlugFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get('partner') ?? params.get('slug') ?? params.get('ref');
    if (explicit?.trim()) return explicit.trim().toLowerCase();
  } catch {
    // ignore
  }
  return partnerSlugFromHost();
}
