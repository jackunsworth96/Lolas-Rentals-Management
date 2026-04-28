/**
 * Sends a dummy booking-confirmation email so you can preview templates (logo, layout, etc.)
 * without creating a booking.
 *
 * Requires RESEND_API_KEY and (usually) EMAIL_FROM_CUSTOMER same as production.
 *
 * Run from repo root:
 *   npm run email:test -w apps/api -- you@example.com
 * Or from apps/api:
 *   npx tsx scripts/send-test-email.ts you@example.com
 *
 * If you omit the address, uses NOTIFICATION_EMAIL from .env.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiDir = resolve(__dirname, '..');
const monorepoRoot = resolve(__dirname, '../..');

[monorepoRoot, apiDir, process.cwd()].forEach((dir) => {
  config({ path: resolve(dir, '.env') });
});

async function main() {
  const { sendEmail, CUSTOMER_FROM_EMAIL } = await import('../src/services/email.js');
  const { bookingConfirmationHtml } = await import('../src/services/email-templates/customer.js');

  const toArg = process.argv[2]?.trim();
  const to = toArg || process.env.NOTIFICATION_EMAIL;

  if (!to) {
    console.error(
      'Pass a recipient: npx tsx scripts/send-test-email.ts you@example.com\n' +
        'Or set NOTIFICATION_EMAIL in .env.',
    );
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set (.env)');
    process.exit(1);
  }

  const html = bookingConfirmationHtml({
    customerName: 'Test Guest',
    orderReference: 'TEST-LOGO-PREVIEW',
    vehicleName: 'Scooter (Preview)',
    vehicleCount: 1,
    pickupDatetime: 'Tomorrow 09:00',
    dropoffDatetime: 'Wed 09:00',
    pickupLocation: 'Shop',
    dropoffLocation: 'Shop',
    totalAmount: 1500,
    paymentMethod: 'Card',
    addons: [{ name: 'Helmets', price: 0 }],
    charityDonation: 0,
    hasTransfer: false,
    waiverUrl: `${process.env.WEB_URL ?? 'https://example.com'}/waiver/preview`,
    whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX',
  });

  await sendEmail({
    to,
    from: CUSTOMER_FROM_EMAIL,
    subject: "[TEST] Lola's Rentals — confirmation preview",
    html,
  });

  console.log(`Sent test email to ${to} from ${CUSTOMER_FROM_EMAIL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
