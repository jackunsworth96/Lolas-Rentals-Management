import {
  type TransferRepository,
  type AccountingPort,
  type JournalLeg,
  type Transfer,
  Money,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';
import { resolveTransferAccounts } from './transfer-accounts.js';

export interface SettleDriverInput {
  storeId: string;
  transferIds: string[];
  date: string;
  cashAccountId: string | null;
  driverExpenseAccountId: string | null;
  postJournal: boolean;
}

export interface SettleDriverResult {
  settlementId: string;
  count: number;
  /** Driver cuts on every settled job. */
  lolasOwesDriver: number;
  /** Fares the driver collected and is handing back. */
  driverOwesLolas: number;
  /** Positive: driver hands Lola's this much. Negative: Lola's pays the driver. */
  net: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Settles a batch of transfers with the driver in one netted movement:
 *   DR driver expense       (sum of cuts)
 *   CR driver clearing      (fares the driver held)
 *   DR / CR cash            (the net that actually changes hands)
 */
export async function settleDriver(
  input: SettleDriverInput,
  deps: { transfers: TransferRepository; accounting: AccountingPort },
): Promise<SettleDriverResult> {
  const ids = [...new Set(input.transferIds)];
  const loaded = await Promise.all(ids.map((id) => deps.transfers.findById(id)));

  const missing = ids.filter((_, i) => !loaded[i]);
  if (missing.length > 0) throw new DomainError(`Transfers not found: ${missing.join(', ')}`);
  const transfers = loaded as Transfer[];

  for (const t of transfers) {
    if (t.storeId !== input.storeId) throw new DomainError('All transfers must belong to the same store');
    if (t.status === 'cancelled') throw new DomainError(`${t.customerName}'s transfer is cancelled`);
    if (t.driverSettledAt) throw new DomainError(`${t.customerName}'s transfer is already settled`);
    if (t.amountPaid <= 0) {
      throw new DomainError(`${t.customerName}'s transfer has not been paid yet. Record the payment first.`);
    }
  }

  const lolasOwesDriver = round2(transfers.reduce((s, t) => s + t.effectiveDriverCut(), 0));
  const driverOwesLolas = round2(transfers.reduce((s, t) => s + t.driverCollectedAmount, 0));
  const net = round2(driverOwesLolas - lolasOwesDriver);
  const settlementId = randomUUID();

  if (input.postJournal) {
    const accounts = await resolveTransferAccounts(input.storeId);
    const expenseAccountId = input.driverExpenseAccountId ?? accounts.driverExpenseAccountId;
    if (lolasOwesDriver > 0 && !expenseAccountId) throw new DomainError('No driver expense account configured');
    if (driverOwesLolas > 0 && !accounts.driverClearingAccountId) {
      throw new DomainError('No Driver Clearing account is set up for this store');
    }
    if (net !== 0 && !input.cashAccountId) {
      throw new DomainError('Select the cash account the settlement goes through');
    }

    const legs: JournalLeg[] = [];
    for (const t of transfers) {
      const cut = t.effectiveDriverCut();
      if (cut > 0) {
        legs.push({
          entryId: randomUUID(),
          accountId: expenseAccountId!,
          debit: Money.php(cut),
          credit: Money.zero(),
          description: `Driver cut — transfer ${t.id}`,
          referenceType: 'transfer',
          referenceId: t.id,
        });
      }
      if (t.driverCollectedAmount > 0) {
        legs.push({
          entryId: randomUUID(),
          accountId: accounts.driverClearingAccountId!,
          debit: Money.zero(),
          credit: Money.php(t.driverCollectedAmount),
          description: `Driver handed over fare — transfer ${t.id}`,
          referenceType: 'transfer',
          referenceId: t.id,
        });
      }
    }
    if (net !== 0) {
      legs.push({
        entryId: randomUUID(),
        accountId: input.cashAccountId!,
        debit: net > 0 ? Money.php(net) : Money.zero(),
        credit: net < 0 ? Money.php(-net) : Money.zero(),
        description: net > 0
          ? `Driver settlement — received from driver (${transfers.length} transfers)`
          : `Driver settlement — paid to driver (${transfers.length} transfers)`,
        referenceType: 'transfer_driver_settlement',
        referenceId: settlementId,
      });
    }
    if (legs.length > 0) await deps.accounting.createTransaction(legs, input.storeId, input.date);
  }

  const settledAt = new Date();
  await Promise.all(transfers.map((t) => deps.transfers.save(t.withDriverSettled(settlementId, settledAt))));

  return { settlementId, count: transfers.length, lolasOwesDriver, driverOwesLolas, net };
}
