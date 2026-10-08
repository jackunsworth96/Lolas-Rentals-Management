// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client.js', () => ({
  api: { get: mocks.get, post: mocks.post },
  ApiError: class ApiError extends Error {},
}));
vi.mock('../src/api/orders.js', () => ({
  useCancelActivatedOrder: () => ({ reset: vi.fn(), mutate: vi.fn(), isPending: false, error: null }),
}));
vi.mock('../src/stores/auth-store.js', () => ({
  useAuthStore: (select: (state: { user: { roleId: string } }) => unknown) => select({ user: { roleId: 'role-admin' } }),
}));
vi.mock('../src/components/common/Modal.js', () => ({
  Modal: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
}));

import { CancelActivatedOrderModal } from '../src/components/orders/CancelActivatedOrderModal.js';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('online-paid cancellation decision', () => {
  it('carries an existing pending refund forward instead of describing it as a new charge', async () => {
    mocks.get.mockResolvedValue([{
      source_payment_id: 'deposit-1', amount_php: 600,
      kind: 'deposit', status: 'pending',
    }]);
    render(<CancelActivatedOrderModal open onClose={vi.fn()} orderId="order-1"
      orderReference="LR-TEST" customerName="Customer" vehicleNames="Beat"
      recordedPaymentTotal={500} onCancelled={vi.fn()} payments={[{
        id: 'rental-1', paymentType: 'card_xendit', paymentMethodId: 'xendit',
        amount: 500, transactionDate: '2026-10-08',
      }, {
        id: 'deposit-1', paymentType: 'deposit', paymentMethodId: 'xendit',
        amount: 1000, transactionDate: '2026-10-08',
      }]} />);
    expect(await screen.findByText(/Deposit refund already pending: ₱600.00/)).toBeTruthy();
    expect(screen.getByText(/Document charge for ₱400.00/)).toBeTruthy();
  });
});
