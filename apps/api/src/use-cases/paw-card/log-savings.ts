import {
  type AccountingPort,
  type PawCardPort,
  type PawCardEntry,
  type PawCardSubmission,
  DomainError,
  Money,
} from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';
import {
  CHARITY_ANNUAL_CAP,
  CHARITY_EXPENSE_ACCOUNT_ID,
  companyDonatedThisYear,
} from '../../lib/charity-cap.js';

const CHARITY_PAYABLE_ACCOUNT_ID = 'CHARITY-PAYABLE';

export interface LogSavingsInput {
  customerId: string;
  establishmentId: string;
  discountAmount: number;
  visitDate: string;
  submittedBy: string;
  storeId: string;
  receiptUrl?: string;
  numberOfPeople?: number;
  email?: string | null;
  fullName?: string | null;
  orderId?: string | null;
}

/** Lola's matches each logged saving peso for peso until the annual cap is reached. */
async function postPawCardMatch(entry: PawCardEntry, accountingPort: AccountingPort): Promise<void> {
  const donatedThisYear = await companyDonatedThisYear(getSupabaseClient());
  const remaining = Math.max(0, CHARITY_ANNUAL_CAP - donatedThisYear);
  const match = Math.round(Math.min(entry.discountAmount, remaining) * 100) / 100;
  if (match <= 0) return;

  const description = `Paw Card match — ${entry.establishmentName} (entry ${entry.id})`;
  await accountingPort.createTransaction(
    [
      {
        entryId: crypto.randomUUID(),
        accountId: CHARITY_EXPENSE_ACCOUNT_ID,
        debit: Money.php(match),
        credit: Money.zero(),
        description,
        referenceType: 'paw_card_charity',
        referenceId: entry.id,
      },
      {
        entryId: crypto.randomUUID(),
        accountId: CHARITY_PAYABLE_ACCOUNT_ID,
        debit: Money.zero(),
        credit: Money.php(match),
        description,
        referenceType: 'paw_card_charity',
        referenceId: entry.id,
      },
    ],
    'company',
    formatManilaDate(),
  );
}

export async function logSavings(
  input: LogSavingsInput,
  deps: { pawCard: PawCardPort; accountingPort?: AccountingPort },
): Promise<PawCardEntry> {
  if (input.discountAmount <= 0) {
    throw new DomainError('Discount amount must be positive');
  }

  const submission: PawCardSubmission = {
    customerId: input.customerId,
    establishmentId: input.establishmentId,
    discountAmount: input.discountAmount,
    visitDate: input.visitDate,
    submittedBy: input.submittedBy,
    storeId: input.storeId,
    receiptUrl: input.receiptUrl,
    numberOfPeople: input.numberOfPeople,
    email: input.email,
    fullName: input.fullName,
    orderId: input.orderId,
  };

  const entry = await deps.pawCard.submitEntry(submission);

  // The saving is already stored, so a failed match must not fail the
  // submission (the customer would resubmit and create a duplicate).
  if (deps.accountingPort) {
    try {
      await postPawCardMatch(entry, deps.accountingPort);
    } catch (err) {
      console.error('[paw-card-match] Failed to post charity match for entry', entry.id, err);
    }
  }

  return entry;
}
