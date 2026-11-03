import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/mobile';

export { AsYouType, getCountries, getCountryCallingCode };
export type { CountryCode };

export const DEFAULT_WHATSAPP_COUNTRY: CountryCode = 'PH';

export type WhatsAppNumberResult =
  | { ok: true; e164: string; country: CountryCode | undefined; recovered: boolean }
  | { ok: false; reason: 'empty' | 'invalid' };

export interface NormalizeWhatsAppOptions {
  /** Country used when the number has no international prefix. Defaults to PH. */
  defaultCountry?: CountryCode;
  /**
   * Also try reading a prefix-less number as international (e.g. `04915228502404`
   * → `+4915228502404`). Only for repairing legacy data — never for live form input,
   * where the customer should pick the right country instead.
   */
  allowRecovery?: boolean;
}

const CHANNEL_PREFIX = /^(?:whatsapp|phone|tel):/i;

function cleanInput(raw: string): string {
  const trimmed = raw.trim().replace(CHANNEL_PREFIX, '');
  // Strips invisible bidi/format characters that copy-pasted numbers often carry.
  const hasPlus = trimmed.replace(/[^\d+]/g, '').startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (hasPlus) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  return digits;
}

function parseValid(value: string, country?: CountryCode) {
  const parsed = parsePhoneNumberFromString(value, country);
  return parsed && parsed.isValid() ? parsed : null;
}

/**
 * Normalises any customer-entered WhatsApp number to E.164 (`+<country><number>`).
 * Validation uses mobile-only metadata, so landlines and wrong-length numbers fail.
 */
export function normalizeWhatsAppNumber(
  raw: string | null | undefined,
  options: NormalizeWhatsAppOptions = {},
): WhatsAppNumberResult {
  const { defaultCountry = DEFAULT_WHATSAPP_COUNTRY, allowRecovery = false } = options;
  const cleaned = cleanInput(raw ?? '');
  if (!cleaned) return { ok: false, reason: 'empty' };

  const direct = cleaned.startsWith('+') ? parseValid(cleaned) : parseValid(cleaned, defaultCountry);
  if (direct) return { ok: true, e164: direct.number, country: direct.country, recovered: false };

  if (allowRecovery) {
    const digits = cleaned.replace(/^\+/, '');
    const withoutTrunkZero = digits.replace(/^0+/, '');
    const candidates = cleaned.startsWith('+')
      ? [`+${withoutTrunkZero}`]
      : [`+${digits}`, `+${withoutTrunkZero}`];
    for (const candidate of candidates) {
      const parsed = parseValid(candidate);
      if (parsed) return { ok: true, e164: parsed.number, country: parsed.country, recovered: true };
    }
  }

  return { ok: false, reason: 'invalid' };
}

/** True only for an already-normalised, valid E.164 mobile number. */
export function isValidWhatsAppE164(value: string | null | undefined): boolean {
  if (!value || !/^\+\d{6,15}$/.test(value)) return false;
  const parsed = parseValid(value);
  return parsed !== null && parsed.number === value;
}

/**
 * Suggests a corrected E.164 number for a stored value that is not valid E.164,
 * or null when the value is already fine or cannot be repaired confidently.
 */
export function suggestWhatsAppFix(value: string | null | undefined): string | null {
  if (!value || isValidWhatsAppE164(value)) return null;
  const result = normalizeWhatsAppNumber(value, { allowRecovery: true });
  return result.ok ? result.e164 : null;
}

/** `+49 1522 8502404` style display; falls back to the raw value. */
export function formatWhatsAppNumber(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = parsePhoneNumberFromString(value);
  return parsed ? parsed.formatInternational() : value;
}

/** Digits for a `https://wa.me/<digits>` link, or null when the number is not valid E.164. */
export function whatsAppLinkDigits(value: string | null | undefined): string | null {
  return isValidWhatsAppE164(value) ? value!.slice(1) : null;
}
