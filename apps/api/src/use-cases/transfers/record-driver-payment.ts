import {
  type TransferRepository,
  type AccountingPort,
  type JournalLeg,
  Transfer,
  Money,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface RecordDriverPaymentInput {
  transferId: string;
  driverFee: number;
  date: string;
  driverExpenseAccountId: string;
  cashAccountId: string;
}

export interface RecordDriverPaymentResult {
  transfer: Transfer;
  netProfit: number;
}

export async function recordDriverPayment(
  input: RecordDriverPaymentInput,
  deps: { transfers: TransferRepository; accounting: AccountingPort },
): Promise<RecordDriverPaymentResult> {
  const transfer = await deps.transfers.findById(input.transferId);
  if (!transfer) {
    throw new DomainError(`Transfer ${input.transferId} not found`);
  }

  if (input.driverFee <= 0) {
    throw new DomainError('Driver fee must be positive');
  }

  const feeAmount = Money.php(input.driverFee);

  const legs: JournalLeg[] = [
    {
      entryId: randomUUID(),
      accountId: input.driverExpenseAccountId,
      debit: feeAmount,
      credit: Money.zero(),
      description: `Transfer ${transfer.id} driver payment`,
      referenceType: 'transfer',
      referenceId: transfer.id,
    },
    {
      entryId: randomUUID(),
      accountId: input.cashAccountId,
      debit: Money.zero(),
      credit: feeAmount,
      description: `Transfer ${transfer.id} driver payment`,
      referenceType: 'transfer',
      referenceId: transfer.id,
    },
  ];

  await deps.accounting.createTransaction(legs, transfer.storeId);

  const updated = Transfer.create({
    id: transfer.id,
    orderId: transfer.orderId,
    serviceDate: transfer.serviceDate,
    customerName: transfer.customerName,
    contactNumber: transfer.contactNumber,
    customerEmail: transfer.customerEmail,
    customerType: transfer.customerType,
    route: transfer.route,
    flightTime: transfer.flightTime,
    paxCount: transfer.paxCount,
    vanType: transfer.vanType,
    accommodation: transfer.accommodation,
    status: transfer.status,
    opsNotes: transfer.opsNotes,
    totalPrice: transfer.totalPrice,
    paymentMethod: transfer.paymentMethod,
    paymentStatus: transfer.paymentStatus,
    driverFee: feeAmount,
    netProfit: transfer.totalPrice.subtract(feeAmount),
    driverPaidStatus: 'Paid',
    bookingSource: transfer.bookingSource,
    bookingToken: transfer.bookingToken,
    storeId: transfer.storeId,
    createdAt: transfer.createdAt,
    updatedAt: new Date(),
  });

  await deps.transfers.save(updated);

  return {
    transfer: updated,
    netProfit: updated.calculateNetProfit().toNumber(),
  };
}
