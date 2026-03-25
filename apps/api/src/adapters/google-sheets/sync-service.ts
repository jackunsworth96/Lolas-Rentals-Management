import type { SheetSyncPort, SyncResult } from '@lolas/domain';
import { readSheet, writeSheet } from './sheets-client.js';
import { supabase } from '../supabase/client.js';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? '';

const TABLE_SHEET_MAP: Record<string, string> = {
  orders: 'Orders',
  fleet: 'Fleet',
  customers: 'Customers',
  employees: 'Employees',
  payments: 'Payments',
  expenses: 'Expenses',
  transfers: 'Transfers',
  timesheets: 'Timesheets',
  maintenance: 'Maintenance',
  journal_entries: 'Journal',
  todo_tasks: 'Tasks',
  card_settlements: 'Card Settlements',
};

export class GoogleSheetsSyncService implements SheetSyncPort {
  async syncTable(tableName: string, rows: Record<string, unknown>[]): Promise<SyncResult> {
    const sheetName = TABLE_SHEET_MAP[tableName];
    if (!sheetName) return { tableName, synced: 0, errors: [`No sheet mapping for ${tableName}`] };

    if (rows.length === 0) return { tableName, synced: 0, errors: [] };

    const headers = Object.keys(rows[0]);
    const values = [headers, ...rows.map((row) => headers.map((h) => String(row[h] ?? '')))];

    try {
      await writeSheet(SPREADSHEET_ID, `${sheetName}!A1`, values);
      return { tableName, synced: rows.length, errors: [] };
    } catch (err) {
      return { tableName, synced: 0, errors: [(err as Error).message] };
    }
  }

  async syncAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const [tableName, sheetName] of Object.entries(TABLE_SHEET_MAP)) {
      const { data: rows, error } = await supabase.from(tableName).select('*');
      if (error) {
        results.push({ tableName, synced: 0, errors: [error.message] });
        continue;
      }
      const result = await this.syncTable(tableName, rows ?? []);
      results.push(result);
    }

    return results;
  }

  async getLastSyncTime(): Promise<Date | null> {
    return null;
  }
}
