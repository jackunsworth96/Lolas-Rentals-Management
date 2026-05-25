/**
 * Preload with: node --import ./dist/instrument.js ./dist/server.js
 * Ensures Sentry runs before Express loads (required for Express v5 + ESM).
 */
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSentry } from './lib/sentry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, '..');
const monorepoRoot = resolve(__dirname, '../../..');
for (const dir of [monorepoRoot, apiRoot, process.cwd()]) {
  config({ path: resolve(dir, '.env'), override: true });
}

await initSentry();
