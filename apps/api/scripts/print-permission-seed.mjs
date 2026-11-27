// Prints the `public.permissions` seed rows for a migration, generated from the
// shared catalogue so labels and areas match the app exactly.
// Usage (after `npm run build -w packages/shared`): node apps/api/scripts/print-permission-seed.mjs
import {
  ALL_PERMISSIONS,
  PERMISSION_CATALOGUE,
  LEGACY_PERMISSION_ALIASES,
  PERMISSION_SPLIT_BACKFILL,
} from '../../../packages/shared/dist/index.js';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const permissionRows = ALL_PERMISSIONS.map((key, i) => {
  const d = PERMISSION_CATALOGUE[key];
  return `  (${[q(key), q(d.area), q(d.label), q(d.description), d.sensitive ? 'true' : 'false', (i + 1) * 10].join(', ')})`;
});

const aliasRows = Object.entries(LEGACY_PERMISSION_ALIASES).flatMap(([legacy, keys]) =>
  keys.map((k) => `  (${q(legacy)}, ${q(k)})`),
);

const backfillRows = PERMISSION_SPLIT_BACKFILL.flatMap((r) => r.grant.map((g) => `  (${q(r.from)}, ${q(g)})`));

console.log('-- permissions (key, area, label, description, sensitive, sort_order)');
console.log(`${permissionRows.join(',\n')}`);
console.log('\n-- permission_aliases (legacy_key, permission)');
console.log(`${aliasRows.join(',\n')}`);
console.log('\n-- backfill (from_permission, grant_permission)');
console.log(`${backfillRows.join(',\n')}`);
