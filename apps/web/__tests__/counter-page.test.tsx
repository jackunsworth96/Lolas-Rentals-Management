import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('../src/api/counter.js', () => ({
  useCounterOptions: (days: number) => ({
    data: {
      storeId: 'store-lolas', rentalDays: days,
      pickupDatetime: '2026-11-18T01:30:00.000Z', dropoffDatetime: '2026-11-20T01:30:00.000Z',
      models: [{ modelId: 'beat', modelName: 'Honda Beat', availableCount: 2, dailyRate: 500, total: 500 * days, securityDeposit: 1000 }],
    },
    isLoading: false, error: null, refetch: vi.fn(),
  }),
  useCreateCounterBooking: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));
vi.mock('../src/utils/vehicle-images.js', () => ({ useVehiclePublicId: () => null }));
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
  it('books a walk-in for the chosen days and hands the customer to the waiver', async () => {
    mocks.mutateAsync.mockResolvedValue({ orderReference: 'LR-1118-ABCD' });
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
    fireEvent.click(screen.getByText('Choose your bike'));
    fireEvent.click(screen.getByText('Honda Beat'));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Robin Lenoble' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'robin@example.com' } });
    fireEvent.change(screen.getByLabelText('WhatsApp number'), { target: { value: '+33626558584' } });
    fireEvent.click(screen.getByText('Continue to waiver'));

    await waitFor(() => expect(screen.getByText('Waiver /waiver/LR-1118-ABCD?counter=1 for +33626558584')).toBeTruthy());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      vehicleModelId: 'beat', days: 2, customerName: 'Robin Lenoble', customerEmail: 'robin@example.com', customerMobile: '+33626558584',
    });
  });

  it('treats only a login with nothing but the counter permission as the tablet', () => {
    expect(isCounterOnlyUser({ permissions: ['can_use_counter'] })).toBe(true);
    expect(isCounterOnlyUser({ permissions: ['can_use_counter', 'can_view_inbox'] })).toBe(false);
    expect(isCounterOnlyUser({ permissions: [] })).toBe(false);
  });
});
