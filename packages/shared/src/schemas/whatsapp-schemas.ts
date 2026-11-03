import { z } from 'zod';
import { normalizeWhatsAppNumber } from '../utils/phone.js';

export const INVALID_WHATSAPP_NUMBER = 'INVALID_WHATSAPP_NUMBER';
export const WHATSAPP_NUMBER_ERROR_MESSAGE =
  'Enter a valid WhatsApp number including the country code, e.g. +63 917 123 4567';

function toE164(value: string, ctx: z.RefinementCtx): string {
  const result = normalizeWhatsAppNumber(value);
  if (!result.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: WHATSAPP_NUMBER_ERROR_MESSAGE,
      params: { code: INVALID_WHATSAPP_NUMBER },
    });
    return z.NEVER;
  }
  return result.e164;
}

/** Required WhatsApp number; parses to E.164. */
export const WhatsAppNumberSchema = z.string().transform(toE164);

/** Nullable WhatsApp number: blank becomes null, anything else must be valid and parses to E.164. */
export const NullableWhatsAppNumberSchema = z
  .string()
  .nullable()
  .transform((value, ctx) => (value === null || value.trim() === '' ? null : toE164(value, ctx)));

/** Optional WhatsApp number: blank becomes null, anything else must be valid and parses to E.164. */
export const OptionalWhatsAppNumberSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === '') return null;
    return toE164(value, ctx);
  });
