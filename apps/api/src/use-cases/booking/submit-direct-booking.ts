import type { BookingPort, ConfigRepository } from '@lolas/domain';
import type { SubmitDirectBookingInput } from '@lolas/shared';
import { resolveSourceFromStore } from '@lolas/shared';
import { computeQuote } from './compute-quote.js';
import { sendEmail, bookingConfirmationHtml, NOTIFICATION_EMAIL } from '../../services/email.js';

function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

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

export interface SubmitDirectBookingResult {
  id: string;
  orderReference: string;
  serverQuote: number | null;
  charityDonation: number;
}

export async function submitDirectBooking(
  deps: SubmitDirectBookingDeps,
  input: SubmitDirectBookingInput,
): Promise<SubmitDirectBookingResult> {
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

  // 3b. Apply payment method surcharge to webQuoteRaw if applicable
  if (webQuoteRaw !== null && input.webPaymentMethod) {
    try {
      const paymentMethods = await deps.configRepo.getPaymentMethods();
      const pm = paymentMethods.find((m) => m.id === input.webPaymentMethod);
      if (pm && pm.surchargePercent > 0) {
        const surchargeAmount = Math.round(webQuoteRaw * (pm.surchargePercent / 100) * 100) / 100;
        webQuoteRaw = webQuoteRaw + surchargeAmount;
      }
    } catch {
      // Non-fatal: proceed with base quote if surcharge config cannot be fetched
    }
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
    charityDonation: input.charityDonation ?? 0,
    webPaymentMethod: input.webPaymentMethod ?? null,
    helmetCount: input.helmet_count ?? null,
  });

  // 6. Clean up the hold (best-effort; booking is already persisted).
  // Pass holdId when available so only the specific hold row is deleted,
  // preserving any other same-model holds in the same session.
  try {
    await bookingPort.deleteHoldBySessionAndModel(input.sessionToken, input.vehicleModelId, input.holdId);
  } catch {
    // Hold cleanup is non-critical; it will expire naturally
  }

  // 7. Fire-and-forget emails — never block the booking response.
  const grandTotal = webQuoteRaw ?? 0;
  void (async () => {
    let vehicleName = input.vehicleModelId;
    try {
      const vm = await deps.configRepo.getVehicleModelById(input.vehicleModelId);
      if (vm?.name) vehicleName = vm.name;
    } catch { /* non-critical */ }

    void sendEmail({
      to: input.customerEmail,
      subject: `Booking Confirmed — ${orderReference} | Lola's Rentals`,
      html: bookingConfirmationHtml({
        customerName: input.customerName,
        orderReference,
        vehicleName,
        pickupDatetime: formatManilaDateTime(input.pickupDatetime),
        dropoffDatetime: formatManilaDateTime(input.dropoffDatetime),
        totalAmount: grandTotal,
      }),
    });

    void sendEmail({
      to: NOTIFICATION_EMAIL,
      subject: `🐾 New Booking — ${orderReference}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; 
          margin: 0 auto; padding: 24px;">
          <h2 style="color: #00577C;">New Booking Received</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px; width: 140px;">Reference</td>
              <td style="padding: 8px 0; font-weight: 700;">
                ${orderReference}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Customer</td>
              <td style="padding: 8px 0; font-weight: 700;">
                ${input.customerName}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Email</td>
              <td style="padding: 8px 0;">
                ${input.customerEmail}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Mobile</td>
              <td style="padding: 8px 0;">
                ${input.customerMobile ?? '—'}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Vehicle</td>
              <td style="padding: 8px 0; font-weight: 700;">
                ${vehicleName}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Pick Up</td>
              <td style="padding: 8px 0;">
                ${formatManilaDateTime(input.pickupDatetime)}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Return</td>
              <td style="padding: 8px 0;">
                ${formatManilaDateTime(input.dropoffDatetime)}
              </td>
            </tr>
            <tr style="border-top: 2px solid #FCBC5A;">
              <td style="padding: 16px 0 8px; color: #666; 
                font-size: 14px;">Total</td>
              <td style="padding: 16px 0 8px; font-weight: 700; 
                color: #00577C; font-size: 18px;">
                ₱${grandTotal.toLocaleString()}
              </td>
            </tr>
          </table>
          <p style="margin-top: 24px; font-size: 12px; color: #999;">
            Sent automatically by Lola's Rentals platform
          </p>
        </div>
      `,
    });
  })();

  return { ...result, serverQuote: webQuoteRaw, charityDonation: input.charityDonation ?? 0 };
}
