/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { partnerSearchScore, type PartnerSearchFields } from '../src/pages/paw-card/partner-search.js';

const PARTNERS: PartnerSearchFields[] = [
  { name: 'Haole' },
  { name: 'Cocopelli' },
  { name: 'Brunch Spot' },
  { name: 'Siargao Wakepark' },
  { name: 'Ver-de' },
  { name: 'Big Mama Laundry' },
  { name: 'Big Mama Laundry Cafe' },
  { name: 'Kudo Surf' },
  { name: 'The Phone Hospital' },
  { name: 'Padel Palms' },
  { name: 'Marmalade' },
  { name: 'Wild' },
  { name: 'E-Foil Siargao' },
  { name: "El Chapo's" },
  { name: 'Siargao Bed & Brew' },
  { name: 'Tiburón' },
  { name: 'Happiness Beach Bar', description: 'Sunset drinks' },
  { name: 'Backside Burger' },
  { name: 'Food Lab', category: 'Food & Drink' },
  { name: 'Prime Fit Gym', category: 'Activities' },
  { name: 'Good Times Coffee', discount_headline: 'Free coffee with any rental' },
];

function matchingNames(query: string): string[] {
  return PARTNERS
    .map((partner) => ({ name: partner.name ?? '', score: partnerSearchScore(query, partner) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((row) => row.name);
}

describe('partnerSearchScore', () => {
  it('keeps exact and partial names', () => {
    expect(matchingNames('kudo')).toContain('Kudo Surf');
    expect(matchingNames('Kudo Surf')).toEqual(['Kudo Surf']);
    expect(matchingNames('surf')).toContain('Kudo Surf');
  });

  it('matches when a space or punctuation mark is missing', () => {
    expect(matchingNames('brunchspot')).toContain('Brunch Spot');
    expect(matchingNames('wake park')).toEqual(['Siargao Wakepark']);
    expect(matchingNames('verde')).toEqual(['Ver-de']);
    expect(matchingNames('ver de')).toEqual(['Ver-de']);
    expect(matchingNames('efoil')).toEqual(['E-Foil Siargao']);
    expect(matchingNames('el chapos')).toEqual(["El Chapo's"]);
    expect(matchingNames('bed and brew')).toEqual(['Siargao Bed & Brew']);
    expect(matchingNames('bigmama')).toEqual(['Big Mama Laundry', 'Big Mama Laundry Cafe']);
  });

  it('matches a missing letter, an extra letter, or a swapped pair', () => {
    expect(matchingNames('haol')).toContain('Haole');
    expect(matchingNames('cocopeli')).toContain('Cocopelli');
    expect(matchingNames('wkepark')).toEqual(['Siargao Wakepark']);
    expect(matchingNames('kudo sruf')).toEqual(['Kudo Surf']);
    expect(matchingNames('phone hospitol')).toEqual(['The Phone Hospital']);
    expect(matchingNames('big mamma')).toEqual(['Big Mama Laundry', 'Big Mama Laundry Cafe']);
    expect(matchingNames('brunchspt')).toContain('Brunch Spot');
  });

  it('ignores accents and a leading "the"', () => {
    expect(matchingNames('tiburon')).toEqual(['Tiburón']);
    expect(matchingNames('the wild')).toEqual(['Wild']);
  });

  it('still searches the description, offer, and category', () => {
    expect(matchingNames('sunset')).toContain('Happiness Beach Bar');
    expect(matchingNames('cofee')).toContain('Good Times Coffee');
    expect(matchingNames('activites')).toContain('Prime Fit Gym');
    expect(matchingNames('food')).toContain('Food Lab');
  });

  it('does not treat a short unrelated word as a typo', () => {
    expect(matchingNames('mama')).not.toContain('Marmalade');
    expect(matchingNames('mama')).toEqual(['Big Mama Laundry', 'Big Mama Laundry Cafe']);
    expect(matchingNames('zzzzqqq')).toEqual([]);
    expect(matchingNames('cat')).not.toContain('Marmalade');
    expect(partnerSearchScore('cat', { name: 'Surf Shack', discount_headline: 'Meet us at the beach' })).toBe(0);
    expect(partnerSearchScore('food', { name: 'Good Times Coffee' })).toBe(0);
    expect(partnerSearchScore('food', { name: 'Food Lab' })).toBeGreaterThan(0);
    expect(partnerSearchScore('cat', { name: 'Cat and Gun' })).toBeGreaterThan(0);
  });

  it('ranks the partner name above a description that only mentions it', () => {
    const named = partnerSearchScore('haole', { name: 'Haole', description: 'Cafe' });
    const mentioned = partnerSearchScore('haole', {
      name: 'Somewhere Else',
      description: 'Try the haole bowl',
    });
    expect(named).toBeGreaterThan(mentioned);
    expect(mentioned).toBeGreaterThan(0);
  });

  it('prefers the partner whose name contains every word', () => {
    const names = matchingNames('laundry cafe');
    expect(names[0]).toBe('Big Mama Laundry Cafe');
    expect(names).not.toContain('Big Mama Laundry');
  });
});
