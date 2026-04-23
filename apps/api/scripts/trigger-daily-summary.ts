/**
 * One-off trigger for the daily summary Telegram jobs.
 * Use this to test a job without waiting for the cron schedule.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/trigger-daily-summary.ts morning
 *   npx tsx scripts/trigger-daily-summary.ts evening
 *
 * .env is loaded from (first found wins):
 *   1. Monorepo root:  <repo>/.env
 *   2. API package:    apps/api/.env
 *   3. Current directory (process.cwd())/.env
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Load .env — try monorepo root first, then api package, then cwd
for (const p of [
  resolve(__dirname, '../../../.env'),
  resolve(__dirname, '../.env'),
  resolve(process.cwd(), '.env'),
]) {
  const result = config({ path: p });
  if (!result.error) {
    console.log(`[trigger] Loaded env from ${p}`);
    break;
  }
}

const job = process.argv[2];
if (job !== 'morning' && job !== 'evening') {
  console.error('Usage: npx tsx scripts/trigger-daily-summary.ts morning|evening');
  process.exit(1);
}

const { runMorningSummary, runEveningSnapshot } = await import('../src/jobs/daily-summary.js');

console.log(`[trigger] Firing ${job} summary now...`);

if (job === 'morning') {
  await runMorningSummary();
} else {
  await runEveningSnapshot();
}

console.log('[trigger] Done.');
