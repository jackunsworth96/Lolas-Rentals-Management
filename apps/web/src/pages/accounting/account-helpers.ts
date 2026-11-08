import type { AccountBalanceItem } from '../../api/accounting.js';
import { manilaToday } from '../../utils/date.js';

export type HalfPeriod = '1' | '2' | 'full';

export const TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];
export const BALANCE_SHEET_TYPES = ['Asset', 'Liability', 'Equity'];

export const CHARITY_PAYABLE_ID = 'CHARITY-PAYABLE';
export const CHARITY_WALLET_ID = 'CASH-CHARITY-WALLET';
export const RECON_ADJ_EQUITY_ID = 'RECON-ADJ-EQUITY';

/** Preferred display order for the money the business actually holds. */
const LIQUID_ORDER = [
  'Wise',
  'BANK-BDO-store-lolas',
  'BANK-UNION-BANK-store-lolas',
  'SAFE-store-lolas',
  'GCASH-store-lolas',
  'CASH-LOLA',
  'CASH-DEPOSIT-ENVELOPE',
  CHARITY_WALLET_ID,
];

export function isCreditNormal(accountType: string): boolean {
  return ['Liability', 'Income', 'Equity'].includes(accountType);
}

/** Ledger balances are debit − credit; show credit-normal accounts as positive amounts. */
export function toDisplay(balance: number, accountType: string): number {
  return isCreditNormal(accountType) ? -balance : balance;
}

/** Cash, bank, e-wallet and safe accounts — money that can be counted or matched to a statement. */
export function isLiquidAccount(a: Pick<AccountBalanceItem, 'accountId' | 'accountName' | 'accountType'>): boolean {
  if (a.accountType !== 'Asset') return false;
  if (LIQUID_ORDER.includes(a.accountId)) return true;
  const n = a.accountName.toLowerCase();
  if (/advance|receivable|pending|fleet|depreciation|fund|retired/.test(n)) return false;
  return /cash|bank|gcash|safe|wise|wallet|envelope/.test(n);
}

export function liquidSortKey(accountId: string): number {
  const i = LIQUID_ORDER.indexOf(accountId);
  return i === -1 ? LIQUID_ORDER.length : i;
}

export function isCustomerDepositLiability(a: Pick<AccountBalanceItem, 'accountName' | 'accountType'>): boolean {
  return a.accountType === 'Liability' && /deposits? held/i.test(a.accountName);
}

export function manilaMonth(): string {
  return manilaToday().slice(0, 7);
}

export function lastDayOfMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

export function periodRange(month: string, half: HalfPeriod): { from: string; to: string } {
  const last = String(lastDayOfMonth(month)).padStart(2, '0');
  if (half === '1') return { from: `${month}-01`, to: `${month}-15` };
  if (half === '2') return { from: `${month}-16`, to: `${month}-${last}` };
  return { from: `${month}-01`, to: `${month}-${last}` };
}

export function monthOptions(count = 12): { value: string; label: string }[] {
  const [y, m] = manilaMonth().split('-').map(Number);
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    options.push({ value, label });
  }
  return options;
}

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function storeLabel(storeId: string | null | undefined, stores: Array<{ id: string; name: string }>): string {
  if (!storeId || storeId === 'company') return 'Company';
  return stores.find((s) => s.id === storeId)?.name ?? storeId;
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
