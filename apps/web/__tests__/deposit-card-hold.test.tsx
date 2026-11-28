import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DepositCardHold, useDepositCardHold } from '../src/components/orders/DepositCardHold.js';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client.js', () => ({ api: mocks }));

const orderId = 'order-1';
const route = '/payments/xendit/orders/order-1/deposit-holds';
const authorized = {
  id: 'hold-1', status: 'authorized', amountPHP: 1000, capturedPHP: null,
  checkoutUrl: null, authorizationExpiresAt: null, coverage: 'unverified',
  blocking: true, canCapture: true, canRelease: true, canRefresh: true, canRecover: false, canContinueRelease: false,
};
const missingCheckout = { ...authorized, reference: 'XH-test', status: 'reconciliation_required',
  canCapture: false, canRelease: false, canRefresh: false, canRecover: true };

function TestOrder() {
  const hold = useDepositCardHold(orderId, true);
  return <>
    <DepositCardHold state={hold} due={1000} />
    {!hold.blocked && <button type="button">Manual deposit</button>}
  </>;
}

function renderOrder() {
  return render(<QueryClientProvider client={new QueryClient()}><TestOrder /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('Active Orders card hold', () => {
  it('does not show a card hold choice when disabled', async () => {
    mocks.get.mockResolvedValue({ enabled: false, hold: null });
    renderOrder();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(route));
    expect(screen.queryByRole('button', { name: /create test card hold/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Manual deposit' })).toBeTruthy();
  });

  it('creates a shareable link without sending the deposit amount from the browser', async () => {
    mocks.get.mockResolvedValueOnce({ enabled: true, hold: null });
    const result = { enabled: true, hold: {
      ...authorized, status: 'awaiting_authorization', canCapture: false,
      checkoutUrl: 'https://checkout.example.test/hold',
    } };
    mocks.post.mockResolvedValue(result);
    mocks.get.mockResolvedValue(result);
    renderOrder();
    fireEvent.click(await screen.findByRole('button', { name: /create test card hold/i }));
    expect(await screen.findByRole('link', { name: /open authorization link/i })).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledWith(route, {});
    expect(screen.queryByRole('button', { name: 'Manual deposit' })).toBeNull();
  });

  it('labels reserved funds and warns when coverage is unknown', async () => {
    mocks.get.mockResolvedValue({ enabled: true, hold: { ...authorized, canCapture: false } });
    renderOrder();
    expect(await screen.findByText(/no deposit has been collected/i)).toBeTruthy();
    expect(screen.getByText(/has not provided a verified authorization expiry/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Manual deposit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Capture funds' })).toBeNull();
  });

  it('requires a capture reason and sends an admin partial capture', async () => {
    mocks.get.mockResolvedValue({ enabled: true, hold: authorized });
    mocks.post.mockResolvedValue({ enabled: true, hold: { ...authorized, status: 'capture_pending', canCapture: false } });
    renderOrder();
    fireEvent.click(await screen.findByRole('button', { name: 'Capture funds' }));
    expect((screen.getByRole('button', { name: 'Confirm capture' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Capture reason'), { target: { value: 'Test capture' } });
    fireEvent.change(screen.getByLabelText('Amount to charge'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm capture' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(route + '/hold-1/actions', {
      action: 'capture', amountPHP: 250, reason: 'Test capture',
    }));
  });

  it('offers session attachment when new holds are paused', async () => {
    mocks.get.mockResolvedValue({ enabled: false, hold: missingCheckout });
    mocks.post.mockResolvedValue({ enabled: false, hold: { ...missingCheckout, canRecover: false, canRefresh: true } });
    renderOrder();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve missing checkout' }));
    const attach = screen.getByRole<HTMLButtonElement>('button', { name: 'Verify and attach session' });
    expect(attach.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Xendit session ID'), { target: { value: 'ps-123' } });
    fireEvent.click(attach);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(route + '/hold-1/actions', {
      action: 'recover_session', sessionId: 'ps-123',
    }));
  });

  it('requires a case ID, reason, and attestation before closing a missing checkout', async () => {
    const closed = { enabled: false, hold: { ...missingCheckout, status: 'failed', blocking: false, canRecover: false } };
    mocks.get.mockResolvedValue({ enabled: false, hold: missingCheckout });
    mocks.post.mockImplementation(async () => {
      mocks.get.mockResolvedValue(closed);
      return closed;
    });
    renderOrder();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve missing checkout' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Xendit confirmed no session' }));
    const close = screen.getByRole<HTMLButtonElement>('button', { name: 'Close missing checkout' });
    fireEvent.change(screen.getByLabelText('Xendit support case ID'), { target: { value: 'CASE-123' } });
    fireEvent.change(screen.getByLabelText('Recovery reason'), { target: { value: 'Provider confirmed no session was created' } });
    expect(close.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed written confirmation/ }));
    fireEvent.click(close);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(route + '/hold-1/actions', {
      action: 'confirm_no_session', supportCaseId: 'CASE-123', reason: 'Provider confirmed no session was created', confirmed: true,
    }));
    expect(await screen.findByRole('button', { name: 'Manual deposit' })).toBeTruthy();
  });

  it('hides recovery when the API does not offer it', async () => {
    mocks.get.mockResolvedValue({ enabled: false, hold: { ...missingCheckout, canRecover: false } });
    renderOrder();
    await screen.findByText(/finance review required:/i);
    expect(screen.queryByRole('button', { name: 'Resolve missing checkout' })).toBeNull();
  });

  it('finishes a reserved release without sending another checkout cancellation', async () => {
    const pending = { enabled: true, hold: { ...authorized, status: 'release_pending',
      canRelease: false, canCapture: false, canContinueRelease: true } };
    mocks.get.mockResolvedValue(pending);
    mocks.post.mockResolvedValue(pending);
    renderOrder();
    fireEvent.click(await screen.findByRole('button', { name: 'Finish release' }));
    expect(screen.queryByRole('button', { name: 'Release hold' })).toBeNull();
    await waitFor(() => expect(mocks.post).toHaveBeenCalledExactlyOnceWith(route + '/hold-1/actions', { action: 'continue_release' }));
  });
});
