import {
  type PawCardPort,
  type PawCardCustomer,
  DomainError,
} from '@lolas/domain';

export interface LookupCustomerInput {
  query: string;
}

export async function lookupCustomer(
  input: LookupCustomerInput,
  deps: { pawCard: PawCardPort },
): Promise<PawCardCustomer[]> {
  if (!input.query || input.query.trim().length === 0) {
    throw new DomainError('Search query is required');
  }

  return deps.pawCard.lookupCustomer(input.query.trim());
}
