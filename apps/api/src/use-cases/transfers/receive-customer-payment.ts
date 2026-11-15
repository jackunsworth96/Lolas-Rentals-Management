import {
  type TransferRepository,
  type AccountingPort,
  type JournalLeg,
  type Transfer,
  type TransferCollector,
  Money,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';
import { collectPayment, type CollectPaymentDeps } from '../orders/collect-payment.js';
import { resolveStoreAccounts } from '../../adapters/supabase/maintenance-expense-rpc.js';
import { resolveTransferAccounts, DRIVER_COLLECTED_PAYMENT_METHOD } from './transfer-accounts.js';

export interface ReceiveCustomerPaymentInput {
  transferId: string;
  amount: number;
  collector: TransferCollector;
  /** Required when Lola's collected. */
  paymentMethod: string | null;
  /** Account the money went into when Lola's collected. */
  cashAccountId: string | null;
  isCardPayment: boolean;
  date: string;
}

export type ReceiveCustomerPaymentDeps = CollectPaymentDeps & {
  transferRepo: TransferRepository;
  accountingPort: AccountingPort;
};

/**
 * Records money received for a transfer, by Lola's or by the driver.
 *
 * Fares billed through a rental order are paid on the order (DR cash or driver
 * clearing / CR receivable) so the order balance drops and income is not booked
 * twice. Standalone fares post DR cash or driver clearing / CR transfer income.
 */
export async function receiveCustomerPayment(
  input: ReceiveCustomerPaymentInput,
  deps: ReceiveCustomerPaymentDeps,
): Promise<Transfer> {
  const transfer = await deps.transferRepo.findById(input.transferId);
  if (!transfer) throw new DomainError(`Transfer ${input.transferId} not found`);
  if (transfer.status === 'cancelled') throw new DomainError('This transfer is cancelled');
  if (transfer.driverSettledAt) throw new DomainError('This transfer is already settled with the driver');
  if (input.amount <= 0) throw new DomainError('Payment amount must be positive');

  const due = transfer.balanceDue();
  if (input.amount > due + 0.005) {
    throw new DomainError(
      due <= 0
        ? 'This transfer is already paid in full'
        : `Amount is more than the ₱${due.toFixed(2)} still owed`,
    );
  }

  const accounts = await resolveTransferAccounts(transfer.storeId);
  const byDriver = input.collector === 'driver';

  let debitAccountId: string | null;
  let paymentMethod: string;
  if (byDriver) {
    debitAccountId = accounts.driverClearingAccountId;
    if (!debitAccountId) throw new DomainError('No Driver Clearing account is set up for this store');
    paymentMethod = DRIVER_COLLECTED_PAYMENT_METHOD;
  } else {
    if (!input.paymentMethod) throw new DomainError('Select a payment method');
    paymentMethod = input.paymentMethod;
    debitAccountId = input.cashAccountId;
    if (!input.isCardPayment && !debitAccountId) {
      throw new DomainError('Select the account that received the payment');
    }
  }

  const isCard = !byDriver && input.isCardPayment;

  if (transfer.billedToOrder && transfer.orderId) {
    const { receivableAccountId } = await resolveStoreAccounts(transfer.storeId);
    if (!receivableAccountId) throw new DomainError('No receivable account configured for this store');
    await collectPayment(deps, {
      orderId: transfer.orderId,
      amount: input.amount,
      paymentMethodId: paymentMethod,
      accountId: isCard ? null : debitAccountId,
      paymentType: 'transfer',
      transactionDate: input.date,
      receivableAccountId,
      isCardPayment: isCard,
    });
  } else {
    if (isCard) {
      throw new DomainError('Card payments for walk-in transfers are not supported yet. Take cash or GCash.');
    }
    if (!accounts.incomeAccountId) throw new DomainError('No transfer income account configured for this store');
    const amount = Money.php(input.amount);
    const legs: JournalLeg[] = [
      {
        entryId: randomUUID(),
        accountId: debitAccountId!,
        debit: amount,
        credit: Money.zero(),
        description: byDriver
          ? `Transfer ${transfer.id} fare held by driver`
          : `Transfer ${transfer.id} customer payment`,
        referenceType: 'transfer',
        referenceId: transfer.id,
      },
      {
        entryId: randomUUID(),
        accountId: accounts.incomeAccountId,
        debit: Money.zero(),
        credit: amount,
        description: `Transfer ${transfer.id} income`,
        referenceType: 'transfer',
        referenceId: transfer.id,
      },
    ];
    await deps.accountingPort.createTransaction(legs, transfer.storeId, input.date);
  }

  let updated = transfer.withPaymentReceived(input.amount, input.collector, paymentMethod);
  if (byDriver && updated.collectVia !== 'driver') updated = updated.withCollectVia('driver');
  await deps.transferRepo.save(updated);
  return updated;
}
