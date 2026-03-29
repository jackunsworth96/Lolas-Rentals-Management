import type { BookingPort, DirectBookingResult, ConfigRepository } from '@lolas/domain';
import type { SubmitDirectBookingInput } from '@lolas/shared';
import { resolveSourceFromStore } from '@lolas/shared';
import { computeQuote } from './compute-quote.js';

export interface SubmitDirectBookingDeps {
  bookingPort: BookingPort;
  configRepo: ConfigRepository;
}

function generateOrderReference(source: string): string {
  const prefix = source === 'bass' ? 'BB' : 'LR';
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hex = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
  return `${prefix}-${m}${d}-${hex}`;
}

const MAX_REF_RETRIES = 5;

async function uniqueOrderReference(bookingPort: BookingPort, source: string): Promise<string> {
  for (let i = 0; i < MAX_REF_RETRIES; i++) {
    const ref = generateOrderReference(source);
    const unique = await bookingPort.isOrderReferenceUnique(ref);
    if (unique) return ref;
  }
  throw new Error('Failed to generate a unique order reference after multiple attempts');
}

function httpError(message: string, statusCode: number): Error {
  const err = new Error(message);
  (err as Error & { statusCode: number }).statusCode = statusCode;
  return err;
}

export async function submitDirectBooking(
  deps: SubmitDirectBookingDeps,
  input: SubmitDirectBookingInput,
): Promise<DirectBookingResult> {
  const { bookingPort } = deps;

  // 1. Verify an active, non-expired hold exists for this session + model + dates
  const hold = await bookingPort.findActiveHold(
    input.sessionToken,
    input.vehicleModelId,
    input.pickupDatetime,
    input.dropoffDatetime,
  );

  if (!hold) {
    throw httpError(
      'No active hold found for this session and vehicle. Your hold may have expired — please restart your booking.',
      409,
    );
  }

  // 2. Re-run availability as a final race-condition guard
  const available = await bookingPort.checkAvailability({
    storeId: input.storeId,
    pickupDatetime: input.pickupDatetime,
    dropoffDatetime: input.dropoffDatetime,
  });

  const match = available.find((m) => m.modelId === input.vehicleModelId);
  if (!match || match.availableCount < 1) {
    throw httpError(
      'This vehicle model is no longer available for the selected dates. Please choose different dates or another vehicle.',
      409,
    );
  }

  // 3. Compute quote so the total is persisted with the order
  let webQuoteRaw: number | null = null;
  try {
    const quote = await computeQuote(
      { configRepo: deps.configRepo },
      {
        storeId: input.storeId,
        vehicleModelId: input.vehicleModelId,
        pickupDatetime: input.pickupDatetime,
        dropoffDatetime: input.dropoffDatetime,
        pickupLocationId: input.pickupLocationId,
        dropoffLocationId: input.dropoffLocationId,
        addonIds: input.addonIds && input.addonIds.length > 0 ? input.addonIds : undefined,
      },
    );
    webQuoteRaw = quote.grandTotal;
  } catch {
    // Non-fatal: booking still proceeds even if quote computation fails
  }

  // 4. Generate a unique order reference
  const source = resolveSourceFromStore(input.storeId);
  const orderReference = await uniqueOrderReference(bookingPort, source);

  // 5. Insert into orders_raw
  const result = await bookingPort.insertDirectBooking({
    source,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerMobile: input.customerMobile,
    vehicleModelId: input.vehicleModelId,
    pickupDatetime: input.pickupDatetime,
    dropoffDatetime: input.dropoffDatetime,
    pickupLocationId: input.pickupLocationId,
    dropoffLocationId: input.dropoffLocationId,
    storeId: input.storeId,
    orderReference,
    addonIds: input.addonIds && input.addonIds.length > 0 ? input.addonIds : null,
    transferType: input.transferType ?? null,
    flightNumber: input.flightNumber ?? null,
    flightArrivalTime: input.flightArrivalTime ?? null,
    transferRoute: input.transferRoute ?? null,
    webQuoteRaw,
  });

  // 6. Clean up the hold (best-effort; booking is already persisted)
  try {
    await bookingPort.deleteHoldBySessionAndModel(input.sessionToken, input.vehicleModelId);
  } catch {
    // Hold cleanup is non-critical; it will expire naturally
  }

  return result;
}
