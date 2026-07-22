export interface PartnerChoice {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  status: string;
}

export function activePartnerChoices<T extends PartnerChoice>(partners: T[]): T[] {
  return partners.filter((partner) => partner.active && partner.status === 'active');
}

export function currentPartnerChoice<T extends PartnerChoice>(partners: T[], partnerRef: string | null): T | undefined {
  if (!partnerRef) return undefined;
  return partners.find((partner) => partner.slug === partnerRef);
}

export type AttributionAction = 'unchanged' | 'assign' | 'reassign' | 'remove';

export function attributionAction(originalPartnerId: string, selectedPartnerId: string): AttributionAction {
  if (originalPartnerId === selectedPartnerId) return 'unchanged';
  if (!selectedPartnerId) return 'remove';
  return originalPartnerId ? 'reassign' : 'assign';
}
