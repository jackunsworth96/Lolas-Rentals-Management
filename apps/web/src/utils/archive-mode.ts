const ARCHIVE_EXACT_PATHS = new Set([
  '/orders/completed', '/fleet', '/fleet/asset-register', '/fleet/accidents',
  '/maintenance', '/transfers', '/accounts', '/budget', '/card-settlements',
  '/cashup', '/hr/employees', '/hr/timesheets', '/hr/payroll', '/expenses',
  '/misc-sales', '/customers', '/analytics',
]);

export function isArchivePath(pathname: string): boolean {
  return ARCHIVE_EXACT_PATHS.has(pathname) || pathname.startsWith('/accounts/');
}
