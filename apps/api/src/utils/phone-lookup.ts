const RESPOND_PHONE_PREFIX = /^(?:whatsapp|phone|tel):/i;

export function phoneDigits(raw: string): string {
  return raw.trim().replace(RESPOND_PHONE_PREFIX, '').replace(/\D/g, '');
}

/**
 * Exact variants commonly found in imported/customer-entered phone fields.
 * International numbers retain their country code; Philippine numbers also
 * include the usual local forms used by older records.
 */
export function phoneLookupVariants(raw: string): string[] {
  const trimmed = raw.trim();
  const withoutPrefix = trimmed.replace(RESPOND_PHONE_PREFIX, '').trim();
  const digits = phoneDigits(raw);
  if (!digits) return [trimmed].filter(Boolean);

  const internationalDigits = digits.startsWith('00') ? digits.slice(2) : digits;
  const variants = new Set<string>([
    trimmed,
    withoutPrefix,
    digits,
    internationalDigits,
    `+${internationalDigits}`,
    `00${internationalDigits}`,
  ]);

  let philippineLocal: string | null = null;
  if (/^639\d{9}$/.test(internationalDigits)) philippineLocal = internationalDigits.slice(2);
  else if (/^09\d{9}$/.test(internationalDigits)) philippineLocal = internationalDigits.slice(1);
  else if (/^9\d{9}$/.test(internationalDigits)) philippineLocal = internationalDigits;

  if (philippineLocal) {
    variants.add(`+63${philippineLocal}`);
    variants.add(`63${philippineLocal}`);
    variants.add(`0${philippineLocal}`);
    variants.add(philippineLocal);
  }

  return [...variants].filter(Boolean);
}

/**
 * PostgREST ILIKE pattern for a formatting-insensitive fallback. Nine trailing
 * digits match E.164 and national forms (for example +31 6... versus 06...)
 * while remaining specific enough to avoid realistic cross-customer matches.
 */
export function phoneSuffixIlikePattern(raw: string): string | null {
  const digits = phoneDigits(raw);
  if (digits.length < 9) return null;
  return `%${digits.slice(-9).split('').join('%')}%`;
}
