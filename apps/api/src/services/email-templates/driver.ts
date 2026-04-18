import { escapeHtml } from '../email.js';

/**
 * Driver notification email sent when staff dispatch a transfer job.
 * Designed for mobile readability — large text, clear sections, no clutter.
 * All user/DB-supplied strings are routed through escapeHtml().
 *
 * direction: 'iao-to-gl' = inbound (airport pickup → accommodation dropoff)
 *            'gl-to-iao' = outbound (accommodation pickup → airport dropoff)
 */
export function driverNotificationHtml({
  customerName,
  route,
  pickupLocation,
  pickupTime,
  flightNumber,
  flightArrivalTime,
  paxCount,
  totalPrice,
  driverCut,
  direction,
}: {
  customerName: string;
  route: string;
  pickupLocation: string | null;
  pickupTime: string | null;
  flightNumber: string | null;
  flightArrivalTime: string | null;
  paxCount: number;
  totalPrice: number;
  driverCut: number;
  direction: 'gl-to-iao' | 'iao-to-gl';
}): string {
  const isInbound = direction === 'iao-to-gl';

  // For inbound (IAO→GL) the driver goes to the airport first.
  // For outbound (GL→IAO) the driver collects from the customer's accommodation.
  const pickupFromLabel = isInbound
    ? 'IAO Airport'
    : (pickupLocation ?? 'Customer Accommodation');

  const dropoffAtLabel = isInbound
    ? (pickupLocation ?? 'Customer Accommodation')
    : 'IAO Airport';

  const directionIcon = isInbound ? '✈️' : '🏨';
  const directionLabel = isInbound
    ? 'INBOUND — Airport → General Luna'
    : 'OUTBOUND — General Luna → Airport';

  const pickupTimeRow = pickupTime
    ? `<tr>
        <td style="padding:4px 0;color:#64748b;font-size:13px;">Date / Time</td>
        <td style="padding:4px 0;font-weight:700;color:#1e293b;font-size:15px;">${escapeHtml(pickupTime)}</td>
      </tr>`
    : '';

  const flightNumberRow = flightNumber
    ? `<tr>
        <td style="padding:4px 0;color:#64748b;font-size:13px;">Flight No.</td>
        <td style="padding:4px 0;font-weight:700;color:#1e293b;font-size:15px;">${escapeHtml(flightNumber)}</td>
      </tr>`
    : '';

  const flightArrivalRow = flightArrivalTime
    ? `<tr>
        <td style="padding:4px 0;color:#64748b;font-size:13px;">Flight Time</td>
        <td style="padding:4px 0;font-weight:700;color:#1e293b;font-size:15px;">${escapeHtml(flightArrivalTime)}</td>
      </tr>`
    : '';

  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #f1f5f9; padding: 16px;">

      <div style="background: #00577C; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; text-align: center;">
        <p style="color: rgba(255,255,255,0.7); margin: 0 0 4px; font-size: 11px; letter-spacing: 2px; text-transform: uppercase;">
          Lola's Rentals — Driver Job
        </p>
        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 900;">
          🚐 Transfer Job
        </h1>
      </div>

      <!-- Direction banner — most important info for the driver -->
      <div style="background: #FCBC5A; border-radius: 12px; padding: 20px 24px; margin-bottom: 12px;">
        <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #7a5800; text-transform: uppercase; letter-spacing: 0.08em;">
          ${directionIcon} Direction
        </p>
        <p style="margin: 0 0 16px; font-size: 14px; font-weight: 700; color: #363737;">
          ${escapeHtml(directionLabel)}
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 0 0 10px; vertical-align: top; width: 50%;">
              <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; color: #7a5800; text-transform: uppercase; letter-spacing: 0.06em;">
                📍 Pickup From
              </p>
              <p style="margin: 0; font-size: 17px; font-weight: 900; color: #1e293b; line-height: 1.3;">
                ${escapeHtml(pickupFromLabel)}
              </p>
            </td>
            <td style="padding: 0 0 10px; vertical-align: top; padding-left: 16px;">
              <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; color: #7a5800; text-transform: uppercase; letter-spacing: 0.06em;">
                🏁 Drop Off At
              </p>
              <p style="margin: 0; font-size: 17px; font-weight: 900; color: #1e293b; line-height: 1.3;">
                ${escapeHtml(dropoffAtLabel)}
              </p>
            </td>
          </tr>
        </table>
      </div>

      <!-- Customer & Route -->
      <div style="background: white; border-radius: 12px; padding: 20px 24px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07);">
        <p style="margin: 0 0 14px; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em;">
          Job Details
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding:10px 0 4px;color:#64748b;font-size:13px;width:120px;">Customer</td>
            <td style="padding:10px 0 4px;font-weight:900;color:#1e293b;font-size:18px;">${escapeHtml(customerName)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;">Route</td>
            <td style="padding:4px 0;font-weight:700;color:#00577C;font-size:16px;">${escapeHtml(route)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;">Passengers</td>
            <td style="padding:4px 0;font-weight:700;color:#1e293b;font-size:15px;">${paxCount} pax</td>
          </tr>
          ${pickupTimeRow}
          ${flightNumberRow}
          ${flightArrivalRow}
        </table>
      </div>

      <!-- Payment -->
      <div style="background: white; border-radius: 12px; padding: 20px 24px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07);">
        <p style="margin: 0 0 14px; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em;">
          Payment
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;width:120px;">Transfer Total</td>
            <td style="padding:6px 0;color:#1e293b;font-size:14px;">₱${totalPrice.toLocaleString()}</td>
          </tr>
          <tr style="border-top:2px solid #FCBC5A;">
            <td style="padding:12px 0 6px;color:#64748b;font-size:13px;font-weight:700;">Your Cut</td>
            <td style="padding:12px 0 6px;font-weight:900;color:#00577C;font-size:22px;">₱${driverCut.toLocaleString()}</td>
          </tr>
        </table>
      </div>

      <p style="color:#94a3b8;font-size:11px;text-align:center;margin:12px 0 0;">
        Lola's Rentals &amp; Tours Inc. — Driver notification
      </p>

    </div>
  `;
}
