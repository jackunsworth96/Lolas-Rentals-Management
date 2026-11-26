import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), hold: vi.fn(), release: vi.fn() }));

vi.mock('../src/api/counter.js', () => ({
  staffCounterApi: { key: 'staff' },
  useCounterOptions: (_counter: unknown, { days }: { days: number }) => ({
    data: {
      storeId: 'store-lolas', rentalDays: days,
      pickupDatetime: '2026-11-18T01:30:00.000Z', dropoffDatetime: '2026-11-20T01:30:00.000Z',
      models: [
        { modelId: 'beat', modelName: 'Honda Beat', availableCount: 2, nextFreePickup: null, dailyRate: 500, rentalSubtotal: 500 * days, rentalDiscount: 0, deliveryFee: 0, total: 500 * days, securityDeposit: 1000 },
        { modelId: 'tuktuk', modelName: 'TukTuk', availableCount: 0, nextFreePickup: '2026-11-21T01:15:00.000Z', dailyRate: 1500, rentalSubtotal: 1500 * days, rentalDiscount: 0, deliveryFee: 0, total: 1500 * days, securityDeposit: 3000 },
      ],
    },
    isLoading: false, error: null, refetch: vi.fn(),
  }),
  useCounterExtras: () => ({
    data: {
      addons: [
        { id: 1, name: 'Peace of Mind Cover (Scooter)', kind: 'peace_of_mind', addonType: 'per_day', unitPrice: 95, total: 190, soldOut: false },
        { id: 7, name: 'Surf Rack', kind: 'surf_rack', addonType: 'one_time', unitPrice: 250, total: 250, soldOut: false },
        { id: 4, name: 'Bungee Cord', kind: 'bungee', addonType: 'one_time', unitPrice: 25, total: 25, soldOut: false },
        // A kind this build does not know yet (API deployed ahead of the web app) must not crash the kiosk.
        { id: 99, name: 'Brand New Extra', kind: 'not_yet_known', addonType: 'one_time', unitPrice: 50, total: 50, soldOut: false },
      ],
      collectionAreas: [{ id: 2, name: 'General Luna', fee: 100 }, { id: 7, name: 'Santa Fe', fee: 200 }],
    },
    isLoading: false,
  }),
  useCreateCounterBooking: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
  usePrefetchCounterExtras: () => () => {},
  holdCounterVehicle: mocks.hold,
  releaseCounterVehicle: mocks.release,
}));
vi.mock('../src/api/paw-card-establishments.js', () => ({
  usePublicEstablishments: () => ({ data: [], isLoading: false, error: null }),
}));
globalThis.IntersectionObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;
vi.mock('../src/utils/vehicle-images.js', () => ({ useVehiclePublicId: () => null }));
vi.mock('../src/hooks/useLiveCustomerCount.js', () => ({ useLiveCustomerCount: () => 6300 }));
vi.mock('../src/components/common/WhatsAppNumberInput.js', () => ({
  WhatsAppNumberInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="WhatsApp number" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  whatsAppNumberError: (v: string) => (v ? null : 'WhatsApp number is required'),
}));

const { default: CounterPage } = await import('../src/pages/counter/CounterPage.js');
const { isCounterOnlyUser } = await import('../src/stores/auth-store.js');

function WaiverStub() {
  const location = useLocation();
  return <div>Waiver {location.pathname}{location.search} for {(location.state as { mobile: string }).mobile}</div>;
}

afterEach(cleanup);

describe('counter tablet page', () => {
  it('holds the vehicle, upsells extras and hands the customer to the waiver', async () => {
    mocks.mutateAsync.mockResolvedValue({ orderReference: 'LR-1118-ABCD' });
    mocks.hold.mockResolvedValue({ holdId: 'hold-1', expiresAt: '2026-11-18T01:40:00.000Z' });
    render(
      <MemoryRouter initialEntries={['/counter']}>
        <Routes>
          <Route path="/counter" element={<CounterPage />} />
          <Route path="/waiver/:ref" element={<WaiverStub />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Start booking'));
    fireEvent.click(screen.getByText('2 days'));
    expect(screen.getByText('Friday 20 November at 9:30 AM')).toBeTruthy();
    fireEvent.click(screen.getByText('Choose your vehicle'));

    const tuktuk = screen.getByText('TukTuk').closest('button')!;
    expect(tuktuk.disabled).toBe(true);
    expect(tuktuk.textContent).toContain('Fully booked');
    expect(tuktuk.textContent).toContain('Sat 21 Nov, 9:15 AM');

    fireEvent.click(screen.getByText('Honda Beat'));
    await waitFor(() => expect(screen.getByText('Customer favourite', { exact: false })).toBeTruthy());
    expect(mocks.hold).toHaveBeenCalledWith({ key: 'staff' }, expect.objectContaining({ modelId: 'beat', days: 2, sessionToken: expect.stringMatching(/^counter-/) }));

    fireEvent.click(screen.getByText("See what's covered"));
    expect(screen.getByText('✗ Not covered')).toBeTruthy();
    expect(screen.queryByText('View full details')).toBeNull();
    fireEvent.click(screen.getByText('Close'));
    expect(screen.getByText('Add Peace of Mind')).toBeTruthy();

    fireEvent.click(screen.getByText('Add Peace of Mind'));
    fireEvent.click(screen.getByText("We'll collect it from you", { exact: false }));
    fireEvent.click(screen.getByText('Santa Fe', { exact: false }));
    fireEvent.click(screen.getByText('Continue'));

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Robin Lenoble' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'robin@example.com' } });
    fireEvent.change(screen.getByLabelText('WhatsApp number'), { target: { value: '+33626558584' } });
    fireEvent.click(screen.getByText('Continue to waiver'));

    await waitFor(() => expect(screen.getByText('Waiver /waiver/LR-1118-ABCD?counter=1&home=%2Fcounter for +33626558584')).toBeTruthy());
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      vehicleModelId: 'beat', days: 2, customerName: 'Robin Lenoble', customerEmail: 'robin@example.com', customerMobile: '+33626558584',
      addonIds: [1], collectionLocationId: 7, holdId: 'hold-1', sessionToken: expect.stringMatching(/^counter-/),
    }));
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('treats only a login with nothing but the counter permission as the tablet', () => {
    expect(isCounterOnlyUser({ permissions: ['can_use_counter'] })).toBe(true);
    expect(isCounterOnlyUser({ permissions: ['can_use_counter', 'can_view_inbox'] })).toBe(false);
    expect(isCounterOnlyUser({ permissions: [] })).toBe(false);
  });
});
