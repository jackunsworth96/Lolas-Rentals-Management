import type { Transfer } from '../entities/transfer.js';

export interface TransferFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  route?: string;
  paymentStatus?: string;
  bookingSource?: string;
  driverPaidStatus?: string;
}

export interface TransferSummary {
  outstanding: { count: number; total: number };
  collected: { count: number; total: number; driverCut: number; netLolas: number };
}

export interface TransferRepository {
  findById(id: string): Promise<Transfer | null>;
  findByStore(storeId: string, filters?: TransferFilters): Promise<Transfer[]>;
  findByBookingToken(token: string): Promise<Transfer | null>;
  save(transfer: Transfer): Promise<void>;
  getSummary(storeId: string, filters?: Pick<TransferFilters, 'dateFrom' | 'dateTo'>): Promise<TransferSummary>;
}
