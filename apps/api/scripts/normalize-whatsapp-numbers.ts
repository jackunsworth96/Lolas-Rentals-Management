/**
 * One-off backfill: normalises stored WhatsApp numbers to E.164.
 *
 * Scans customers.mobile, orders_raw.customer_mobile and transfers.contact_number.
 * Prints a CSV (table, id, before, after, status) to stdout and a summary to stderr.
 *
 *   status = fixed       → confidently normalised (e.g. 0917… → +63917…)
 *            recovered   → prefix-less international number read as +<digits> (e.g. 0491522… → +491522…)
 *            unfixable   → left as-is; customers rows get mobile_needs_review = true on --apply
 *
 * Dry run (default, writes nothing):
 *   npx tsx scripts/normalize-whatsapp-numbers.ts > whatsapp-fixes.csv
 * Apply:
 *   npx tsx scripts/normalize-whatsapp-numbers.ts --apply > whatsapp-fixes.csv
 *
 * Requires migration 160 (customers.mobile_needs_review) before --apply.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import { isValidWhatsAppE164, normalizeWhatsAppNumber } from '@lolas/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
[resolve(__dirname, '../..'), resolve(__dirname, '..'), process.cwd()].forEach((dir) => {
  config({ path: resolve(dir, '.env') });
});

const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 1000;

interface Target {
  table: 'customers' | 'orders_raw' | 'transfers';
  column: string;
}

const TARGETS: Target[] = [
  { table: 'customers', column: 'mobile' },
  { table: 'orders_raw', column: 'customer_mobile' },
  { table: 'transfers', column: 'contact_number' },
];

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function main() {
  const { getSupabaseClient } = await import('../src/adapters/supabase/client.js');
  const sb = getSupabaseClient();

  console.log('table,id,before,after,status');
  const summary: Record<string, { fixed: number; recovered: number; unfixable: number }> = {};

  for (const { table, column } of TARGETS) {
    const counts = { fixed: 0, recovered: 0, unfixable: 0 };
    summary[table] = counts;

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await sb
        .from(table)
        .select(`id, ${column}`)
        .not(column, 'is', null)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`${table} query failed: ${error.message}`);

      const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
      for (const row of rows) {
        const before = (row[column] ?? '').toString();
        if (!before.trim() || isValidWhatsAppE164(before)) continue;

        const result = normalizeWhatsAppNumber(before, { allowRecovery: true });
        const id = String(row.id);

        if (result.ok) {
          const status = result.recovered ? 'recovered' : 'fixed';
          counts[status] += 1;
          console.log([table, id, before, result.e164, status].map(csv).join(','));
          if (APPLY) {
            const update: Record<string, unknown> = { [column]: result.e164 };
            if (table === 'customers') update.mobile_needs_review = false;
            const { error: updErr } = await sb.from(table).update(update).eq('id', id);
            if (updErr) console.error(`  ! ${table} ${id} update failed: ${updErr.message}`);
          }
        } else {
          counts.unfixable += 1;
          console.log([table, id, before, '', 'unfixable'].map(csv).join(','));
          if (APPLY && table === 'customers') {
            const { error: flagErr } = await sb
              .from('customers')
              .update({ mobile_needs_review: true })
              .eq('id', id);
            if (flagErr) console.error(`  ! customers ${id} flag failed: ${flagErr.message}`);
          }
        }
      }

      if (rows.length < PAGE_SIZE) break;
    }
  }

  console.error(`\n${APPLY ? 'APPLIED' : 'DRY RUN (pass --apply to write)'}`);
  for (const [table, c] of Object.entries(summary)) {
    console.error(`  ${table}: ${c.fixed} fixed, ${c.recovered} recovered, ${c.unfixable} need manual review`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
