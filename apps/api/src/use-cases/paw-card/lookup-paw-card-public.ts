import type { CustomerRepository } from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';

export type PawCardPublicLookupResult =
  | { found: false }
  | { found: true; customerId: string | null; customerName: string | null };

export interface LookupPawCardPublicDeps {
  customerRepo: CustomerRepository;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Public Paw Card access: renter if email matches `customers.email` or `orders_raw.customer_email`.
 */
export async function lookupPawCardPublicAccess(
  deps: LookupPawCardPublicDeps,
  input: { email: string },
): Promise<PawCardPublicLookupResult> {
  const normalized = normalizeEmail(input.email);
  if (!normalized || !normalized.includes('@')) {
    return { found: false };
  }

  const customer = await deps.customerRepo.findByEmail(normalized);
  if (customer) {
    return { found: true, customerId: customer.id, customerName: customer.name ?? null };
  }

  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('orders_raw')
    .select('id, customer_name')
    .ilike('customer_email', normalized)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`orders_raw lookup failed: ${error.message}`);
  if (data) {
    const row = data as { id: string; customer_name: string | null };
    return { found: true, customerId: null, customerName: row.customer_name ?? null };
  }

  return { found: false };
}
