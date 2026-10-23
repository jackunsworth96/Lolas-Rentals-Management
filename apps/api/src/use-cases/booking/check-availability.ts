import type { BookingPort, AvailableModel } from '@lolas/domain';

export interface CheckAvailabilityInput {
  partnerRef?: string;
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  requestedQuantity?: number;
  excludeOrderItemId?: string;
  /** When set, active booking holds belonging to this session are excluded from the
   * count so the caller's own (soon to be released) hold doesn't block the new window. */
  excludeSessionToken?: string;
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
    partnerRef: input.partnerRef,
    storeId: input.storeId,
    pickupDatetime: input.pickupDatetime,
    dropoffDatetime: input.dropoffDatetime,
    requestedQuantity: input.requestedQuantity,
    excludeOrderItemId: input.excludeOrderItemId,
    excludeSessionToken: input.excludeSessionToken,
  });
}
