// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), roleId: 'role-admin' }));
vi.mock('../src/api/client.js', () => ({
  api: { get: mocks.get, post: mocks.post },
  ApiError: class ApiError extends Error {},
}));
vi.mock('../src/api/config.js', () => ({
  useChartOfAccounts: () => ({ data: [{ id: 'income-1', name: 'Rental Income',
    accountType: 'Income', storeId: 'store-lolas', isActive: true }] }),
}));
vi.mock('../src/stores/auth-store.js', () => ({
  useAuthStore: (select: (state: { user: { roleId: string } }) => unknown) => select({ user: { roleId: mocks.roleId } }),
}));

import { XenditRefundPanel } from '../src/components/orders/XenditRefundPanel.js';

function mount() {
  return render(<QueryClientProvider client={new QueryClient()}>
    <XenditRefundPanel orderId="order-1" storeId="store-lolas" payments={[{
      id: 'PAY-XENDIT-1', transactionDate: '2026-10-08', amount: 1000,
      paymentMethodId: 'xendit', paymentType: 'deposit',
    }]} />
  </QueryClientProvider>);
}

describe('Xendit refund and deposit charge controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.roleId = 'role-admin';
    mocks.get.mockImplementation(async (path: string) => path.endsWith('/refunds') ? [] : {
      deposit_charge_php: 400,
      deposit_charge_reason: 'Documented vehicle damage',
      deposit_charge_status: 'pending_finance_review',
    });
    mocks.post.mockResolvedValue({ status: 'resolved', amountPHP: 400 });
  });
  afterEach(() => cleanup());

  it('shows an unresolved liability and lets an administrator apply the documented charge', async () => {
    mount();
    expect(await screen.findByText(/Deposit remains held pending finance resolution/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Deposit charge income account'), { target: { value: 'income-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply documented charge' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      '/payments/xendit/orders/order-1/resolve-deposit-charge', { incomeAccountId: 'income-1' },
    ));
  });

  it('does not expose the finance resolution action to non-admin staff', async () => {
    mocks.roleId = 'role-staff';
    mount();
    expect(await screen.findByText(/Deposit remains held pending finance resolution/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apply documented charge' })).toBeNull();
  });
});
