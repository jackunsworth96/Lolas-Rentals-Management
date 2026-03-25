import {
  type CardSettlementRepository,
  type AccountingPort,
  type JournalLeg,
  Money,
} from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';

export interface MatchSettlementDeps {
  cardSettlementRepo: CardSettlementRepository;
  accountingPort: AccountingPort;
}

export interface MatchSettlementInput {
  settlementIds: string[];
  settlementDate: string;
  bankReference: string;
  netAmount: number;
  feeAmount: number;
  bankAccountId: string;
  cardFeeAccountId: string;
  cardReceivableAccountId: string;
}

export async function matchSettlement(
  deps: MatchSettlementDeps,
  input: MatchSettlementInput,
) {
  const { cardSettlementRepo, accountingPort } = deps;

  const settlements = await cardSettlementRepo.findByIds(input.settlementIds);
  if (settlements.length === 0) {
    throw new Error('No settlements found for the given IDs');
  }

  const alreadySettled = settlements.filter((s) => s.isPaid);
  if (alreadySettled.length > 0) {
    throw new Error(`${alreadySettled.length} settlement(s) are already settled`);
  }

  const grossAmount = settlements.reduce((sum, s) => sum + s.amount, 0);
  const grossRounded = Math.round(grossAmount * 100) / 100;
  const sumCheck = Math.round((input.netAmount + input.feeAmount) * 100) / 100;

  if (grossRounded !== sumCheck) {
    throw new Error(
      `Net amount (${input.netAmount}) + fee (${input.feeAmount}) = ${sumCheck} ` +
      `does not equal gross amount ${grossRounded}`,
    );
  }

  const storeId = settlements[0].storeId;

  const legs: JournalLeg[] = [
    {
      entryId: crypto.randomUUID(),
      accountId: input.bankAccountId,
      debit: Money.php(input.netAmount),
      credit: Money.zero(),
      description: `Card settlement deposit — ref ${input.bankReference}`,
      referenceType: 'card_settlement',
      referenceId: input.bankReference,
    },
  ];

  if (input.feeAmount > 0) {
    legs.push({
      entryId: crypto.randomUUID(),
      accountId: input.cardFeeAccountId,
      debit: Money.php(input.feeAmount),
      credit: Money.zero(),
      description: `Card processing fee — ref ${input.bankReference}`,
      referenceType: 'card_settlement',
      referenceId: input.bankReference,
    });
  }

  legs.push({
    entryId: crypto.randomUUID(),
    accountId: input.cardReceivableAccountId,
    debit: Money.zero(),
    credit: Money.php(grossAmount),
    description: `Card receivable cleared — ref ${input.bankReference}`,
    referenceType: 'card_settlement',
    referenceId: input.bankReference,
  });

  await accountingPort.createTransaction(legs, storeId);

  await cardSettlementRepo.settleMany(input.settlementIds, {
    isPaid: true,
    dateSettled: input.settlementDate,
    settlementRef: input.bankReference,
    netAmount: input.netAmount,
    feeExpense: input.feeAmount,
    accountId: input.bankAccountId,
  });

  // Update corresponding payment records
  const paymentIds = settlements
    .map((s) => s.paymentId)
    .filter((id): id is string => !!id);

  if (paymentIds.length > 0) {
    const sb = getSupabaseClient();
    await sb
      .from('payments')
      .update({ settlement_status: 'settled' })
      .in('id', paymentIds);
  }

  return {
    settledCount: settlements.length,
    grossAmount,
    netAmount: input.netAmount,
    feeAmount: input.feeAmount,
  };
}
