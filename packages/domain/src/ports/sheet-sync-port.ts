export interface SyncResult {
  table: string;
  rowsSynced: number;
  errors: string[];
  syncedAt: Date;
}

export interface SheetSyncPort {
  syncTable(table: string): Promise<SyncResult>;
  syncAll(): Promise<SyncResult[]>;
  getLastSyncTime(table: string): Promise<Date | null>;
}
