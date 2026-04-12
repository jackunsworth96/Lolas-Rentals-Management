// Required env vars:
// RESEND_API_KEY            — from resend.com dashboard
// NOTIFICATION_EMAIL        — where to send internal staff alerts
// NOTIFICATION_EMAIL_FROM   — verified sender domain
//   (e.g. noreply@lolasrentals.com)
//   Must be a verified domain in Resend dashboard,
//   or use onboarding@resend.dev for testing
// WHATSAPP_NUMBER           — E.164 digits only, no +, e.g. 639XXXXXXXXX
// WEB_URL                   — public web root, e.g. https://lolasrentals.com

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_EMAIL =
  process.env.NOTIFICATION_EMAIL_FROM ?? 'noreply@lolasrentals.com';

export const NOTIFICATION_EMAIL =
  process.env.NOTIFICATION_EMAIL ?? 'jack@lolasrentals.com';

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email:', subject);
    return;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, ''),
    });
    console.log('Email sent:', subject, '→', to);
  } catch (err) {
    console.error('Email send failed:', err);
    // Don't throw — email failure should never break the main flow
  }
}

export function bookingConfirmationHtml({
  customerName,
  orderReference,
  vehicleName,
  vehicleCount,
  pickupDatetime,
  dropoffDatetime,
  pickupLocation,
  dropoffLocation,
  totalAmount,
  paymentMethod,
  depositAmount,
  addons,
  charityDonation,
  hasTransfer,
  transferType,
  transferRoute,
  waiverUrl,
  whatsappNumber,
}: {
  customerName: string;
  orderReference: string;
  vehicleName: string;
  vehicleCount: number;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocation: string;
  dropoffLocation: string;
  totalAmount: number;
  paymentMethod: string;
  depositAmount: number;
  addons: Array<{ name: string; price: number }>;
  charityDonation: number;
  hasTransfer: boolean;
  transferType?: string;
  transferRoute?: string;
  waiverUrl: string;
  whatsappNumber: string;
}): string {
  const vehicleLabel =
    vehicleCount > 1 ? `${vehicleName} × ${vehicleCount}` : vehicleName;

  const transferTypeLabel =
    transferType === 'tuktuk'
      ? 'Private TukTuk'
      : transferType === 'private'
        ? 'Private Van'
        : 'Shared Van';

  const addonsHtml =
    addons.length > 0
      ? `
        <div style="background: #f5f5f5; border-radius: 10px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #363737; text-transform: uppercase; letter-spacing: 0.05em;">What's included:</p>
          ${addons
            .map(
              (a) =>
                `<p style="margin: 4px 0; font-size: 14px; color: #363737;">✓ ${a.name} — ₱${a.price.toLocaleString()}</p>`,
            )
            .join('')}
        </div>`
      : '';

  const charityHtml =
    charityDonation > 0
      ? `<p style="font-size: 13px; color: #00577C; font-style: italic; margin: 8px 0 16px;">
          🐾 ₱${charityDonation.toLocaleString()} will be donated to BePawsitive — thank you for giving back to Siargao's street animals!
        </p>`
      : '';

  const transferHtml = hasTransfer
    ? `
      <div style="background: #FCBC5A; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 12px; font-size: 16px; font-weight: 700; color: #363737;">🚐 Your Transfer is Booked</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
          <tr>
            <td style="padding: 4px 0; color: #363737; font-size: 13px; width: 80px;">Route</td>
            <td style="padding: 4px 0; font-weight: 700; color: #363737; font-size: 13px;">${transferRoute ?? 'Airport Transfer'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #363737; font-size: 13px;">Type</td>
            <td style="padding: 4px 0; font-weight: 700; color: #363737; font-size: 13px;">${transferTypeLabel}</td>
          </tr>
        </table>
        <p style="margin: 0 0 8px; font-size: 13px; color: #363737; line-height: 1.6;">
          Your driver will be waiting at the airport arrivals area holding a sign with your name on it.
          Please be aware that other drivers may approach you — always confirm your name is on their list before getting in.
        </p>
        <p style="margin: 0 0 8px; font-size: 13px; color: #363737; line-height: 1.6;">
          ⚠️ <strong>Important:</strong> If you board the wrong vehicle, you will be charged for both transfers — so take a moment to verify before you go!
        </p>
        <p style="margin: 0 0 8px; font-size: 13px; color: #363737; line-height: 1.6;">
          ✅ No payment needed on arrival — we've already settled this for you, so you have one less thing to worry about.
        </p>
        <p style="margin: 0; font-size: 13px; color: #363737; line-height: 1.6;">
          Please WhatsApp us your flight number and estimated arrival time so we can track your flight and ensure your driver is ready and waiting.
        </p>
      </div>`
    : '';

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #FAF6F0;">

      <!-- Header -->
      <div style="background: #00577C; padding: 36px 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
          Lola's Rentals
        </h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">
          Siargao Island's Premium Scooter Rental
        </p>
      </div>

      <!-- Body -->
      <div style="padding: 32px;">

        <!-- Greeting -->
        <h2 style="color: #363737; margin: 0 0 8px; font-size: 22px;">
          Hi ${customerName}! 🐾
        </h2>
        <p style="color: #363737; line-height: 1.6; margin: 0 0 24px; font-size: 15px;">
          Your booking is confirmed — we can't wait to see you on the island!
        </p>

        <!-- Booking details card -->
        <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px; width: 150px;">Order Reference</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${orderReference}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Vehicle</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${vehicleLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Pick Up</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${pickupLocation} — ${pickupDatetime}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Drop Off</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${dropoffLocation} — ${dropoffDatetime}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Payment</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${paymentMethod}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Security Deposit</td>
              <td style="padding: 8px 0; color: #363737; font-size: 14px;">₱${depositAmount.toLocaleString()} — collected at pickup</td>
            </tr>
            <tr style="border-top: 2px solid #eee;">
              <td style="padding: 16px 0 8px; color: #888; font-size: 13px;">Total</td>
              <td style="padding: 16px 0 8px; font-weight: 800; color: #00577C; font-size: 20px;">
                ₱${totalAmount.toLocaleString()}
              </td>
            </tr>
          </table>
        </div>

        ${addonsHtml}
        ${charityHtml}
        ${transferHtml}

        <!-- Waiver -->
        <div style="background: #FCBC5A; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 6px; font-size: 15px; font-weight: 700; color: #363737;">
            ⚡ Speed Up Your Pickup — Complete Your Waiver
          </p>
          <p style="margin: 0 0 16px; font-size: 13px; color: #363737; line-height: 1.5;">
            Sign your waiver before you arrive for a faster handover. It only takes 2 minutes!
          </p>
          <a href="${waiverUrl}"
            style="display: inline-block; background: #00577C; color: white; text-decoration: none;
              font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; letter-spacing: 0.02em;">
            Complete My Waiver →
          </a>
        </div>

        <!-- Paw Card -->
        <div style="background: #00577C; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: white; line-height: 1.6;">
            🐾 Don't forget to ask about your <strong>Paw Card</strong> when you arrive!
            It's included free with every rental and gives you exclusive discounts at
            75+ local businesses across Siargao.
          </p>
        </div>

        <!-- WhatsApp -->
        <div style="padding: 16px 0; border-top: 1px solid #e8e0d5; margin-top: 8px;">
          <p style="margin: 0 0 8px; font-size: 14px; color: #363737; line-height: 1.6;">
            💬 Got a question? WhatsApp us anytime — we're open 9am–5pm (Philippines Time).
            Messages received outside of these hours will be picked up as soon as we reopen.
            We'll always get back to you!
          </p>
          <p style="margin: 0;">
            <a href="https://wa.me/${whatsappNumber}"
              style="color: #FCBC5A; font-weight: 700; font-size: 14px; text-decoration: none;">
              WhatsApp Lola's Rentals
            </a>
          </p>
        </div>

      </div>

      <!-- Footer -->
      <div style="padding: 20px 32px; text-align: center; border-top: 1px solid #e8e0d5;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #999;">
          Lola's Rentals &amp; Tours Inc. — Siargao Island, Philippines
        </p>
        <p style="margin: 0; font-size: 11px; color: #bbb;">
          This is an automated confirmation. Please do not reply to this email.
        </p>
      </div>

    </div>
  `;
}
