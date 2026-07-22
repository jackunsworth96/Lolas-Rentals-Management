/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  activePartnerChoices,
  attributionAction,
  currentPartnerChoice,
} from '../src/components/orders/partner-attribution.js';

const partners = [
  { id: 'bravo-id', slug: 'bravo', name: 'Bravo Beach Resort', active: true, status: 'active' },
  { id: 'old-id', slug: 'old-hotel', name: 'Old Hotel', active: false, status: 'rejected' },
  { id: 'pending-id', slug: 'pending-hotel', name: 'Pending Hotel', active: true, status: 'pending' },
];

describe('partner attribution choices', () => {
  it('only offers active, approved partners', () => {
    expect(activePartnerChoices(partners).map((partner) => partner.slug)).toEqual(['bravo']);
  });

  it('still resolves an inactive current partner so staff can remove it', () => {
    expect(currentPartnerChoice(partners, 'old-hotel')?.id).toBe('old-id');
  });

  it('classifies assignment, reassignment, removal, and unchanged selections', () => {
    expect(attributionAction('', 'bravo-id')).toBe('assign');
    expect(attributionAction('old-id', 'bravo-id')).toBe('reassign');
    expect(attributionAction('old-id', '')).toBe('remove');
    expect(attributionAction('bravo-id', 'bravo-id')).toBe('unchanged');
  });
});
