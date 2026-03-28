import type { BookingPort, HoldRow } from '@lolas/domain';

export interface CreateHoldInput {
  vehicleModelId: string;
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  sessionToken: string;
}

export interface CreateHoldDeps {
  bookingPort: BookingPort;
}

const HOLD_DURATION_MS = 10 * 60 * 1000;

export async function createHold(
  deps: CreateHoldDeps,
  input: CreateHoldInput,
): Promise<HoldRow> {
  const pickup = new Date(input.pickupDatetime);
  const dropoff = new Date(input.dropoffDatetime);

  if (Number.isNaN(pickup.getTime()) || Number.isNaN(dropoff.getTime())) {
    throw new Error('Invalid pickup or dropoff datetime');
  }
  if (dropoff <= pickup) {
    throw new Error('Dropoff datetime must be after pickup datetime');
  }

  const available = await deps.bookingPort.checkAvailability({
    storeId: input.storeId,
    pickupDatetime: input.pickupDatetime,
    dropoffDatetime: input.dropoffDatetime,
  });

  const match = available.find((m) => m.modelId === input.vehicleModelId);
  if (!match || match.availableCount < 1) {
    const err = new Error(
      `Vehicle model "${input.vehicleModelId}" is not available for the selected dates`,
    );
    (err as Error & { statusCode: number }).statusCode = 409;
    throw err;
  }

  const expiresAt = new Date(Date.now() + HOLD_DURATION_MS).toISOString();

  return deps.bookingPort.insertHold({
    vehicleModelId: input.vehicleModelId,
    storeId: input.storeId,
    pickupDatetime: input.pickupDatetime,
    dropoffDatetime: input.dropoffDatetime,
    sessionToken: input.sessionToken,
    expiresAt,
  });
}
