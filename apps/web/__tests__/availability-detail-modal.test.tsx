import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../src/api/dashboard-availability.js', () => ({
  useAvailabilityDetail: () => ({
    isLoading: false,
    data: {
      models: [
        {
          modelId: 'beat', modelName: 'Honda Beat', totalUnits: 6, availableNow: 2, withSurfRack: 1, withoutSurfRack: 1,
          awaitingAssignment: 0, isScooter: true, returningToday: [],
          freeVehicles: [{ id: 'v7', name: 'Beat 07', surfRack: true }, { id: 'v9', name: 'Beat 09', surfRack: false }],
        },
        {
          modelId: 'tuktuk', modelName: 'TukTuk', totalUnits: 2, availableNow: 0, withSurfRack: 0, withoutSurfRack: 0,
          awaitingAssignment: 0, isScooter: false, returningToday: [], freeVehicles: [],
        },
      ],
    },
  }),
  useRecordTurnedAway: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('../src/api/surf-racks.js', () => ({ useSurfRackAvailability: () => ({ data: undefined }) }));

const { AvailabilityDetailModal } = await import('../src/components/dashboard/AvailabilityDetailModal.js');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
});

afterEach(cleanup);

describe('AvailabilityDetailModal', () => {
  it('names each free vehicle and books it for a walk-in when tapped', () => {
    const onBook = vi.fn();
    render(<AvailabilityDetailModal open onClose={() => {}} storeId="store-lolas" onBookVehicle={onBook} />);
    expect(screen.getByText('Beat 09')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Beat 07/ }));
    expect(onBook).toHaveBeenCalledWith('v7');
  });

  it('lists names without booking buttons for tomorrow', () => {
    render(<AvailabilityDetailModal open onClose={() => {}} storeId="store-lolas" date="2026-11-15" onBookVehicle={vi.fn()} />);
    expect(screen.getByText('Beat 07')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Beat 07/ })).toBeNull();
  });
});
