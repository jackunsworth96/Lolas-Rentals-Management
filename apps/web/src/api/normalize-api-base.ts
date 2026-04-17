/** Aligns VITE_API_URL with Express, which mounts routes under `/api`. */
export function normalizeApiBase(value: string | undefined): string {
  const raw = (value ?? '').trim() || '/api';
  const base = raw.replace(/\/+$/, '');
  if (base.startsWith('http')) {
    return base.endsWith('/api') ? base : `${base}/api`;
  }
  return base || '/api';
}
