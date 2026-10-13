// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ link: vi.fn(), email: vi.fn(), cancel: vi.fn(), generate: vi.fn() }));
vi.mock('../src/components/common/Modal.js', () => ({ Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../src/api/transfers.js', () => ({
  useRecordTransferPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTransferPaymentLink: mocks.link,
  generateTransferPaymentLink: mocks.generate,
  emailTransferPaymentLink: mocks.email,
  cancelTransferPaymentLink: mocks.cancel,
  moneyAmount: (value: { amount: number }) => value.amount,
}));
vi.mock('../src/api/config.js', () => ({ usePaymentMethods: () => ({ data: [] }), useChartOfAccounts: () => ({ data: [] }) }));
vi.mock('../src/hooks/use-payment-routing.js', () => ({ usePaymentRouting: () => ({ getReceivedInto: () => null }) }));

import { TransferPaymentModal } from '../src/components/transfers/TransferPaymentModal.js';
import type { TransferRow } from '../src/api/transfers.js';

const transfer = { id: 'TRF-1', customerName: 'Guest', customerEmail: 'guest@example.test',
  route: 'Airport', serviceDate: '2026-10-14', totalPrice: { amount: 500 }, paymentStatus: 'Pending' } as TransferRow;

function mount() {
  render(<QueryClientProvider client={new QueryClient()}><TransferPaymentModal open onClose={() => {}}
    transfer={transfer} storeId="store-lolas" /></QueryClientProvider>);
}

describe('transfer card payment link controls', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.email.mockResolvedValue({ accepted: true }); mocks.cancel.mockResolvedValue({ status: 'cancelled' }); });
  afterEach(() => cleanup());

  it('offers email and cancellation for an active link while blocking manual collection', async () => {
    mocks.link.mockReturnValue({ data: { principalPHP: 500, surchargePHP: 15, amountPHP: 515,
      session: { sessionId: 'session-1', status: 'active', checkoutUrl: 'https://checkout.example.test/1',
        expiresAt: '2099-01-01T00:00:00Z', emailAcceptedAt: null } } });
    mount();
    expect(screen.getByText(/Manual collection is blocked/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record Payment' }).matches(':disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Email customer' }));
    await waitFor(() => expect(mocks.email).toHaveBeenCalledWith('TRF-1', 'session-1', false));
  });

  it('shows paid state without another payable link', () => {
    mocks.link.mockReturnValue({ data: { principalPHP: 500, surchargePHP: 15, amountPHP: 515,
      session: { sessionId: 'session-1', status: 'completed', checkoutUrl: null,
        expiresAt: null, emailAcceptedAt: null } } });
    mount();
    expect(screen.getByText('Paid online')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generate payment link' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Record Payment' }).matches(':disabled')).toBe(true);
  });
});
