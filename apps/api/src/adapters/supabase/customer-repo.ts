import type { Customer, CustomerRepository } from '@lolas/domain';
import { getSupabaseClient } from './client.js';

interface CustomerRow {
  id: string;
  store_id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  total_spent: number;
  notes: string | null;
  blacklisted: boolean;
}

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    totalSpent: row.total_spent ?? 0,
    notes: row.notes,
    blacklisted: row.blacklisted ?? false,
  };
}

function customerToRow(customer: Customer): Record<string, unknown> {
  return {
    id: customer.id,
    store_id: customer.storeId,
    name: customer.name,
    email: customer.email?.toLowerCase() ?? null,
    mobile: customer.mobile,
    total_spent: customer.totalSpent,
    notes: customer.notes,
    blacklisted: customer.blacklisted,
  };
}

export class SupabaseCustomerRepository implements CustomerRepository {
  async findById(id: string): Promise<Customer | null> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('customers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`findById failed: ${error.message}`);
    return data ? rowToCustomer(data as CustomerRow) : null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const sb = getSupabaseClient();
    const escaped = email.replace(/[%_\\]/g, '\\$&');
    const { data, error } = await sb
      .from('customers')
      .select('*')
      .ilike('email', escaped)
      .maybeSingle();

    if (error) throw new Error(`findByEmail failed: ${error.message}`);
    return data ? rowToCustomer(data as CustomerRow) : null;
  }

  async findByMobile(mobile: string): Promise<Customer | null> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('customers')
      .select('*')
      .ilike('mobile', mobile)
      .maybeSingle();

    if (error) throw new Error(`findByMobile failed: ${error.message}`);
    return data ? rowToCustomer(data as CustomerRow) : null;
  }

  async search(storeId: string, query: string): Promise<Customer[]> {
    const sb = getSupabaseClient();
    const safe = query.trim().replace(/[%_\\,()]/g, '\\$&');
    const pattern = `%${safe}%`;
    const { data, error } = await sb
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .or(`name.ilike.${pattern},email.ilike.${pattern},mobile.ilike.${pattern}`)
      .order('name')
      .limit(50);

    if (error) throw new Error(`search failed: ${error.message}`);
    return (data as CustomerRow[]).map(rowToCustomer);
  }

  async save(customer: Customer): Promise<void> {
    const sb = getSupabaseClient();
    const row = customerToRow(customer);
    const { error } = await sb.from('customers').upsert(row);

    if (error) throw new Error(`save failed: ${error.message}`);
  }
}
