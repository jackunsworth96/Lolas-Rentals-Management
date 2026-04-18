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

/**
 * Escape user-supplied strings before interpolating into HTML email templates.
 * Prevents HTML injection via customer names, notes, references, etc.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

let resendClient: Resend | undefined;
function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY not set');
  }
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

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
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, ''),
    });
  } catch (err) {
    console.error('Email send failed:', err);
    // Don't throw — email failure should never break the main flow
  }
}

// Re-export all template builders so existing import paths
// (`import { bookingConfirmationHtml, ... } from '../services/email.js'`)
// keep working unchanged.
export {
  bookingConfirmationHtml,
  waiverConfirmationHtml,
  waiverReminderHtml,
  postRentalThankYouHtml,
  extendConfirmationHtml,
  bookingCancellationHtml,
  transferBookingConfirmationHtml,
} from './email-templates/customer.js';

export {
  walkInStaffAlertHtml,
  bookingStaffAlertHtml,
} from './email-templates/staff.js';

export { driverNotificationHtml } from './email-templates/driver.js';

export {
  maintenanceLogHtml,
  inspectionLogHtml,
} from './email-templates/maintenance.js';
