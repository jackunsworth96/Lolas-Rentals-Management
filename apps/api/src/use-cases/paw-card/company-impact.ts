import { type PawCardPort, type CompanyImpact } from '@lolas/domain';

export interface CompanyImpactInput {
  establishmentId: string;
}

export async function getCompanyImpact(
  input: CompanyImpactInput,
  deps: { pawCard: PawCardPort },
): Promise<CompanyImpact> {
  return deps.pawCard.getCompanyImpact(input.establishmentId);
}
