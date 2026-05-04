import {
  type TransferRepository,
  type AccountingPort,
  type JournalLeg,
  Transfer,
  Money,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface RecordBulkDriverPaymentInput {
  transferIds: string[];
  /** Map of transferId → driver fee amount for that specific transfer. */
  driverFees: Record<string, number>;
  driverExpenseAccountId: string;
  cashAccountId: string;
  date: string;
  storeId: string;
}

export interface RecordBulkDriverPaymentResult {
  updatedCount: number;
  totalPaid: number;
  totalMarkup: number;
}

export async function recordBulkDriverPayment(
  input: RecordBulkDriverPaymentInput,
  deps: { transfers: TransferRepository; accounting: AccountingPort },
): Promise<RecordBulkDriverPaymentResult> {
  if (input.transferIds.length === 0) {
    throw new DomainError('No transfers selected');
  }

  // Load all transfers and validate they exist and belong to this store.
  const transfers = await Promise.all(
    input.transferIds.map((id) => deps.transfers.findById(id)),
  );

  const missing = input.transferIds.filter((id, i) => !transfers[i]);
  if (missing.length > 0) {
    throw new DomainError(`Transfers not found: ${missing.join(', ')}`);
  }

  const wrongStore = transfers.filter((t) => t!.storeId !== input.storeId);
  if (wrongStore.length > 0) {
    throw new DomainError('All transfers must belong to the same store');
  }

  // Validate all fee entries exist.
  for (const id of input.transferIds) {
    const fee = input.driverFees[id];
    if (!fee || fee <= 0) {
      throw new DomainError(`Driver fee for transfer ${id} must be a positive number`);
    }
  }

  const totalPaid = input.transferIds.reduce((sum, id) => sum + input.driverFees[id], 0);
  const totalRevenue = transfers.reduce((sum, t) => sum + t!.totalPrice.toNumber(), 0);

  // Build one consolidated journal transaction:
  //   - One DEBIT leg per transfer (driver expense, keyed to that transfer)
  //   - One CREDIT leg for the total cash out
  const debitLegs: JournalLeg[] = input.transferIds.map((id) => ({
    entryId: randomUUID(),
    accountId: input.driverExpenseAccountId,
    debit: Money.php(input.driverFees[id]),
    credit: Money.zero(),
    description: `Bulk driver payment — transfer ${id}`,
    referenceType: 'transfer',
    referenceId: id,
  }));

  const creditLeg: JournalLeg = {
    entryId: randomUUID(),
    accountId: input.cashAccountId,
    debit: Money.zero(),
    credit: Money.php(totalPaid),
    description: `Bulk driver payment — ${input.transferIds.length} transfer${input.transferIds.length !== 1 ? 's' : ''}`,
    referenceType: 'transfer_bulk_driver_payment',
    referenceId: null,
  };

  await deps.accounting.createTransaction([...debitLegs, creditLeg], input.storeId, input.date);

  // Update each transfer: record individual driver fee and mark as paid.
  await Promise.all(
    transfers.map((t) => {
      const fee = Money.php(input.driverFees[t!.id]);
      const updated = Transfer.create({
        id: t!.id,
        orderId: t!.orderId,
        serviceDate: t!.serviceDate,
        customerName: t!.customerName,
        contactNumber: t!.contactNumber,
        customerEmail: t!.customerEmail,
        customerType: t!.customerType,
        route: t!.route,
        flightTime: t!.flightTime,
        flightNumber: t!.flightNumber,
        paxCount: t!.paxCount,
        vanType: t!.vanType,
        accommodation: t!.accommodation,
        status: t!.status,
        opsNotes: t!.opsNotes,
        totalPrice: t!.totalPrice,
        paymentMethod: t!.paymentMethod,
        paymentStatus: t!.paymentStatus,
        driverFee: fee,
        netProfit: t!.totalPrice.subtract(fee),
        driverPaidStatus: 'Paid',
        bookingSource: t!.bookingSource,
        bookingToken: t!.bookingToken,
        storeId: t!.storeId,
        createdAt: t!.createdAt,
        updatedAt: new Date(),
        collectedAt: t!.collectedAt,
        collectedAmount: t!.collectedAmount,
        pickupTime: t!.pickupTime,
        pickupTimeEnd: t!.pickupTimeEnd,
        telegramMessageId: t!.telegramMessageId,
        driverConfirmed: t!.driverConfirmed,
        driverConfirmedAt: t!.driverConfirmedAt,
      });
      return deps.transfers.save(updated);
    }),
  );

  return {
    updatedCount: transfers.length,
    totalPaid,
    totalMarkup: totalRevenue - totalPaid,
  };
}
