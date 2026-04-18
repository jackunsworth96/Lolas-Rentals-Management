import { escapeHtml } from '../email.js';

/**
 * Internal staff alert when a walk-in booking is created via /walk-in-direct.
 * All user/DB-supplied strings are routed through escapeHtml() to prevent HTML injection.
 */
export function walkInStaffAlertHtml({
  customerName,
  customerEmail,
  customerMobile,
  orderReference,
  vehicleName,
  pickupDatetime,
  dropoffDatetime,
  grandTotal,
}: {
  customerName: string;
  customerEmail?: string | null;
  customerMobile?: string | null;
  orderReference: string;
  vehicleName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  grandTotal: number;
}): string {
  return `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #00577C;">New Walk-in Booking</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px; width: 140px;">Reference</td>
                  <td style="padding: 8px 0; font-weight: 700;">${escapeHtml(orderReference)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Customer</td>
                  <td style="padding: 8px 0; font-weight: 700;">${escapeHtml(customerName)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Email</td>
                  <td style="padding: 8px 0;">${customerEmail ? escapeHtml(customerEmail) : '—'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Mobile</td>
                  <td style="padding: 8px 0;">${customerMobile ? escapeHtml(customerMobile) : '—'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Vehicle</td>
                  <td style="padding: 8px 0; font-weight: 700;">${escapeHtml(vehicleName)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Pick Up</td>
                  <td style="padding: 8px 0;">${escapeHtml(pickupDatetime)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-size: 14px;">Return</td>
                  <td style="padding: 8px 0;">${escapeHtml(dropoffDatetime)}</td>
                </tr>
                <tr style="border-top: 2px solid #FCBC5A;">
                  <td style="padding: 16px 0 8px; color: #666; font-size: 14px;">Total</td>
                  <td style="padding: 16px 0 8px; font-weight: 700; color: #00577C; font-size: 18px;">₱${grandTotal.toLocaleString()}</td>
                </tr>
              </table>
              <p style="margin-top: 24px; font-size: 12px; color: #999;">
                Sent automatically by Lola's Rentals platform — Walk-in booking
              </p>
            </div>
          `;
}

/**
 * Internal staff alert when a new online (direct) booking is submitted.
 * All user/DB-supplied strings are routed through escapeHtml() to prevent HTML injection.
 * The addonsStaffHtml / transferStaffHtml / charityStaffHtml args are expected to be
 * already-constructed HTML fragments — the caller is responsible for escaping their inputs.
 */
export function bookingStaffAlertHtml({
  customerName,
  customerEmail,
  customerMobile,
  orderReference,
  vehicleName,
  pickupLocation,
  dropoffLocation,
  pickupDatetime,
  dropoffDatetime,
  paymentMethodLabel,
  addonsStaffHtml,
  transferStaffHtml,
  charityStaffHtml,
  grandTotal,
}: {
  customerName: string;
  customerEmail: string;
  customerMobile?: string | null;
  orderReference: string;
  vehicleName: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  paymentMethodLabel: string;
  addonsStaffHtml: string;
  transferStaffHtml: string;
  charityStaffHtml: string;
  grandTotal: number;
}): string {
  const telHref = customerMobile ? encodeURIComponent(customerMobile) : '';
  const mobileDisplay = customerMobile ? escapeHtml(customerMobile) : '—';
  return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background: #00577C; border-radius: 10px; padding: 20px 24px; margin-bottom: 20px;">
            <h2 style="color: white; margin: 0; font-size: 20px;">🐾 New Booking Received</h2>
            <p style="color: rgba(255,255,255,0.75); margin: 4px 0 0; font-size: 13px;">${escapeHtml(orderReference)}</p>
          </div>
          <div style="background: white; border-radius: 10px; padding: 20px 24px; border: 1px solid #eee;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px; width: 130px;">Customer</td>
                <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${escapeHtml(customerName)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Email</td>
                <td style="padding: 6px 0; font-size: 13px;">
                  <a href="mailto:${escapeHtml(customerEmail)}" style="color: #00577C;">${escapeHtml(customerEmail)}</a>
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Mobile</td>
                <td style="padding: 6px 0; font-size: 13px;">
                  <a href="tel:${telHref}" style="color: #00577C;">${mobileDisplay}</a>
                </td>
              </tr>
              <tr style="border-top: 1px solid #f0f0f0;">
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Vehicle</td>
                <td style="padding: 6px 0; font-weight: 700; font-size: 14px;">${escapeHtml(vehicleName)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Pick Up</td>
                <td style="padding: 6px 0; font-size: 13px;">${escapeHtml(pickupLocation)} — ${escapeHtml(pickupDatetime)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Drop Off</td>
                <td style="padding: 6px 0; font-size: 13px;">${escapeHtml(dropoffLocation)} — ${escapeHtml(dropoffDatetime)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 13px;">Payment</td>
                <td style="padding: 6px 0; font-size: 13px;">${escapeHtml(paymentMethodLabel)}</td>
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
      `;
}
