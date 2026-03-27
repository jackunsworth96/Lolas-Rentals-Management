import type { SheetSyncPort, SyncResult } from '@lolas/domain';
import { writeSheet } from './sheets-client.js';
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
  async syncTable(table: string): Promise<SyncResult> {
    const sheetName = TABLE_SHEET_MAP[table];
    if (!sheetName) {
      return {
        table,
        rowsSynced: 0,
        errors: [`No sheet mapping for ${table}`],
        syncedAt: new Date(),
      };
    }

    const { data: rows, error: fetchError } = await supabase.from(table).select('*');
    if (fetchError) {
      return {
        table,
        rowsSynced: 0,
        errors: [fetchError.message],
        syncedAt: new Date(),
      };
    }

    const rowList = (rows ?? []) as Record<string, unknown>[];
    if (rowList.length === 0) {
      return { table, rowsSynced: 0, errors: [], syncedAt: new Date() };
    }

    const headers = Object.keys(rowList[0]);
    const values = [headers, ...rowList.map((row) => headers.map((h) => String(row[h] ?? '')))];

    try {
      await writeSheet(SPREADSHEET_ID, `${sheetName}!A1`, values);
      return { table, rowsSynced: rowList.length, errors: [], syncedAt: new Date() };
    } catch (err) {
      return {
        table,
        rowsSynced: 0,
        errors: [(err as Error).message],
        syncedAt: new Date(),
      };
    }
  }

  async syncAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const tableName of Object.keys(TABLE_SHEET_MAP)) {
      const result = await this.syncTable(tableName);
      results.push(result);
    }

    return results;
  }

  async getLastSyncTime(table: string): Promise<Date | null> {
    return null;
  }
}
