// Required env vars:
// RESEND_API_KEY — from resend.com dashboard
// NOTIFICATION_EMAIL — where to send internal alerts
// NOTIFICATION_EMAIL_FROM — verified sender domain
//   (e.g. noreply@lolasrentals.com)
//   Must be a verified domain in Resend dashboard,
//   or use onboarding@resend.dev for testing

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
  pickupDatetime,
  dropoffDatetime,
  totalAmount,
}: {
  customerName: string;
  orderReference: string;
  vehicleName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  totalAmount: number;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #00577C; padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">
          Lola's Rentals
        </h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">
          Booking Confirmation
        </p>
      </div>
      <div style="padding: 32px; background: #FAF6F0;">
        <h2 style="color: #363737;">
          Hi ${customerName}! 🐾
        </h2>
        <p style="color: #363737; line-height: 1.6;">
          Your booking is confirmed. Here are your details:
        </p>
        <div style="background: white; border-radius: 12px; 
          padding: 24px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Order Reference</td>
              <td style="padding: 8px 0; font-weight: 700; 
                color: #363737;">${orderReference}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Vehicle</td>
              <td style="padding: 8px 0; font-weight: 700; 
                color: #363737;">${vehicleName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Pick Up</td>
              <td style="padding: 8px 0; font-weight: 700; 
                color: #363737;">${pickupDatetime}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; 
                font-size: 14px;">Return</td>
              <td style="padding: 8px 0; font-weight: 700; 
                color: #363737;">${dropoffDatetime}</td>
            </tr>
            <tr style="border-top: 1px solid #eee;">
              <td style="padding: 16px 0 8px; color: #666; 
                font-size: 14px;">Total</td>
              <td style="padding: 16px 0 8px; font-weight: 700; 
                color: #00577C; font-size: 18px;">
                ₱${totalAmount.toLocaleString()}
              </td>
            </tr>
          </table>
        </div>
        <div style="background: #FCBC5A; border-radius: 12px; 
          padding: 16px; text-align: center; margin: 24px 0;">
          <p style="margin: 0; font-weight: 700; color: #363737;">
            🐾 Don't forget your Paw Card!
          </p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #363737;">
            Get exclusive discounts at 75+ partner establishments 
            across Siargao.
          </p>
        </div>
        <p style="color: #666; font-size: 12px; text-align: center;">
          Questions? WhatsApp us or visit us at the shop.
          <br/>Lola's Rentals &amp; Tours Inc. — Siargao Island
        </p>
      </div>
    </div>
  `;
}
