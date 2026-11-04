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
  /** When true, include models that are active but hidden from the public customer
   * site (`show_on_customer_website = false`). Extension flows for an existing
   * booking must always pass this — the vehicle is already committed to that
   * customer regardless of public site visibility — while new-booking flows should
   * omit it so hidden models stay out of public availability counts. */
  includeHiddenFromWebsite?: boolean;
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

  return deps.bookingPort.checkAvailability(
    {
      partnerRef: input.partnerRef,
      storeId: input.storeId,
      pickupDatetime: input.pickupDatetime,
      dropoffDatetime: input.dropoffDatetime,
      requestedQuantity: input.requestedQuantity,
      excludeOrderItemId: input.excludeOrderItemId,
      excludeSessionToken: input.excludeSessionToken,
    },
    { includeHiddenFromWebsite: input.includeHiddenFromWebsite },
  );
}
