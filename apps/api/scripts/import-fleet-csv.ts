/**
 * Import fleet data from the legacy CSV (e.g. exported from Google Sheets) into Supabase fleet table.
 *
 * Run from apps/api:
 *   npx tsx scripts/import-fleet-csv.ts "<path-to-fleet.csv>"
 *
 * Example:
 *   npx tsx scripts/import-fleet-csv.ts "C:\Users\jacku\Downloads\Lola's Rentals & Tours Inc. - Data - Fleet (18).csv"
 *
 * Optional: --dry-run  (log what would be inserted without writing)
 *
 * .env is loaded from (first found): monorepo root, apps/api, process.cwd()
 * Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Store ID mapping: CSV uses ST01 / ST02. These are mapped to your seeded stores:
 *   ST01 -> store-lolas,  ST02 -> store-bass
 * Override with env: FLEET_STORE_MAP='{"ST01":"store-lolas","ST02":"store-bass"}'
 */

import { readFileSync } from 'node:fs';
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_STORE_MAP: Record<string, string> = {
  ST01: 'store-lolas',
  ST02: 'store-bass',
};

function parseStoreMap(): Record<string, string> {
  const raw = process.env.FLEET_STORE_MAP;
  if (!raw) return DEFAULT_STORE_MAP;
  try {
    return { ...DEFAULT_STORE_MAP, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STORE_MAP;
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseNum(val: string): number | null {
  const s = (val ?? '').trim();
  if (s === '') return null;
  const cleaned = s.replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(val: string): string | null {
  const s = (val ?? '').trim();
  if (s === '') return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseBool(val: string): boolean {
  const s = (val ?? '').trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES';
}

function csvToFleetRow(
  headers: string[],
  values: string[],
  storeMap: Record<string, string>,
): Record<string, unknown> | null {
  const row: Record<string, string> = {};
  headers.forEach((h, i) => {
    row[h] = values[i] ?? '';
  });

  const storeIdRaw = row['store_id'] ?? '';
  const storeId = storeMap[storeIdRaw] ?? storeIdRaw;
  const id = (row['vehicle_id'] ?? '').trim();
  const name = (row['vehicle_name'] ?? '').trim();
  if (!id || !name) return null;

  const currentMileage = parseNum(row['current_mileage']);
  const purchasePrice = parseNum(row['purchase_price']);
  const setUpCosts = parseNum(row['set_up_costs']);
  const totalBikeCost = parseNum(row['total_bike_cost']);
  const usefulLifeMonths = parseNum(row['useful_life_months']);
  const salvageValue = parseNum(row['salvage_value']);
  const accumulatedDepreciation = parseNum(row['accumulated_depreciation']);
  const bookValue = parseNum(row['book_value']);
  const soldPrice = parseNum(row['sold_price']);
  const profitLoss = parseNum(row['profit_loss']);

  return {
    id,
    store_id: storeId,
    name,
    // model_id: leave null so import works without vehicle_models; link in app later if needed
    model_id: null,
    plate_number: (row['plate_number'] ?? '').trim() || null,
    gps_id: (row['GPS_ID'] ?? row['gps_id'] ?? '').trim() || null,
    status: (row['status'] ?? 'Available').trim() || 'Available',
    current_mileage: currentMileage ?? 0,
    orcr_expiry_date: parseDate(row['orcr_expiry_date']),
    surf_rack: parseBool(row['surf_rack'] ?? ''),
    owner: (row['Owner'] ?? row['owner'] ?? '').trim() || null,
    rentable_start_date: parseDate(row['rentable_start_date']),
    registration_date: parseDate(row['registration_date']),
    purchase_price: purchasePrice,
    purchase_date: parseDate(row['purchase_date']),
    set_up_costs: setUpCosts ?? 0,
    total_bike_cost: totalBikeCost ?? 0,
    useful_life_months: usefulLifeMonths != null ? Math.round(usefulLifeMonths) : null,
    salvage_value: salvageValue ?? 0,
    accumulated_depreciation: accumulatedDepreciation ?? 0,
    book_value: bookValue ?? 0,
    date_sold: parseDate(row['date_sold']),
    sold_price: soldPrice,
    profit_loss: profitLoss,
  };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');
  const csvPath = args[0];

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-fleet-csv.ts "<path-to-fleet.csv>" [--dry-run]');
    process.exit(1);
  }

  const storeMap = parseStoreMap();
  console.log('Store ID mapping:', storeMap);

  let csv: string;
  try {
    csv = readFileSync(csvPath, 'utf-8');
  } catch (err) {
    console.error('Failed to read CSV:', (err as Error).message);
    process.exit(1);
  }

  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = csvToFleetRow(headers, values, storeMap);
    if (row) rows.push(row);
  }

  console.log(`Parsed ${rows.length} fleet rows from CSV.`);

  if (dryRun) {
    console.log('--dry-run: first row sample:', JSON.stringify(rows[0], null, 2));
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // fleet table name in Supabase migrations
  const { data, error } = await supabase.from('fleet').upsert(rows, {
    onConflict: 'id',
  });

  if (error) {
    console.error('Upsert failed:', error.message);
    process.exit(1);
  }

  console.log(`Successfully upserted ${rows.length} rows into fleet.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
