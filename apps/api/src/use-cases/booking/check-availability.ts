import type { BookingPort, AvailableModel } from '@lolas/domain';

export interface CheckAvailabilityInput {
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
}

export interface CheckAvailabilityDeps {
  bookingPort: BookingPort;
}

export async function checkAvailability(
  deps: CheckAvailabilityDeps,
  input: CheckAvailabilityInput,
): Promise<AvailableModel[]> {
  const pickup = new Date(input.pickupDatetime);
  const dropoff = new Date(input.dropoffDatetime);

  if (Number.isNaN(pickup.getTime()) || Number.isNaN(dropoff.getTime())) {
    throw new Error('Invalid pickup or dropoff datetime');
  }

  if (dropoff <= pickup) {
    throw new Error('Dropoff datetime must be after pickup datetime');
  }

  return deps.bookingPort.checkAvailability({
    storeId: input.storeId,
    pickupDatetime: input.pickupDatetime,
    dropoffDatetime: input.dropoffDatetime,
  });
}
