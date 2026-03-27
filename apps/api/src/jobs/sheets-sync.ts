import { GoogleSheetsSyncService } from '../adapters/google-sheets/sync-service.js';

const syncService = new GoogleSheetsSyncService();

export async function runSheetsSync(): Promise<void> {
  console.log('[sheets-sync] Starting full sync...');
  const results = await syncService.syncAll();

  for (const result of results) {
    if (result.errors.length > 0) {
      console.error(`[sheets-sync] ${result.table}: ${result.errors.join(', ')}`);
    } else {
      console.log(`[sheets-sync] ${result.table}: ${result.rowsSynced} rows synced`);
    }
  }

  console.log('[sheets-sync] Complete');
}

if (process.env.RUN_SHEETS_SYNC === 'true') {
  runSheetsSync().catch(console.error);
}
