/**
 * Migration script: read data from Google Sheets and upsert into Supabase.
 *
 * Run from repo root:  npm run migrate:sheets
 * Or from apps/api:    npx tsx scripts/migrate-sheets-to-supabase.ts
 *
 * Optional:  npx tsx scripts/migrate-sheets-to-supabase.ts --dry-run
 *
 * .env is loaded from (first found): monorepo root, apps/api, process.cwd()
 *
 * Required env vars:
 *   GOOGLE_SHEETS_SPREADSHEET_ID  - ID of the Google Spreadsheet
 *   GOOGLE_SERVICE_ACCOUNT_JSON   - Full JSON key for Sheets API (or EMAIL + PRIVATE_KEY)
 *   SUPABASE_URL                  - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY     - Supabase service role key
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiDir = resolve(__dirname, '..');
const monorepoRoot = resolve(__dirname, '../..');
[monorepoRoot, apiDir, process.cwd()].forEach((dir) => {
  config({ path: resolve(dir, '.env') });
});

import { createClient } from '@supabase/supabase-js';
import { readSheet } from '../src/adapters/google-sheets/sheets-client.js';
import {
  MIGRATION_ORDER,
  HEADER_TO_DB,
  SERIAL_PK_TABLES,
} from './migrate-sheets-config.js';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const BATCH_SIZE = 200;

interface TableResult {
  sheetName: string;
  tableName: string;
  rowsRead: number;
  rowsUpserted: number;
  errors: string[];
  skipped: boolean;
  skipReason?: string;
}

function coerceValue(
  raw: string,
  dbColumn: string,
  _tableName: string,
): string | number | boolean | null {
  const s = raw?.trim() ?? '';
  if (s === '') return null;

  // Boolean-like columns
  const lower = s.toLowerCase();
  if (
    dbColumn.startsWith('is_') ||
    dbColumn === 'blacklisted' ||
    dbColumn === 'replied' ||
    dbColumn === 'fixed' ||
    dbColumn === 'deducted' ||
    dbColumn === 'downtime_tracked' ||
    dbColumn === 'auto_post_to_ledger'
  ) {
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }

  // Numeric columns (common suffixes and names)
  const numericPattern =
    /^(amount|balance|price|rate|cost|fee|total|quantity|count|hours|days|number|stock|debit|credit|variance|mileage|depreciation|allowance|deduction|inflation|rating|id|min_days|max_days|day_of_month|star_rating|sold_count|starting_stock|current_stock|duration_days|pax_count|number_of_people|size_variant)$/;
  const isNumericCol =
    numericPattern.test(dbColumn) ||
    dbColumn.endsWith('_amt') ||
    dbColumn.endsWith('_rate') ||
    dbColumn.endsWith('_cost') ||
    dbColumn.endsWith('_price') ||
    dbColumn.endsWith('_balance') ||
    dbColumn.endsWith('_hours') ||
    dbColumn.endsWith('_count');
  if (isNumericCol) {
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }

  // Date/time columns
  if (
    dbColumn.endsWith('_at') ||
    dbColumn === 'date' ||
    dbColumn === 'start_date' ||
    dbColumn === 'end_date' ||
    dbColumn === 'order_date' ||
    dbColumn === 'transaction_date' ||
    dbColumn === 'granted_date' ||
    dbColumn === 'period_start' ||
    dbColumn === 'period_end' ||
    dbColumn === 'orcr_expiry_date' ||
    dbColumn === 'purchase_date' ||
    dbColumn === 'date_sold' ||
    dbColumn === 'date_settled' ||
    dbColumn === 'due_date' ||
    dbColumn === 'date_of_visit' ||
    dbColumn === 'birthday' ||
    dbColumn === 'probation_end_date' ||
    dbColumn === 'rentable_start_date' ||
    dbColumn === 'registration_date' ||
    dbColumn === 'last_posted_date' ||
    dbColumn === 'forecasted_date' ||
    dbColumn === 'downtime_start' ||
    dbColumn === 'downtime_end' ||
    dbColumn === 'deducted_at' ||
    dbColumn === 'submitted_at' ||
    dbColumn === 'overridden_at' ||
    dbColumn === 'added_date'
  ) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return s;
}

function mapRow(
  headers: string[],
  values: string[],
  sheetName: string,
  tableName: string,
): Record<string, unknown> | null {
  const map = HEADER_TO_DB[sheetName] ?? {};
  const row: Record<string, unknown> = {};
  let hasAny = false;
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]?.trim() ?? '';
    if (header === '' || header === '|||') continue;
    const dbCol = map[header] ?? header;
    const raw = values[i] ?? '';
    const val = coerceValue(raw, dbCol, tableName);
    if (val !== null) hasAny = true;
    row[dbCol] = val;
  }
  return hasAny ? row : null;
}

async function migrateSheet(
  sheetName: string,
  tableName: string,
  supabase: ReturnType<typeof createClient>,
  dryRun: boolean,
): Promise<TableResult> {
  const result: TableResult = {
    sheetName,
    tableName,
    rowsRead: 0,
    rowsUpserted: 0,
    errors: [],
    skipped: false,
  };

  try {
    const range = `${sheetName}!A:ZZ`;
    const grid = await readSheet(SPREADSHEET_ID, range);
    if (grid.length < 2) {
      result.skipped = true;
      result.skipReason = 'empty or header-only sheet';
      return result;
    }

    const headers = grid[0].map((h) => (h ?? '').trim());
    const rows: Record<string, unknown>[] = [];
    for (let r = 1; r < grid.length; r++) {
      const mapped = mapRow(headers, grid[r] ?? [], sheetName, tableName);
      if (mapped) rows.push(mapped);
    }
    result.rowsRead = rows.length;
    if (rows.length === 0) {
      result.skipped = true;
      result.skipReason = 'no data rows';
      return result;
    }

    if (dryRun) {
      result.rowsUpserted = rows.length;
      return result;
    }

    const isSerial = SERIAL_PK_TABLES.has(tableName);
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      if (isSerial) {
        const { error } = await supabase.from(tableName).insert(chunk);
        if (error) result.errors.push(error.message);
        else result.rowsUpserted += chunk.length;
      } else {
        const { error } = await supabase.from(tableName).upsert(chunk, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });
        if (error) result.errors.push(error.message);
        else result.rowsUpserted += chunk.length;
      }
    }
  } catch (err) {
    result.errors.push((err as Error).message);
  }
  return result;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('[migrate-sheets] DRY RUN – no writes to Supabase\n');

  if (!SPREADSHEET_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      'Missing GOOGLE_SHEETS_SPREADSHEET_ID, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY. Set them in .env.',
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: TableResult[] = [];

  for (const { sheetName, tableName } of MIGRATION_ORDER) {
    process.stdout.write(`  ${sheetName} → ${tableName} ... `);
    const res = await migrateSheet(sheetName, tableName, supabase, dryRun);
    results.push(res);
    if (res.skipped) {
      console.log(`skipped (${res.skipReason ?? 'n/a'})`);
    } else if (res.errors.length > 0) {
      console.log(`error: ${res.errors.join('; ')}`);
    } else {
      console.log(`${res.rowsUpserted} rows`);
    }
  }

  const totalRows = results.reduce((s, r) => s + r.rowsUpserted, 0);
  const failed = results.filter((r) => r.errors.length > 0);
  const skipped = results.filter((r) => r.skipped);

  console.log('\n--- Summary ---');
  console.log(`Total rows migrated: ${totalRows}`);
  if (skipped.length) console.log(`Skipped (empty/missing): ${skipped.map((r) => r.sheetName).join(', ')}`);
  if (failed.length) console.log(`Failed: ${failed.map((r) => r.sheetName).join(', ')}`);
  if (dryRun) console.log('(Dry run – no data was written to Supabase)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
