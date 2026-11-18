import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  token: 'kiosk-token' as string | null,
  brand: { data: undefined as unknown, isLoading: false, error: null as unknown },
  exit: vi.fn(),
  kioskProps: null as Record<string, unknown> | null,
}));

vi.mock('../src/api/partner-kiosk.js', () => ({
  partnerKioskCounterApi: { key: 'partner-kiosk' },
  usePartnerKioskStore: (select: (s: { token: string | null }) => unknown) => select({ token: mocks.token }),
  usePartnerKioskBrand: () => mocks.brand,
  exitPartnerKiosk: mocks.exit,
}));
vi.mock('../src/pages/counter/CounterKiosk.js', () => ({
  CounterKiosk: (props: Record<string, unknown> & { brand: { partnerName: string }; onLogoHold: () => void }) => {
    mocks.kioskProps = props;
    return <button type="button" onClick={props.onLogoHold}>Kiosk for {props.brand.partnerName}</button>;
  },
}));

const { default: PartnerKioskPage } = await import('../src/pages/partner/PartnerKioskPage.js');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/partner/kiosk']}>
      <Routes>
        <Route path="/partner/kiosk" element={<PartnerKioskPage />} />
        <Route path="/partner/dashboard" element={<div>Partner dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('partner counter tablet page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token = 'kiosk-token';
    mocks.brand = {
      data: { partnerName: 'Harana Surf Resort', logoUrl: 'https://cdn/harana.png', welcomeMessage: null, deliveryAreas: null },
      isLoading: false,
      error: null,
    };
  });

  it('sends a device without a tablet sign-in back to the portal', () => {
    mocks.token = null;
    renderPage();
    expect(screen.getByText('Partner dashboard')).toBeTruthy();
  });

  it('runs the booking kiosk for the partner: scheduled, co-branded, returning here after the waiver', () => {
    renderPage();
    expect(screen.getByText('Kiosk for Harana Surf Resort')).toBeTruthy();
    expect(mocks.kioskProps).toEqual(expect.objectContaining({
      counter: { key: 'partner-kiosk' },
      mode: 'scheduled',
      homePath: '/partner/kiosk',
      brand: { partnerName: 'Harana Surf Resort', logoUrl: 'https://cdn/harana.png', welcomeMessage: undefined },
    }));
  });

  it('only closes with a staff PIN', async () => {
    mocks.exit.mockRejectedValueOnce(new Error('That PIN is not right.')).mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(screen.getByText('Kiosk for Harana Surf Resort'));

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '0000' } });
    fireEvent.click(screen.getByText('Close tablet'));
    await waitFor(() => expect(screen.getByText('That PIN is not right.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '2468' } });
    fireEvent.click(screen.getByText('Close tablet'));
    await waitFor(() => expect(screen.getByText('Partner dashboard')).toBeTruthy());
    expect(mocks.exit).toHaveBeenLastCalledWith('2468');
  });

  it('lets guests choose their area when the property area is not set', () => {
    const areas = [{ id: 2, name: 'General Luna', fee: 100 }];
    mocks.brand = { data: { partnerName: 'Harana Surf Resort', logoUrl: null, welcomeMessage: null, deliveryAreas: areas }, isLoading: false, error: null };
    renderPage();
    expect(mocks.kioskProps).toEqual(expect.objectContaining({ deliveryAreas: areas }));
  });
});
