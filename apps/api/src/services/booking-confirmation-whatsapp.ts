import { logger } from '../lib/logger.js';
import { sendWhatsAppTemplate } from './whatsapp-template.js';

const WHATSAPP_BOOKING_TEMPLATE_NAME = process.env.WHATSAPP_BOOKING_TEMPLATE_NAME ?? 'booking_recieved';
const WHATSAPP_BOOKING_TEMPLATE_LANGUAGE = process.env.WHATSAPP_BOOKING_TEMPLATE_LANGUAGE ?? 'en';
export const WHATSAPP_BOOKING_TEMPLATE_BODY = [
  "Hi {{1}}, your Lola's Rentals booking is confirmed.",
  '',
  'Reference: {{2}}',
  'Vehicle: {{3}}',
  'Pickup: {{4}} - {{5}}',
  'Return: {{6}} - {{7}}',
  '',
  'Please complete your waiver before pickup: {{8}}',
  'We have also sent the full confirmation to your email.',
].join('\n');

export interface BookingConfirmationWhatsAppInput {
  customerName: string;
  customerMobile: string;
  orderReference: string;
  vehicleName: string;
  /** Already formatted for display (Manila time). */
  pickupDatetime: string;
  /** Already formatted for display (Manila time). */
  dropoffDatetime: string;
  pickupLocation: string;
  dropoffLocation: string;
  waiverUrl: string;
  source: string;
}

export function buildBookingTemplateParameters(input: BookingConfirmationWhatsAppInput): string[] {
  const firstName = input.customerName.trim().split(/\s+/)[0] || input.customerName;
  return [
    firstName,
    input.orderReference,
    input.vehicleName,
    input.pickupDatetime,
    input.pickupLocation,
    input.dropoffDatetime,
    input.dropoffLocation,
    input.waiverUrl,
  ];
}

/** Fire-and-forget: failures are logged, never thrown. */
export function sendBookingConfirmationWhatsApp(input: BookingConfirmationWhatsAppInput): void {
  if (!input.customerMobile) return;
  void sendWhatsAppTemplate({
    operationKey: `booking:${input.orderReference}`,
    phone: input.customerMobile,
    templateName: WHATSAPP_BOOKING_TEMPLATE_NAME,
    languageCode: WHATSAPP_BOOKING_TEMPLATE_LANGUAGE,
    bodyText: WHATSAPP_BOOKING_TEMPLATE_BODY,
    parameters: buildBookingTemplateParameters(input),
    logContext: { orderReference: input.orderReference, source: input.source },
    failureContext: {
      automation: 'booking_confirmation',
      bookingReference: input.orderReference,
      customerName: input.customerName,
    },
  }).catch((err: unknown) => {
    logger.warn(
      {
        err,
        orderReference: input.orderReference,
        phoneLast4: input.customerMobile.replace(/\D/g, '').slice(-4),
      },
      '[whatsapp-booking-confirmation] send failed',
    );
  });
}
