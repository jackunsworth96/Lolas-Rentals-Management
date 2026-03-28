/** Reads go through the `savings_logs` view; writes use the underlying `paw_card_entries` table. */
export const SAVINGS_LOGS_TABLE = 'savings_logs' as const;
export const SAVINGS_ENTRIES_WRITE_TABLE = 'paw_card_entries' as const;

export function generatePawOrderId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const n = String(Math.floor(1000 + Math.random() * 9000));
  return `PAW-${ymd}-${n}`;
}

/** Start of the current calendar month in the user's local timezone (for filtering `created_at`). */
export function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Display like "Jack M." from a full name (or email local-part fallback). */
export function firstNameLastInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Member';
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${first} ${last[0]!.toUpperCase()}.`;
}

export type SavingsRow = {
  id: number;
  created_at: string;
  order_id: string | null;
  paw_reference?: string | null;
  full_name: string;
  email: string | null;
  establishment: string;
  date_of_visit: string | null;
  number_of_people: number | null;
  amount_saved: number;
  receipt_url: string | null;
};
