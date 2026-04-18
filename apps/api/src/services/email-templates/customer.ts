import { escapeHtml } from '../email.js';

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
  addons,
  charityDonation,
  hasTransfer,
  transferType,
  transferRoute,
  transferAmount,
  waiverUrl,
  whatsappNumber,
  cancelUrl,
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
  addons: Array<{ name: string; price: number }>;
  charityDonation: number;
  hasTransfer: boolean;
  transferType?: string;
  transferRoute?: string;
  transferAmount?: number;
  waiverUrl: string;
  whatsappNumber: string;
  cancelUrl?: string;
}): string {
  const vehicleLabel =
    vehicleCount > 1 ? `${escapeHtml(vehicleName)} × ${vehicleCount}` : escapeHtml(vehicleName);

  const transferTypeLabel =
    transferType === 'tuktuk'
      ? 'Private TukTuk'
      : transferType === 'private'
        ? 'Private Van'
        : 'Shared Van';

  // FIX 4 — add transfer to the displayed total
  const displayTotal = totalAmount + (transferAmount ?? 0);

  const transferRowHtml =
    (transferAmount ?? 0) > 0
      ? `<tr>
          <td style="padding: 8px 0; color: #888; font-size: 13px;">Transfer</td>
          <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">₱${(transferAmount ?? 0).toLocaleString()}</td>
        </tr>`
      : '';

  const addonsHtml =
    addons.length > 0
      ? `
        <div style="background: #f5f5f5; border-radius: 10px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #363737; text-transform: uppercase; letter-spacing: 0.05em;">What's included:</p>
          ${addons
            .map(
              (a) =>
                `<p style="margin: 4px 0; font-size: 14px; color: #363737;">✓ ${escapeHtml(a.name)} — ₱${a.price.toLocaleString()}</p>`,
            )
            .join('')}
        </div>`
      : '';

  const charityHtml =
    charityDonation > 0
      ? `<p style="font-size: 13px; color: #00577C; font-style: italic; margin: 8px 0 16px;">
          🐾 ₱${charityDonation.toLocaleString()} will be donated to Be Pawsitive — thank you for giving back to Siargao's street animals!
        </p>`
      : '';

  // FIX 3 — teal background for transfer block
  const transferHtml = hasTransfer
    ? `
      <div style="background: #00577C; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 12px; font-size: 16px; font-weight: 700; color: white;">🚐 Your Transfer is Booked</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
          <tr>
            <td style="padding: 4px 0; color: rgba(255,255,255,0.75); font-size: 13px; width: 80px;">Route</td>
            <td style="padding: 4px 0; font-weight: 700; color: white; font-size: 13px;">${escapeHtml(transferRoute ?? 'Airport Transfer')}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: rgba(255,255,255,0.75); font-size: 13px;">Type</td>
            <td style="padding: 4px 0; font-weight: 700; color: white; font-size: 13px;">${transferTypeLabel}</td>
          </tr>
        </table>
        <p style="margin: 0 0 8px; font-size: 13px; color: rgba(255,255,255,0.9); line-height: 1.6;">
          Your driver will be waiting at the airport arrivals area holding a sign with your name on it.
          Please be aware that other drivers may approach you — always confirm your name is on their list before getting in.
        </p>
        <p style="margin: 0 0 8px; font-size: 13px; color: rgba(255,255,255,0.9); line-height: 1.6;">
          ⚠️ <strong style="color: white;">Important:</strong> If you board the wrong vehicle, you will be charged for both transfers — so take a moment to verify before you go!
        </p>
        <p style="margin: 0 0 8px; font-size: 13px; color: rgba(255,255,255,0.9); line-height: 1.6;">
          ✅ No payment needed on arrival — we've already settled this for you, so you have one less thing to worry about.
        </p>
        <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.9); line-height: 1.6;">
          Please WhatsApp us your flight number and estimated arrival time so we can track your flight and ensure your driver is ready and waiting.
        </p>
      </div>`
    : '';

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #FAF6F0;">

      <!-- FIX 1 — Styled text header (no external image dependency) -->
      <div style="background: #00577C; padding: 36px 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 36px; font-weight: 900; letter-spacing: -1px;">
          Lola's<span style="color: #FCBC5A;">*</span> Rentals
        </h1>
        <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">
          Siargao Island · Est. 2023
        </p>
      </div>

      <!-- Body -->
      <div style="padding: 32px;">

        <!-- Greeting -->
        <h2 style="color: #363737; margin: 0 0 8px; font-size: 22px;">
          Hi ${escapeHtml(customerName)}! 🐾
        </h2>
        <p style="color: #363737; line-height: 1.6; margin: 0 0 24px; font-size: 15px;">
          Your booking is confirmed — we can't wait to see you on the island!
        </p>

        <!-- Booking details card -->
        <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px; width: 150px;">Order Reference</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${escapeHtml(orderReference)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Vehicle</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${vehicleLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Pick Up</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${escapeHtml(pickupLocation)} — ${escapeHtml(pickupDatetime)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Drop Off</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${escapeHtml(dropoffLocation)} — ${escapeHtml(dropoffDatetime)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888; font-size: 13px;">Payment</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737; font-size: 14px;">${escapeHtml(paymentMethod)}</td>
            </tr>
            ${paymentMethod === 'GCash' ? `
            <tr>
              <td colspan="2" style="padding: 8px 0 16px;">
                <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px 14px;">
                  <p style="margin: 0 0 6px; font-size: 13px; font-weight: 700; color: #166534; font-family: Lato, sans-serif;">
                    📱 GCash Payment Instructions
                  </p>
                  <p style="margin: 0 0 4px; font-size: 13px; color: #166534; font-family: Lato, sans-serif;">
                    Please send <strong>₱${displayTotal.toLocaleString()}</strong> to:
                  </p>
                  <p style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: #166534; font-family: Lato, sans-serif;">
                    09694443413
                  </p>
                  <p style="margin: 0; font-size: 12px; color: #166534; font-family: Lato, sans-serif; opacity: 0.8;">
                    Use your order reference <strong>${escapeHtml(orderReference)}</strong> as the GCash message/note.
                    Send us a screenshot on WhatsApp once paid.
                  </p>
                </div>
              </td>
            </tr>
            ` : ''}
            ${transferRowHtml}
            <tr style="border-top: 2px solid #eee;">
              <td style="padding: 16px 0 8px; color: #888; font-size: 13px;">Total</td>
              <td style="padding: 16px 0 8px; font-weight: 800; color: #00577C; font-size: 20px;">
                ₱${displayTotal.toLocaleString()}
              </td>
            </tr>
            <!-- FIX 2 — Static deposit note -->
            <tr>
              <td colspan="2" style="padding: 8px 0; font-size: 12px; color: #888; font-style: italic;">
                💰 A cash security deposit is collected at pickup: ₱1,000 per scooter or ₱2,000 per TukTuk. This is fully refundable upon return.
              </td>
            </tr>
          </table>
        </div>

        ${addonsHtml}
        ${charityHtml}
        ${transferHtml}

        <!-- FIX 3 — Waiver: teal box, gold CTA button only -->
        <div style="background: #00577C; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 6px; font-size: 15px; font-weight: 700; color: white;">
            ⚡ Speed Up Your Pickup — Complete Your Waiver
          </p>
          <p style="margin: 0 0 16px; font-size: 13px; color: rgba(255,255,255,0.85); line-height: 1.5;">
            Sign your waiver before you arrive for a faster handover. It only takes 2 minutes!
          </p>
          <a href="${escapeHtml(waiverUrl)}"
            style="display: inline-block; background: #FCBC5A; color: #363737; text-decoration: none;
              font-weight: 800; font-size: 14px; padding: 12px 28px; border-radius: 8px; letter-spacing: 0.02em;">
            Complete My Waiver →
          </a>
        </div>

        ${cancelUrl ? `
        <div style="margin-top:16px;text-align:center;">
          <a href="${escapeHtml(cancelUrl)}"
             style="color:#999;font-size:12px;text-decoration:underline;">
            Need to cancel? Click here to cancel this booking.
          </a>
        </div>
        ` : ''}

        <!-- Paw Card (stays teal) -->
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
            <a href="https://wa.me/${escapeHtml(whatsappNumber)}"
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

export function waiverConfirmationHtml({
  driverName,
  orderReference,
  signedAt,
  hasLicence,
  whatsappNumber,
}: {
  driverName: string;
  orderReference: string;
  signedAt: string;
  hasLicence: boolean;
  whatsappNumber: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">

      <div style="background: #00577C; padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 900;">
          Lola's<span style="color: #FCBC5A;">*</span> Rentals
        </h1>
        <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">
          Siargao Island · Est. 2023
        </p>
      </div>

      <div style="padding: 32px; background: #FAF6F0;">

        <h2 style="color: #363737; margin: 0 0 8px;">
          ✅ Waiver Signed, ${escapeHtml(driverName)}!
        </h2>
        <p style="color: #363737; line-height: 1.6; margin: 0 0 24px;">
          Your vehicle inspection waiver has been successfully signed. Here's a summary for your records.
        </p>

        <div style="background: white; border-radius: 12px; padding: 24px; margin: 24px 0; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 160px;">Booking Reference</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737;">${escapeHtml(orderReference)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Signed By</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737;">${escapeHtml(driverName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Signed At</td>
              <td style="padding: 8px 0; color: #363737;">${escapeHtml(signedAt)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Licence Uploaded</td>
              <td style="padding: 8px 0; color: ${hasLicence ? '#16a34a' : '#dc2626'};">
                ${hasLicence ? '✅ Yes' : '❌ No — please bring your licence to pickup'}
              </td>
            </tr>
          </table>
        </div>

        <div style="background: #00577C; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="color: white; margin: 0 0 12px; font-weight: 700; font-size: 15px;">
            📋 What you agreed to:
          </p>
          <ul style="color: rgba(255,255,255,0.85); margin: 0; padding-left: 20px; line-height: 1.8; font-size: 14px;">
            <li>You have inspected the vehicle and are satisfied with its condition</li>
            <li>You hold a valid licence appropriate for the vehicle type</li>
            <li>You accept responsibility for the vehicle during the rental period</li>
            <li>You understand the terms and conditions of Lola's Rentals</li>
          </ul>
        </div>

        <div style="background: #FCBC5A; border-radius: 12px; padding: 16px; text-align: center; margin: 24px 0;">
          <p style="margin: 0; font-weight: 700; color: #363737;">
            🐾 Don't forget to ask about your Paw Card on arrival!
          </p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #363737;">
            Free with every rental — discounts at 75+ local businesses across Siargao.
          </p>
        </div>

        <p style="color: #363737; font-size: 14px; line-height: 1.6;">
          💬 Questions? WhatsApp us — we're open <strong>9am–5pm Philippine Time</strong>.
          Messages outside hours will be picked up when we reopen.
          <br/><br/>
          <a href="https://wa.me/${escapeHtml(whatsappNumber)}" style="color: #00577C; font-weight: 700;">
            WhatsApp Lola's Rentals
          </a>
        </p>

        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 32px;">
          Lola's Rentals &amp; Tours Inc. — Siargao Island, Philippines<br/>
          This is an automated confirmation. Please do not reply to this email.
        </p>

      </div>
    </div>
  `;
}

export function waiverReminderHtml({
  customerName,
  orderReference,
  pickupDatetime,
  waiverUrl,
  whatsappNumber,
}: {
  customerName: string;
  orderReference: string;
  pickupDatetime: string;
  waiverUrl: string;
  whatsappNumber: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">

      <div style="background: #00577C; padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 900;">
          Lola's<span style="color: #FCBC5A;">*</span> Rentals
        </h1>
        <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">
          Siargao Island · Est. 2023
        </p>
      </div>

      <div style="padding: 32px; background: #FAF6F0;">

        <h2 style="color: #363737; margin: 0 0 8px;">
          ⚡ Action Required, ${escapeHtml(customerName)}!
        </h2>
        <p style="color: #363737; line-height: 1.6; margin: 0 0 24px;">
          Your rental starts tomorrow and we noticed you haven't signed your waiver yet.
          Signing takes just 2 minutes and means a much faster handover when you arrive!
        </p>

        <div style="background: #00577C; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
          <p style="color: white; margin: 0 0 8px; font-size: 16px; font-weight: 700;">
            📋 Your rental is tomorrow
          </p>
          <p style="color: rgba(255,255,255,0.85); margin: 0 0 8px; font-size: 14px;">
            Booking Reference: <strong style="color: #FCBC5A;">${escapeHtml(orderReference)}</strong>
          </p>
          <p style="color: rgba(255,255,255,0.85); margin: 0 0 20px; font-size: 14px;">
            Pick Up: ${escapeHtml(pickupDatetime)}
          </p>
          <a href="${escapeHtml(waiverUrl)}"
            style="display: inline-block; background: #FCBC5A; color: #363737; padding: 14px 32px;
              border-radius: 8px; font-weight: 700; font-size: 16px; text-decoration: none;">
            Sign My Waiver Now →
          </a>
        </div>

        <div style="background: white; border-radius: 12px; padding: 20px; margin: 24px 0; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
          <p style="color: #363737; margin: 0 0 12px; font-weight: 700;">
            What to have ready:
          </p>
          <ul style="color: #666; margin: 0; padding-left: 20px; line-height: 1.8; font-size: 14px;">
            <li>Your driver's licence (photo to upload)</li>
            <li>Your signature (drawn on screen)</li>
            <li>2 minutes of your time!</li>
          </ul>
        </div>

        <p style="color: #363737; font-size: 14px; line-height: 1.6;">
          💬 Questions? WhatsApp us — we're open <strong>9am–5pm Philippine Time</strong>.
          Messages outside hours will be picked up when we reopen.
          <br/><br/>
          <a href="https://wa.me/${escapeHtml(whatsappNumber)}" style="color: #00577C; font-weight: 700;">
            WhatsApp Lola's Rentals
          </a>
        </p>

        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 32px;">
          Lola's Rentals &amp; Tours Inc. — Siargao Island, Philippines<br/>
          This is an automated reminder. Please do not reply to this email.
        </p>

      </div>
    </div>
  `;
}

export function postRentalThankYouHtml({
  customerName,
  orderReference,
  vehicleName,
  rentalDays,
  totalPaid,
  pickupDatetime,
  dropoffDatetime,
  pawCardSavings,
  pawCardEstablishments,
  whatsappNumber,
}: {
  customerName: string;
  orderReference: string;
  vehicleName: string;
  rentalDays: number;
  totalPaid: number;
  pickupDatetime: string;
  dropoffDatetime: string;
  pawCardSavings: number;
  pawCardEstablishments: Array<{ name: string; saved: number }>;
  whatsappNumber: string;
}): string {
  const effectiveDailyRate = rentalDays > 0 ? Math.round(totalPaid / rentalDays) : totalPaid;

  const pawCardSection =
    pawCardSavings > 0
      ? `
    <div style="background: #00577C; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #FCBC5A; font-weight: 700; font-size: 16px; margin: 0 0 12px;">
        🐾 Your Paw Card Impact
      </p>
      <p style="color: white; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
        During your stay you saved
        <strong>₱${pawCardSavings.toLocaleString()}</strong>
        using your Paw Card at ${pawCardEstablishments.length} local
        ${pawCardEstablishments.length === 1 ? 'business' : 'businesses'}:
      </p>
      <ul style="color: rgba(255,255,255,0.85); margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.8;">
        ${pawCardEstablishments.map((e) => `<li>${escapeHtml(e.name)} — ₱${e.saved.toLocaleString()} saved</li>`).join('')}
      </ul>
      <p style="color: white; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Lola's Rentals matched that <strong>peso-for-peso</strong> as a donation to Be Pawsitive —
        funding spay and neuter clinics for Siargao's street animals.
        <strong style="color: #FCBC5A;">₱${pawCardSavings.toLocaleString()} donated in your name.</strong>
      </p>
      <div style="background: rgba(255,255,255,0.1); border-radius: 8px; padding: 16px;">
        <p style="color: rgba(255,255,255,0.9); font-size: 13px; line-height: 1.7; margin: 0; font-style: italic;">
          🐱 Did you know? Spaying a single female cat in the Philippines costs around ₱1,000 — and
          prevents potentially hundreds of thousands of kittens over 7 years. Your savings are literally
          changing lives on this island.
          <br/><br/>
          <span style="font-size: 11px; color: rgba(255,255,255,0.6);">
            Source: PAWS Philippines &amp; published veterinary population studies
          </span>
        </p>
      </div>
    </div>`
      : `
    <div style="background: #00577C; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
      <p style="color: white; margin: 0; font-size: 14px;">
        🐾 Don't forget your Paw Card next time! Log your savings at 75+ partner businesses
        and help fund animal welfare on Siargao.
      </p>
    </div>`;

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">

      <div style="background: #00577C; padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 900;">
          Lola's<span style="color: #FCBC5A;">*</span> Rentals
        </h1>
        <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">
          Siargao Island · Est. 2023
        </p>
      </div>

      <div style="padding: 32px; background: #FAF6F0;">

        <h2 style="color: #363737; margin: 0 0 8px;">
          Thank you, ${escapeHtml(customerName)}! 🐾
        </h2>
        <p style="color: #363737; line-height: 1.6; margin: 0 0 24px;">
          Your rental has come to an end — we hope Siargao treated you well and that you made fond
          memories here. We hope to see you again.
        </p>

        <div style="background: white; border-radius: 12px; padding: 24px; margin: 24px 0; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
          <p style="color: #363737; font-weight: 700; margin: 0 0 16px; font-size: 15px;">
            🛵 Your Rental Summary
          </p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 160px;">Booking Reference</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737;">${escapeHtml(orderReference)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Vehicle</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737;">${escapeHtml(vehicleName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Pick Up</td>
              <td style="padding: 8px 0; color: #363737;">${escapeHtml(pickupDatetime)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Return</td>
              <td style="padding: 8px 0; color: #363737;">${escapeHtml(dropoffDatetime)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Duration</td>
              <td style="padding: 8px 0; color: #363737;">${rentalDays} ${rentalDays === 1 ? 'day' : 'days'}</td>
            </tr>
            <tr style="border-top: 2px solid #FCBC5A;">
              <td style="padding: 16px 0 8px; color: #666; font-size: 14px;">Total Paid</td>
              <td style="padding: 16px 0 8px; font-weight: 700; color: #00577C; font-size: 18px;">
                ₱${totalPaid.toLocaleString()}
              </td>
            </tr>
            <tr>
              <td style="padding: 4px 0 8px; color: #888; font-size: 12px;">Effective daily rate</td>
              <td style="padding: 4px 0 8px; color: #888; font-size: 12px;">
                ₱${effectiveDailyRate.toLocaleString()}/day
              </td>
            </tr>
          </table>
        </div>

        ${pawCardSection}

        <div style="background: white; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
          <p style="color: #363737; font-weight: 700; font-size: 16px; margin: 0 0 8px;">
            ⭐ Loved your experience?
          </p>
          <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
            Reviews mean the world to small island businesses like ours. If you had a great time, a quick
            Google review helps other travellers discover us — and keeps Siargao's community thriving.
          </p>
          <a href="https://g.page/r/CXtJhZFnjqBIEBE/review"
            style="display: inline-block; background: #FCBC5A; color: #363737; padding: 14px 32px;
              border-radius: 8px; font-weight: 700; font-size: 15px; text-decoration: none;">
            Leave Us a Google Review →
          </a>
        </div>

        <div style="background: white; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
          <p style="color: #363737; font-weight: 700; margin: 0 0 8px;">
            📸 Share your Siargao moments
          </p>
          <p style="color: #666; font-size: 14px; margin: 0;">
            Tag us on Instagram
            <a href="https://instagram.com/lolasrentals" style="color: #00577C; font-weight: 700;">
              @lolasrentals
            </a>
            — we'd love to see your adventures!
          </p>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <p style="color: #363737; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            💬 Siargao will always be here. And so will we. 🐾
            <br/>
            WhatsApp us when you're planning your next trip!
          </p>
          <a href="https://wa.me/${escapeHtml(whatsappNumber)}"
            style="display: inline-block; background: #00577C; color: white; padding: 12px 28px;
              border-radius: 8px; font-weight: 700; font-size: 14px; text-decoration: none;">
            WhatsApp Lola's Rentals
          </a>
          <p style="color: #888; font-size: 12px; margin: 8px 0 0;">
            We're open 9am–5pm Philippine Time
          </p>
        </div>

        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 32px;">
          Lola's Rentals &amp; Tours Inc. — Siargao Island, Philippines<br/>
          This is an automated message. Please do not reply to this email.
        </p>

      </div>
    </div>
  `;
}

export function extendConfirmationHtml({
  customerName,
  orderReference,
  vehicleName,
  newDropoffDatetime,
  extensionDays,
  extensionCost,
  whatsappNumber,
}: {
  customerName: string;
  orderReference: string;
  vehicleName?: string;
  newDropoffDatetime: string;
  extensionDays: number;
  extensionCost: number;
  whatsappNumber: string;
}): string {
  const vehicleRow = vehicleName
    ? `<tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Vehicle</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737;">${escapeHtml(vehicleName)}</td>
            </tr>`
    : '';

  const costRow =
    extensionCost > 0
      ? `<tr style="border-top: 2px solid #FCBC5A;">
              <td style="padding: 16px 0 8px; color: #666; font-size: 14px;">Extension Cost</td>
              <td style="padding: 16px 0 8px; font-weight: 700; color: #363737; font-size: 18px;">
                ₱${extensionCost.toLocaleString()}
              </td>
            </tr>`
      : `<tr style="border-top: 2px solid #FCBC5A;">
              <td style="padding: 16px 0 8px; color: #666; font-size: 14px;">Extension Cost</td>
              <td style="padding: 16px 0 8px; font-weight: 700; color: #16a34a;">No additional charge</td>
            </tr>`;

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">

      <div style="background: #00577C; padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 900;">
          Lola's<span style="color: #FCBC5A;">*</span> Rentals
        </h1>
        <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">
          Siargao Island · Est. 2023
        </p>
      </div>

      <div style="padding: 32px; background: #FAF6F0;">

        <h2 style="color: #363737; margin: 0 0 8px;">
          Rental Extended! 🛵
        </h2>
        <p style="color: #363737; line-height: 1.6; margin: 0 0 24px;">
          Great news — your rental extension has been confirmed. Here are your updated details:
        </p>

        <div style="background: white; border-radius: 12px; padding: 24px; margin: 24px 0; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 180px;">Booking Reference</td>
              <td style="padding: 8px 0; font-weight: 700; color: #363737;">${escapeHtml(orderReference)}</td>
            </tr>
            ${vehicleRow}
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Extension</td>
              <td style="padding: 8px 0; color: #363737;">+${extensionDays} ${extensionDays === 1 ? 'day' : 'days'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">New Return Time</td>
              <td style="padding: 8px 0; font-weight: 700; color: #00577C; font-size: 16px;">${escapeHtml(newDropoffDatetime)}</td>
            </tr>
            ${costRow}
          </table>
        </div>

        <div style="background: #00577C; border-radius: 12px; padding: 16px; text-align: center; margin: 24px 0;">
          <p style="color: white; margin: 0; font-size: 14px; line-height: 1.6;">
            🐾 Don't forget to ask about your Paw Card if you haven't already —
            discounts at 75+ local businesses across Siargao!
          </p>
        </div>

        <p style="color: #363737; font-size: 14px; line-height: 1.6;">
          💬 Questions? WhatsApp us — we're open <strong>9am–5pm Philippine Time</strong>.
          Messages outside hours will be picked up when we reopen.
          <br/><br/>
          <a href="https://wa.me/${escapeHtml(whatsappNumber)}" style="color: #00577C; font-weight: 700;">
            WhatsApp Lola's Rentals
          </a>
        </p>

        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 32px;">
          Lola's Rentals &amp; Tours Inc. — Siargao Island, Philippines<br/>
          This is an automated confirmation. Please do not reply to this email.
        </p>

      </div>
    </div>
  `;
}

export function bookingCancellationHtml({
  orderReference,
  vehicleName,
  pickupDatetime,
  dropoffDatetime,
  whatsappNumber,
}: {
  orderReference: string;
  vehicleName?: string;
  pickupDatetime?: string;
  dropoffDatetime?: string;
  whatsappNumber: string;
}): string {
  return `
    <div style="font-family: sans-serif;
      max-width: 600px; margin: 0 auto;">

      <div style="background: #00577C;
        padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0;
          font-size: 32px; font-weight: 900;">
          Lola's<span style="color: #FCBC5A;">*</span>
          Rentals
        </h1>
        <p style="color: rgba(255,255,255,0.7);
          margin: 4px 0 0; font-size: 13px;
          letter-spacing: 2px;
          text-transform: uppercase;">
          Siargao Island · Est. 2023
        </p>
      </div>

      <div style="padding: 32px;
        background: #FAF6F0;">

        <h2 style="color: #363737;">
          Booking Cancelled
        </h2>
        <p style="color: #363737; line-height: 1.6;">
          We're sorry — your booking has been 
          cancelled.
        </p>

        <div style="background: white;
          border-radius: 12px; padding: 24px;
          margin: 24px 0;">
          <table style="width: 100%;
            border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;
                font-size: 14px; width: 180px;">
                Booking Reference</td>
              <td style="padding: 8px 0;
                font-weight: 700; color: #363737;">
                ${escapeHtml(orderReference)}
              </td>
            </tr>
            ${vehicleName ? `
            <tr>
              <td style="padding: 8px 0; color: #666;
                font-size: 14px;">Vehicle</td>
              <td style="padding: 8px 0;
                font-weight: 700; color: #363737;">
                ${escapeHtml(vehicleName)}
              </td>
            </tr>` : ''}
            ${pickupDatetime ? `
            <tr>
              <td style="padding: 8px 0; color: #666;
                font-size: 14px;">Pick Up</td>
              <td style="padding: 8px 0;
                color: #363737;">${escapeHtml(pickupDatetime)}</td>
            </tr>` : ''}
            ${dropoffDatetime ? `
            <tr>
              <td style="padding: 8px 0; color: #666;
                font-size: 14px;">Return</td>
              <td style="padding: 8px 0;
                color: #363737;">${escapeHtml(dropoffDatetime)}</td>
            </tr>` : ''}
          </table>
        </div>

        <div style="background: #FEF2F2;
          border: 1px solid #FECACA;
          border-radius: 12px; padding: 20px;
          margin: 24px 0;">
          <p style="color: #7F1D1D; font-size: 14px;
            line-height: 1.7; margin: 0;">
            This is an automated email so 
            unfortunately we're unable to explain 
            exactly why this has happened. It's 
            possible your session timed out, or 
            an error may have occurred during 
            the booking process.
            <br/><br/>
            <strong>Please don't worry</strong> — 
            if you'd like to pursue a booking with 
            us, simply try again or get in touch 
            and we'll be happy to help!
          </p>
        </div>

        <div style="text-align: center;
          margin: 24px 0;">
          <p style="color: #363737; font-size: 15px;
            line-height: 1.6; margin: 0 0 16px;">
            💬 Get in touch — we're open
            <strong>9am–5pm Philippine Time</strong>.
            Messages outside hours will be picked 
            up when we reopen.
          </p>
          <a href="https://wa.me/${escapeHtml(whatsappNumber)}"
            style="display: inline-block;
              background: #00577C;
              color: white;
              padding: 12px 28px;
              border-radius: 8px;
              font-weight: 700;
              font-size: 14px;
              text-decoration: none;">
            WhatsApp Lola's Rentals
          </a>
        </div>

        <div style="background: #00577C;
          border-radius: 12px; padding: 16px;
          text-align: center; margin: 24px 0;">
          <p style="color: white; margin: 0;
            font-size: 14px; line-height: 1.6;">
            🐾 We hope to welcome you to Siargao 
            soon. When you're ready to book, 
            we'll be here!
          </p>
        </div>

        <p style="color: #999; font-size: 12px;
          text-align: center; margin-top: 32px;">
          Lola's Rentals &amp; Tours Inc. —
          Siargao Island, Philippines<br/>
          This is an automated message.
          Please do not reply to this email.
        </p>
      </div>
    </div>
  `;
}

export function transferBookingConfirmationHtml({
  customerName,
  serviceDate,
  route,
  paxCount,
  vanType,
  flightTime,
  totalPrice,
  whatsappNumber,
}: {
  customerName: string;
  serviceDate: string;
  route: string;
  paxCount: number;
  vanType?: string | null;
  flightTime?: string | null;
  totalPrice: number;
  whatsappNumber: string;
}): string {
  const formatPrice = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  return `
    <div style="font-family: 'Lato', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #FAF6F0; padding: 32px 16px;">
      <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-family: 'Alegreya Sans', serif; color: #00577C; font-size: 28px; margin: 0;">
            Transfer Booking Confirmed
          </h1>
          <p style="color: #363737; margin-top: 8px;">Thank you, ${escapeHtml(customerName)}!</p>
        </div>
        <div style="background: #f1e6d6; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 14px;">Route</td>
              <td style="padding: 6px 0; font-weight: 600; color: #363737; text-align: right;">${escapeHtml(route)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 14px;">Date</td>
              <td style="padding: 6px 0; font-weight: 600; color: #363737; text-align: right;">${escapeHtml(serviceDate)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 14px;">Passengers</td>
              <td style="padding: 6px 0; font-weight: 600; color: #363737; text-align: right;">${paxCount}</td>
            </tr>
            ${vanType ? `<tr>
              <td style="padding: 6px 0; color: #666; font-size: 14px;">Van Type</td>
              <td style="padding: 6px 0; font-weight: 600; color: #363737; text-align: right;">${escapeHtml(vanType)}</td>
            </tr>` : ''}
            ${flightTime ? `<tr>
              <td style="padding: 6px 0; color: #666; font-size: 14px;">Flight Time</td>
              <td style="padding: 6px 0; font-weight: 600; color: #363737; text-align: right;">${escapeHtml(flightTime)}</td>
            </tr>` : ''}
            <tr style="border-top: 1px solid #ccc;">
              <td style="padding: 12px 0 6px; color: #363737; font-weight: 700;">Total</td>
              <td style="padding: 12px 0 6px; font-weight: 700; color: #00577C; text-align: right; font-size: 18px;">${formatPrice(totalPrice)}</td>
            </tr>
          </table>
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="https://wa.me/${escapeHtml(whatsappNumber)}"
             style="display: inline-block; background: #00577C; color: white; padding: 12px 28px;
                    border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Questions? WhatsApp Us
          </a>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 32px;">
          Lola's Rentals &amp; Tours Inc. — Siargao Island, Philippines<br/>
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;
}
