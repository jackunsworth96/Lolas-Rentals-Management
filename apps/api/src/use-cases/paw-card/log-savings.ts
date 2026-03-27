import {
  type PawCardPort,
  type PawCardEntry,
  type PawCardSubmission,
  DomainError,
} from '@lolas/domain';

export interface LogSavingsInput {
  customerId: string;
  establishmentId: string;
  discountAmount: number;
  visitDate: string;
  submittedBy: string;
  storeId: string;
  receiptUrl?: string;
  numberOfPeople?: number;
}

export async function logSavings(
  input: LogSavingsInput,
  deps: { pawCard: PawCardPort },
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
  };

  return deps.pawCard.submitEntry(submission);
}
