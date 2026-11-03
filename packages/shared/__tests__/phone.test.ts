import { describe, expect, it } from 'vitest';
import {
  formatWhatsAppNumber,
  isValidWhatsAppE164,
  normalizeWhatsAppNumber,
  suggestWhatsAppFix,
  whatsAppLinkDigits,
} from '../src/utils/phone.js';

function e164(raw: string, options?: Parameters<typeof normalizeWhatsAppNumber>[1]) {
  const result = normalizeWhatsAppNumber(raw, options);
  return result.ok ? result.e164 : null;
}

describe('normalizeWhatsAppNumber', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['0917 123 4567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['+63 917-123-4567', '+639171234567'],
    ['whatsapp:+639171234567', '+639171234567'],
  ])('normalises Philippine form %s', (raw, expected) => {
    expect(e164(raw)).toBe(expected);
  });

  it('handles international numbers with + or 00', () => {
    expect(e164('+49 1522 8502404')).toBe('+4915228502404');
    expect(e164('0049 1522 8502404')).toBe('+4915228502404');
    expect(e164('+44 7911 123456')).toBe('+447911123456');
  });

  it('keeps the + when a pasted number carries invisible formatting characters', () => {
    expect(normalizeWhatsAppNumber('\u202A+44 7911 123456\u202C')).toMatchObject({
      ok: true,
      e164: '+447911123456',
      recovered: false,
    });
  });

  it('uses the selected country for national numbers', () => {
    expect(e164('01522 8502404', { defaultCountry: 'DE' })).toBe('+4915228502404');
  });

  it('rejects the Moritz case in strict mode instead of guessing +63', () => {
    expect(normalizeWhatsAppNumber('04915228502404')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('recovers the Moritz case when recovery is allowed', () => {
    const result = normalizeWhatsAppNumber('04915228502404', { allowRecovery: true });
    expect(result).toMatchObject({ ok: true, e164: '+4915228502404', country: 'DE', recovered: true });
  });

  it('recovers the mangled +63 version of a foreign number', () => {
    expect(suggestWhatsAppFix('+634915228502404')).toBeNull();
    expect(e164('4915228502404', { allowRecovery: true })).toBe('+4915228502404');
  });

  it('rejects garbage and empty input', () => {
    expect(normalizeWhatsAppNumber('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeWhatsAppNumber('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeWhatsAppNumber('abc')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeWhatsAppNumber('12345', { allowRecovery: true })).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('isValidWhatsAppE164', () => {
  it('accepts only normalised valid numbers', () => {
    expect(isValidWhatsAppE164('+639171234567')).toBe(true);
    expect(isValidWhatsAppE164('+4915228502404')).toBe(true);
    expect(isValidWhatsAppE164('09171234567')).toBe(false);
    expect(isValidWhatsAppE164('+63 917 123 4567')).toBe(false);
    expect(isValidWhatsAppE164('+634915228502404')).toBe(false);
    expect(isValidWhatsAppE164(null)).toBe(false);
  });
});

describe('helpers', () => {
  it('suggests a fix for the stored Moritz number', () => {
    expect(suggestWhatsAppFix('04915228502404')).toBe('+4915228502404');
    expect(suggestWhatsAppFix('+639171234567')).toBeNull();
  });

  it('formats and builds wa.me digits', () => {
    expect(formatWhatsAppNumber('+4915228502404')).toBe('+49 1522 8502404');
    expect(whatsAppLinkDigits('+4915228502404')).toBe('4915228502404');
    expect(whatsAppLinkDigits('04915228502404')).toBeNull();
  });
});
