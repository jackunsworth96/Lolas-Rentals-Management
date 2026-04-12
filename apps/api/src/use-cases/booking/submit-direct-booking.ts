import type { BookingPort, ConfigRepository } from '@lolas/domain';
import type { SubmitDirectBookingInput } from '@lolas/shared';
import { resolveSourceFromStore } from '@lolas/shared';
import { computeQuote } from './compute-quote.js';
import { sendEmail, bookingConfirmationHtml, NOTIFICATION_EMAIL } from '../../services/email.js';
import { getSupabaseClient } from '../../adapters/supabase/client.js';

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
  let fullQuote: Awaited<ReturnType<typeof computeQuote>> | null = null;
  try {
    fullQuote = await computeQuote(
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
    webQuoteRaw = fullQuote.grandTotalWithFees ?? fullQuote.grandTotal;
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
    const sb = getSupabaseClient();

    // Look up vehicle display name
    let vehicleName = input.vehicleModelId;
    try {
      const vm = await deps.configRepo.getVehicleModelById(input.vehicleModelId);
      if (vm?.name) vehicleName = vm.name;
    } catch { /* non-critical */ }

    // Look up location display names
    let pickupLocation = 'General Luna';
    let dropoffLocation = 'General Luna';
    try {
      const { data: locs } = await sb
        .from('locations')
        .select('id, name')
        .in('id', [input.pickupLocationId, input.dropoffLocationId]);
      if (locs) {
        const locMap = new Map((locs as { id: number; name: string }[]).map((l) => [l.id, l.name]));
        pickupLocation = locMap.get(input.pickupLocationId) ?? pickupLocation;
        dropoffLocation = locMap.get(input.dropoffLocationId) ?? dropoffLocation;
      }
    } catch { /* non-critical */ }

    // Look up transfer route name if a transfer was booked
    const hasTransfer = !!(input.transferType);
    let transferRoute = input.transferRoute ?? undefined;

    // Derive payment method display label
    const pmRaw = input.webPaymentMethod ?? 'cash';
    const paymentMethod = pmRaw.charAt(0).toUpperCase() + pmRaw.slice(1);

    // Addon lines from the computed quote
    const addons = (fullQuote?.addons ?? []).map((a) => ({
      name: a.name,
      price: a.total,
    }));

    const charityDonation = input.charityDonation ?? 0;
    const transferAmount = input.transferAmount ?? 0;

    const waiverUrl = `${process.env.WEB_URL ?? 'https://lolasrentals.com'}/waiver/${orderReference}`;
    const whatsappNumber = process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX';

    // ── Customer confirmation ──────────────────────────────────────────────
    void sendEmail({
      to: input.customerEmail,
      subject: `Booking Confirmed — ${orderReference} | Lola's Rentals`,
      html: bookingConfirmationHtml({
        customerName: input.customerName,
        orderReference,
        vehicleName,
        vehicleCount: 1,
        pickupDatetime: formatManilaDateTime(input.pickupDatetime),
        dropoffDatetime: formatManilaDateTime(input.dropoffDatetime),
        pickupLocation,
        dropoffLocation,
        totalAmount: grandTotal,
        paymentMethod,
        addons,
        charityDonation,
        hasTransfer,
        transferType: input.transferType ?? undefined,
        transferRoute,
        transferAmount,
        waiverUrl,
        whatsappNumber,
      }),
    });

    // ── Staff alert ────────────────────────────────────────────────────────
    const addonsStaffHtml =
      addons.length > 0
        ? addons
            .map((a) => `<tr><td style="padding:4px 0;color:#666;font-size:13px;">Add-on</td><td style="padding:4px 0;font-size:13px;">${a.name} — ₱${a.price.toLocaleString()}</td></tr>`)
            .join('')
        : '';

    const transferStaffHtml = hasTransfer
      ? `<tr><td style="padding:4px 0;color:#666;font-size:13px;">Transfer</td><td style="padding:4px 0;font-size:13px;font-weight:700;">${
          input.transferType === 'tuktuk' ? 'Private TukTuk' : input.transferType === 'private' ? 'Private Van' : 'Shared Van'
        }${transferRoute ? ` — ${transferRoute}` : ''}</td></tr>
        ${input.flightNumber ? `<tr><td style="padding:4px 0;color:#666;font-size:13px;">Flight</td><td style="padding:4px 0;font-size:13px;">${input.flightNumber}</td></tr>` : ''}
        ${input.flightArrivalTime ? `<tr><td style="padding:4px 0;color:#666;font-size:13px;">Arrival</td><td style="padding:4px 0;font-size:13px;">${input.flightArrivalTime}</td></tr>` : ''}`
      : '';

    const charityStaffHtml =
      charityDonation > 0
        ? `<tr><td style="padding:4px 0;color:#666;font-size:13px;">Charity</td><td style="padding:4px 0;font-size:13px;color:#00577C;">₱${charityDonation.toLocaleString()} → BePawsitive</td></tr>`
        : '';

    void sendEmail({
      to: NOTIFICATION_EMAIL,
      subject: `🐾 New Booking — ${orderReference} — ${input.customerName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background: #00577C; border-radius: 10px; padding: 20px 24px; margin-bottom: 20px;">
            <h2 style="color: white; margin: 0; font-size: 20px;">🐾 New Booking Received</h2>
            <p style="color: rgba(255,255,255,0.75); margin: 4px 0 0; font-size: 13px;">${orderReference}</p>
          </div>
          <div style="background: white; border-radius: 10px; padding: 20px 24px; border: 1px solid #eee;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px; width: 130px;">Customer</td>
                <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${input.customerName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Email</td>
                <td style="padding: 6px 0; font-size: 13px;">
                  <a href="mailto:${input.customerEmail}" style="color: #00577C;">${input.customerEmail}</a>
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Mobile</td>
                <td style="padding: 6px 0; font-size: 13px;">
                  <a href="tel:${input.customerMobile ?? ''}" style="color: #00577C;">${input.customerMobile ?? '—'}</a>
                </td>
              </tr>
              <tr style="border-top: 1px solid #f0f0f0;">
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Vehicle</td>
                <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${vehicleName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Pick Up</td>
                <td style="padding: 6px 0; font-size: 13px;">${pickupLocation} — ${formatManilaDateTime(input.pickupDatetime)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Drop Off</td>
                <td style="padding: 6px 0; font-size: 13px;">${dropoffLocation} — ${formatManilaDateTime(input.dropoffDatetime)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Payment</td>
                <td style="padding: 6px 0; font-size: 13px;">${paymentMethod}</td>
              </tr>
              ${addonsStaffHtml}
              ${transferStaffHtml}
              ${charityStaffHtml}
              <tr style="border-top: 2px solid #FCBC5A;">
                <td style="padding: 12px 0 6px; color: #666; font-size: 13px;">Total</td>
                <td style="padding: 12px 0 6px; font-weight: 800; color: #00577C; font-size: 18px;">
                  ₱${grandTotal.toLocaleString()}
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 8px 0; font-size: 12px; color: #888; font-style: italic;">
                  💰 A cash security deposit is collected at pickup: ₱1,000 per scooter or ₱2,000 per TukTuk. This is fully refundable upon return.
                </td>
              </tr>
            </table>
          </div>
          <p style="margin-top: 16px; font-size: 11px; color: #bbb; text-align: center;">
            Sent automatically by Lola's Rentals platform
          </p>
        </div>
      `,
    });
  })();

  return { ...result, serverQuote: webQuoteRaw, charityDonation: input.charityDonation ?? 0 };
}
