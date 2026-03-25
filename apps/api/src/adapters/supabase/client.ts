import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(__dirname, '../../..');   // apps/api
const monorepoRoot = resolve(__dirname, '../../../../..'); // repo root
// Load api .env first, then repo root / cwd so repo root wins (avoids apps/api/.env overriding correct keys)
[apiDir, monorepoRoot, process.cwd()].forEach((dir) => config({ path: resolve(dir, '.env') }));

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    client = createClient(url, key);
  }
  return client;
}

/** Singleton instance for routes that import supabase directly */
export const supabase = getSupabaseClient();
