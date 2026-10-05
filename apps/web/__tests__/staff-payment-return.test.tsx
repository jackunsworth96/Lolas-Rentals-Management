import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ status: 'active', error: false }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { status: state.status }, error: state.error ? new Error('unverified') : null }),
}));
vi.mock('../src/components/layout/PageLayout.js', () => ({
  PageLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../src/components/seo/SEO.js', () => ({ SEO: () => null }));

import StaffPaymentReturnPage from '../src/pages/payment/StaffPaymentReturnPage.js';

function renderReturn(search = '?paymentSession=11111111-1111-4111-8111-111111111111&paymentState=signed') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/book/payment-return/LR-TEST${search}`]}>
      <Routes><Route path="/book/payment-return/:reference" element={<StaffPaymentReturnPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('staff payment return page', () => {
  beforeEach(() => { state.status = 'active'; state.error = false; });

  it('does not call an active checkout paid', () => {
    expect(renderReturn()).toContain('Payment processing');
    expect(renderReturn()).not.toContain('Payment confirmed');
  });

  it('shows payment only after the status endpoint reports completion', () => {
    state.status = 'completed';
    expect(renderReturn()).toContain('Payment confirmed');
  });

  it('uses neutral verification messaging for reconciliation or a missing token', () => {
    state.status = 'reconciliation_required';
    expect(renderReturn()).toContain('Payment is being verified');
    state.status = 'active';
    expect(renderReturn('')).toContain('Payment is being verified');
  });
});
