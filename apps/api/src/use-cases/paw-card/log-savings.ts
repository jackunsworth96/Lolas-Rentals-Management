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
  };

  return deps.pawCard.submitEntry(submission);
}
