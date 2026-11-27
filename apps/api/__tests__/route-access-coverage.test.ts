import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express from 'express';
import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, Permission } from '@lolas/shared';

/**
 * Every API route must check a permission, or be listed below as deliberately
 * public or open to any signed-in user. A new route that does neither fails
 * this test, so access can't be forgotten.
 */

/** No staff login: customer website, webhooks, partner sign-up and login screens. */
const PUBLIC_PREFIXES = ['/api/public/'];
const PUBLIC_ROUTES = new Set([
  'POST /api/auth/login',
  'POST /api/partner-auth/login',
  'GET /api/paw-card',
  'GET /api/paw-card/establishments',
  'POST /api/paw-card/register',
  'POST /api/payments/maya/webhook',
  'GET /api/unsubscribe',
  'POST /api/partners/enroll',
  'POST /api/partners/enroll/:id/details',
  'GET /api/partners/public/:slug',
]);

/** Partner portal and kiosk, which use partner logins instead of staff permissions. */
const PARTNER_AUTH_PREFIXES = ['/api/partner/'];

/** Any signed-in staff member, with the reason. */
const AUTH_ONLY_ROUTES: Record<string, string> = {
  'GET /api/auth/me': 'reads your own access',
  // The Today tab is shown to everyone. These handlers hide money figures, or return 403, without can_view_dashboard.
  'GET /api/dashboard/summary': 'Today tab; strips financials in the handler',
  'GET /api/dashboard/insights': 'Today tab; strips financials in the handler',
  'GET /api/dashboard/overdue-returns': 'Today tab',
  'GET /api/dashboard/revenue-transactions': '403 without can_view_dashboard in the handler',
  'GET /api/dashboard/today-movements': 'Today tab',
  'GET /api/dashboard/charity-impact': 'Today tab',
  'GET /api/dashboard/availability-detail': 'availability finder on the Today tab',
  'POST /api/dashboard/turned-away': 'logging a turned-away customer from the finder',
  'GET /api/dashboard/basket-abandonment': '403 without can_view_dashboard in the handler',
  'GET /api/dashboard/chat-summary': '403 without can_view_dashboard in the handler',
  'GET /api/dashboard/accommodation-aliases': 'lookup list',
  // My Portal: always scoped to the signed-in person.
  'GET /api/me/summary': 'own data',
  'GET /api/me/payslips': 'own data',
  'POST /api/me/payslips/:id/acknowledge': 'own data',
  'GET /api/me/timesheets': 'own data',
  'GET /api/me/leave-requests': 'own data',
  'POST /api/me/leave-requests': 'own data',
  'POST /api/me/leave-requests/:id/cancel': 'own data',
  'GET /api/me/advance-requests': 'own data',
  'POST /api/me/advance-requests': 'own data',
  'POST /api/me/advance-requests/:id/cancel': 'own data',
  'GET /api/me/rota': 'own data',
  'PUT /api/me/rota/picks': 'own data',
  'GET /api/me/work-updates': 'own data',
  'PUT /api/me/work-updates': 'own data',
  'GET /api/payroll/allowance/:employeeId': 'own balance, or can_view_payroll checked in the handler',
  // Reference data used by forms and dropdowns across the backoffice.
  'GET /api/config/stores': 'reference data',
  'GET /api/config/addons': 'reference data',
  'GET /api/config/locations': 'reference data',
  'GET /api/config/accommodation-directory': 'reference data',
  'GET /api/config/payment-methods': 'reference data',
  'GET /api/config/vehicle-models': 'reference data',
  'GET /api/config/vehicle-models/:id/images': 'reference data',
  'GET /api/config/store-pricing': 'reference data',
  'GET /api/config/model-pricing': 'reference data',
  'GET /api/config/fleet-statuses': 'reference data',
  'GET /api/config/expense-categories': 'reference data',
  'GET /api/config/task-categories': 'reference data',
  'GET /api/config/transfer-routes': 'reference data',
  'GET /api/config/day-types': 'reference data',
  'GET /api/config/chart-of-accounts': 'reference data',
  'GET /api/config/paw-card-establishments': 'reference data',
  'GET /api/config/maintenance-work-types': 'reference data',
  'GET /api/config/repair-costs': 'reference data',
  'GET /api/config/leave-config': 'reference data',
  'GET /api/config/employees': 'names only, for pickers',
  'GET /api/config/reviews': 'reference data',
  'GET /api/config/transfer-pickup-rules': 'reference data',
  'GET /api/config/fleet-accounting-config': 'reference data',
  'GET /api/partners': 'partner picker on bookings',
  'GET /api/partners/vehicle-models': 'partner picker on bookings',
  // Staff-assisted Paw Card tools at the counter.
  'GET /api/paw-card/lookup': 'counter tool',
  'GET /api/paw-card/customer-savings': 'counter tool',
  'GET /api/paw-card/lifetime': 'counter tool',
  'POST /api/paw-card/submit': 'counter tool',
  'GET /api/paw-card/company-impact': 'counter tool',
  'GET /api/paw-card/my-submissions': 'counter tool',
  'GET /api/paw-card/leaderboard': 'counter tool',
  'POST /api/paw-card/upload-receipt': 'counter tool',
  'POST /api/payments/maya/checkout': 'payment link for an order the user is already viewing',
};

