import { Transfer, Money, type TransferRepository } from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface CreateTransferInput {
  serviceDate: string;
  customerName: string;
  contactNumber: string | null;
  customerEmail: string | null;
  customerType: 'Walk-in' | 'Online' | null;
  route: string;
  flightTime: string | null;
  paxCount: number;
  vanType: string | null;
  accommodation: string | null;
  opsNotes: string | null;
  totalPrice: number;
  paymentMethod: string | null;
  bookingSource: string | null;
  bookingToken: string | null;
  storeId: string;
  orderId: string | null;
}

export async function createTransfer(
  input: CreateTransferInput,
  deps: { transfers: TransferRepository },
): Promise<Transfer> {
  const transfer = Transfer.create({
    id: randomUUID(),
    orderId: input.orderId,
    serviceDate: input.serviceDate,
    customerName: input.customerName,
    contactNumber: input.contactNumber,
    customerEmail: input.customerEmail,
    customerType: input.customerType,
    route: input.route,
    flightTime: input.flightTime,
    paxCount: input.paxCount,
    vanType: input.vanType,
    accommodation: input.accommodation,
    status: 'Pending',
    opsNotes: input.opsNotes,
    totalPrice: Money.php(input.totalPrice),
    paymentMethod: input.paymentMethod,
    paymentStatus: 'Pending',
    driverFee: null,
    netProfit: null,
    driverPaidStatus: null,
    bookingSource: input.bookingSource,
    bookingToken: input.bookingToken,
    storeId: input.storeId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await deps.transfers.save(transfer);
  return transfer;
}
