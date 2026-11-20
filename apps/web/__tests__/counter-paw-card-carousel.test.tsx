import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PawCardEstablishment } from '../src/api/paw-card-establishments.js';

const { PartnerCarousel, AUTO_ADVANCE_MS } = await import('../src/pages/counter/PartnerCarousel.js');

const partner = (id: string, name: string, discount_headline: string): PawCardEstablishment => ({
  id, name, discount_headline, category: 'food', is_favourite: false, is_high_value: false,
});

const partners = [
  partner('1', 'Bar Ciao', 'FREE Iced Tea'),
  partner('2', 'Brunch Spot', 'FREE Coffee With Any Order'),
  partner('3', 'eSkate Siargao', '₱100 Off Per Hour'),
];

const headline = () => screen.getByRole('region', { name: 'Paw Card partners' }).querySelector('p.font-headline')?.textContent;
const position = () => screen.getByRole('region', { name: 'Paw Card partners' }).querySelector('span.tabular-nums')?.textContent;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Paw Card partner carousel', () => {
  it('shows the first partner offer and moves on with the chevrons', async () => {
    render(<PartnerCarousel partners={partners} />);
    expect(headline()).toBe('FREE Iced Tea');
    expect(screen.getByText('Bar Ciao', { selector: 'p' })).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Next partner'));
    await waitFor(() => expect(headline()).toBe('FREE Coffee With Any Order'));

    fireEvent.click(screen.getByLabelText('Previous partner'));
    fireEvent.click(screen.getByLabelText('Previous partner'));
    expect(position()).toBe('03 / 03');
    await waitFor(() => expect(headline()).toBe('₱100 Off Per Hour'));
  });

  it('rotates on its own when nobody is touching it', () => {
    vi.useFakeTimers();
    render(<PartnerCarousel partners={partners} />);
    expect(position()).toBe('01 / 03');
    act(() => { vi.advanceTimersByTime(AUTO_ADVANCE_MS); });
    expect(position()).toBe('02 / 03');
    act(() => { vi.advanceTimersByTime(AUTO_ADVANCE_MS); });
    expect(position()).toBe('03 / 03');
  });
});