type Handle = ((...args: unknown[]) => unknown) & {
  stack?: Layer[];
  permissionGate?: { permissions: readonly string[] };
};
type Layer = {
  handle: Handle;
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handle }> };
  mountPath?: string;
};
type RouteInfo = { key: string; path: string; access: 'permission' | 'authenticated' | 'other-auth' | 'none'; permissions: string[] };

// Express 5 does not keep mount paths on layers, so record them as routers are built.
const routerProto = Object.getPrototypeOf(Object.getPrototypeOf(express.Router())) as { use: (...args: unknown[]) => unknown };
const originalUse = routerProto.use;
routerProto.use = function patchedUse(this: { stack: Layer[] }, ...args: unknown[]) {
  const before = this.stack.length;
  const result = originalUse.apply(this, args);
  const path = typeof args[0] === 'string' ? args[0] : '/';
  for (const layer of this.stack.slice(before)) layer.mountPath = path;
  return result;
};

const OTHER_AUTH = new Set(['authenticateApiKey', 'authenticatePartner', 'authenticatePartnerKiosk']);

function joinPath(a: string, b: string): string {
  const out = `${a}/${b}`.replace(/\/+/g, '/');
  return out.length > 1 ? out.replace(/\/$/, '') : out;
}

function collect(router: { stack: Layer[] }, prefix: string, inherited: Handle[], out: RouteInfo[]): void {
  const chain = [...inherited];
  for (const layer of router.stack) {
    if (layer.route) {
      const handles = [...chain, ...layer.route.stack.map((s) => s.handle)];
      const permissions = handles.flatMap((h) => [...(h.permissionGate?.permissions ?? [])]);
      const access: RouteInfo['access'] = permissions.length > 0
        ? 'permission'
        : handles.some((h) => h.name === 'authenticate')
          ? 'authenticated'
          : handles.some((h) => OTHER_AUTH.has(h.name)) ? 'other-auth' : 'none';
      const path = joinPath(prefix, layer.route.path);
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ key: `${method.toUpperCase()} ${path}`, path, access, permissions });
      }
    } else if (layer.handle.stack) {
      collect(layer.handle as unknown as { stack: Layer[] }, joinPath(prefix, layer.mountPath ?? '/'), chain, out);
    } else if ((layer.mountPath ?? '/') === '/') {
      chain.push(layer.handle);
    }
  }
}

let routes: RouteInfo[] = [];

beforeAll(async () => {
  const { routes: root } = await import('../src/routes/index.js');
  const out: RouteInfo[] = [];
  collect(root as unknown as { stack: Layer[] }, '/api', [], out);
  routes = out;
}, 60_000);

const isPublic = (r: RouteInfo) => PUBLIC_ROUTES.has(r.key) || PUBLIC_PREFIXES.some((p) => r.path.startsWith(p));
const isPartner = (r: RouteInfo) => PARTNER_AUTH_PREFIXES.some((p) => r.path.startsWith(p));

describe('API route access coverage', () => {
  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(300);
  });

  it('gates every staff route with a permission unless it is listed as login-only', () => {
    const unguarded = routes
      .filter((r) => r.access !== 'permission' && !isPublic(r) && !isPartner(r) && !(r.key in AUTH_ONLY_ROUTES))
      .map((r) => `${r.key} (${r.access})`);
    expect(unguarded).toEqual([]);
  });

  it('never leaves a staff route without a login', () => {
    const open = routes.filter((r) => r.access === 'none' && !isPublic(r)).map((r) => r.key);
    expect(open).toEqual([]);
  });

  it('keeps login-only routes behind a login', () => {
    const open = routes.filter((r) => r.key in AUTH_ONLY_ROUTES && r.access === 'none').map((r) => r.key);
    expect(open).toEqual([]);
  });

  it('has no stale entries in the allow-lists', () => {
    const keys = new Set(routes.map((r) => r.key));
    const stale = [...PUBLIC_ROUTES, ...Object.keys(AUTH_ONLY_ROUTES)].filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });

  it('only gates on real permission keys', () => {
    const unknown = routes.flatMap((r) => r.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as never)).map((p) => `${r.key}: ${p}`));
    expect(unknown).toEqual([]);
  });

  it('enforces every permission somewhere in the API', () => {
    const gated = new Set(routes.flatMap((r) => r.permissions));
    const apiSource = sourceText(resolve(__dirname, '../src'));
    const names = Object.entries(Permission) as Array<[string, string]>;
    const unenforced = names
      .filter(([name, key]) => !gated.has(key) && !apiSource.includes(`Permission.${name}`) && !apiSource.includes(`'${key}'`))
      .map(([, key]) => key);
    expect(unenforced).toEqual([]);
  });
});

function sourceText(dir: string): string {
  let text = '';
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) text += sourceText(full);
    else if (name.endsWith('.ts')) text += readFileSync(full, 'utf8');
  }
  return text;
}
