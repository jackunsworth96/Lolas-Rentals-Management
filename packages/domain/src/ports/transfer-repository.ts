import type { Transfer } from '../entities/transfer.js';

export interface TransferFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  route?: string;
  paymentStatus?: string;
  bookingSource?: string;
  driverPaidStatus?: string;
  /** open = not yet settled with the driver and not cancelled; closed = settled or cancelled. */
  scope?: 'open' | 'closed';
}

export interface TransferSummary {
  outstanding: { count: number; total: number };
  collected: { count: number; total: number; driverCut: number; netLolas: number };
  settlement: { count: number; lolasOwesDriver: number; driverOwesLolas: number; net: number };
}

export interface TransferRepository {
  findById(id: string): Promise<Transfer | null>;
  findByStore(storeId: string, filters?: TransferFilters): Promise<Transfer[]>;
  findByBookingToken(token: string): Promise<Transfer | null>;
  findByOrderId(orderId: string): Promise<Transfer | null>;
  save(transfer: Transfer): Promise<void>;
  getSummary(storeId: string, filters?: Pick<TransferFilters, 'dateFrom' | 'dateTo'>): Promise<TransferSummary>;
}
