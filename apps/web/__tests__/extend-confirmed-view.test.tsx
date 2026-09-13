import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key === 'extend.settleBalance' ? `Settle ${String(values?.amount ?? '')}` : key,
  }),
}));

vi.mock('../src/components/layout/PageLayout.js', () => ({
  PageLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  };
});

import { ConfirmedView } from '../src/pages/extend/ExtendPage.js';

function renderConfirmedView(balance: number): string {
  return renderToStaticMarkup(
    <ConfirmedView
      dropoff="2026-09-15T16:45:00+08:00"
      balance={balance}
      paymentUrl="/book/extend/pay?ref=LR-TEST"
      orderRef="LR-TEST"
    />,
  );
}

describe('ConfirmedView', () => {
  it('renders a positive extension balance and payment link without throwing', () => {
    const markup = renderConfirmedView(1234.5);

    expect(markup).toContain('Settle ₱1,234.50');
    expect(markup).toContain('href="/book/extend/pay?ref=LR-TEST"');
    expect(markup).toContain('View payment page');
  });

  it('does not render payment-required actions for a zero balance', () => {
    const markup = renderConfirmedView(0);

    expect(markup).not.toContain('extend.actionRequired');
    expect(markup).not.toContain('View payment page');
  });
});
