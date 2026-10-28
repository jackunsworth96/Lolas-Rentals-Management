import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RawOrder } from '../src/api/orders-raw.js';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), empty: [] as unknown[],
  addons: [] as Array<Record<string, unknown>>,
  fleet: [
    { id: 'free', name: 'Free bike', modelId: 'beat', status: 'Available' },
    { id: 'busy', name: 'Busy bike', modelId: 'beat', status: 'Rented' },
  ],
}));
vi.mock('../src/api/client.js', () => ({ api: { get: mocks.get } }));
vi.mock('../src/api/fleet.js', async (original) => ({
  ...await original<typeof import('../src/api/fleet.js')>(), useFleet: () => ({ data: mocks.fleet }),
}));
vi.mock('../src/api/config.js', () => {
  const empty = () => ({ data: mocks.empty });
  return {
    useAddons: () => ({ data: mocks.addons }),
    useLocations: empty,
    useChartOfAccounts: empty,
    useStorePricing: empty,
    usePaymentMethods: empty,
    useVehicleModels: empty,
  };
});
vi.mock('../src/api/orders-raw.js', () => ({
  useProcessRawOrder: () => ({ mutate: vi.fn(), isPending: false }),
  useCollectPayment: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../src/hooks/use-payment-routing.js', () => ({
  usePaymentRouting: () => ({ getReceivedInto: () => null, resolveDepositLiability: () => null }),
}));
vi.mock('../src/stores/auth-store.js', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { username: 'Staff' }, hasPermission: () => true }),
}));
vi.mock('../src/components/common/Modal.js', () => ({ Modal: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../src/components/orders/InspectionModal.js', () => ({ InspectionModal: () => null }));
const { BookingModal } = await import('../src/components/orders/BookingModal.js');
const rawOrder = {
  id: 'own-reservation', source: 'lolas', booking_channel: 'direct', customer_name: 'Guest',
  pickup_datetime: '2026-11-01T09:00:00+08:00', dropoff_datetime: '2026-11-03T09:00:00+08:00',
} as RawOrder;

function showModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  render(<QueryClientProvider client={client}><BookingModal open onClose={() => {}} rawOrder={rawOrder} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  return client;
}

describe('direct booking review', () => {
  beforeEach(() => {
    mocks.addons = [
      { id: 4, name: 'Phone Holder' },
      { id: 9, name: '9PM Return' },
      { id: 2, name: 'Full Insurance' },
    ];
  });
  afterEach(cleanup);

  it('lists the add-ons the customer requested', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
    render(
      <QueryClientProvider client={client}>
        <BookingModal
          open
          onClose={() => {}}
          rawOrder={{ ...rawOrder, addon_ids: [9, 2, 4, 9] }}
        />
      </QueryClientProvider>,
    );

    const names = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(names).toEqual(['9PM Return', 'Full Insurance', 'Phone Holder']);
  });
});

describe('date-aware inbox assignment', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.get.mockResolvedValue([mocks.fleet[0]]);
    mocks.addons = [];
  });
  afterEach(cleanup);

  it('shows server-verified vehicles and excludes its own reservation from the lookup', async () => {
    showModal();
    await screen.findByRole('option', { name: 'Free bike' });
    expect(screen.queryByRole('option', { name: 'Busy bike' })).toBeNull();
    expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('excludeRawOrderId=own-reservation'));
    expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('pickupDatetime=2026-11-01T09%3A00%3A00%2B08%3A00'));
  });

  it('clears an assignment that conflicts after the return date changes', async () => {
    showModal();
    await screen.findByRole('option', { name: 'Free bike' });
    fireEvent.change(screen.getByLabelText('Vehicle 1'), { target: { value: 'free' } });
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false);
    mocks.get.mockResolvedValue([mocks.fleet[1]]);
    fireEvent.change(screen.getByLabelText('Vehicle 1 return date'), { target: { value: '2026-11-04' } });
    await waitFor(() => expect((screen.getByLabelText('Vehicle 1') as HTMLSelectElement).value).toBe(''));
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.get).toHaveBeenLastCalledWith(expect.stringContaining('dropoffDatetime=2026-11-04T09%3A00%3A00%2B08%3A00'));
  });

  it('blocks assignment on lookup failure and allows a retry', async () => {
    mocks.get.mockRejectedValue(new Error('Unavailable'));
    showModal();
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect((screen.getByLabelText('Vehicle 1') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('option', { name: 'Free bike' })).toBeNull();
    mocks.get.mockResolvedValue([mocks.fleet[0]]);
    fireEvent.click(retry);
    await screen.findByRole('option', { name: 'Free bike' });
  });
});
