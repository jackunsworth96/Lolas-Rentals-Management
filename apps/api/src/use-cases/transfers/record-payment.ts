import {
  type TransferRepository,
  type AccountingPort,
  type JournalLeg,
  Transfer,
  Money,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface RecordTransferPaymentInput {
  transferId: string;
  amount: number;
  paymentMethod: string;
  date: string;
  cashAccountId: string;
  transferIncomeAccountId: string;
}

export interface RecordTransferPaymentResult {
  transfer: Transfer;
  paymentStatus: string;
}

export async function recordTransferPayment(
  input: RecordTransferPaymentInput,
  deps: { transfers: TransferRepository; accounting: AccountingPort },
): Promise<RecordTransferPaymentResult> {
  const transfer = await deps.transfers.findById(input.transferId);
  if (!transfer) {
    throw new DomainError(`Transfer ${input.transferId} not found`);
  }

  if (input.amount <= 0) {
    throw new DomainError('Payment amount must be positive');
  }

  const amount = Money.php(input.amount);

  const legs: JournalLeg[] = [
    {
      entryId: randomUUID(),
      accountId: input.cashAccountId,
      debit: amount,
      credit: Money.zero(),
      description: `Transfer ${transfer.id} customer payment`,
      referenceType: 'transfer',
      referenceId: transfer.id,
    },
    {
      entryId: randomUUID(),
      accountId: input.transferIncomeAccountId,
      debit: Money.zero(),
      credit: amount,
      description: `Transfer ${transfer.id} income`,
      referenceType: 'transfer',
      referenceId: transfer.id,
    },
  ];

  await deps.accounting.createTransaction(legs, transfer.storeId);

  const paymentStatus = transfer.derivePaymentStatus(amount);

  const updated = Transfer.create({
    ...transferToProps(transfer),
    paymentMethod: input.paymentMethod,
    paymentStatus,
    updatedAt: new Date(),
  });

  await deps.transfers.save(updated);
  return { transfer: updated, paymentStatus };
}

function transferToProps(t: Transfer) {
  return {
    id: t.id,
    orderId: t.orderId,
    serviceDate: t.serviceDate,
    customerName: t.customerName,
    contactNumber: t.contactNumber,
    customerEmail: t.customerEmail,
    customerType: t.customerType,
    route: t.route,
    flightTime: t.flightTime,
    paxCount: t.paxCount,
    vanType: t.vanType,
    accommodation: t.accommodation,
    status: t.status,
    opsNotes: t.opsNotes,
    totalPrice: t.totalPrice,
    paymentMethod: t.paymentMethod,
    paymentStatus: t.paymentStatus,
    driverFee: t.driverFee,
    netProfit: t.netProfit,
    driverPaidStatus: t.driverPaidStatus,
    bookingSource: t.bookingSource,
    bookingToken: t.bookingToken,
    storeId: t.storeId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
