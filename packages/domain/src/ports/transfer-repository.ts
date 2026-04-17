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

export interface TransferRepository {
  findById(id: string): Promise<Transfer | null>;
  findByStore(storeId: string, filters?: TransferFilters): Promise<Transfer[]>;
  findByBookingToken(token: string): Promise<Transfer | null>;
  save(transfer: Transfer): Promise<void>;
}
