import { describe, expect, it } from 'vitest';
import {
  phoneDigits,
  phoneLookupVariants,
  phoneSuffixIlikePattern,
} from '../src/utils/phone-lookup.js';

describe('Respond.io phone lookup normalization', () => {
  it('removes Respond.io channel prefixes and formatting', () => {
    expect(phoneDigits('whatsapp:+31 (0)6 2464-0254')).toBe('310624640254');
  });

  it('keeps international exact variants and supports a 00 prefix', () => {
    const variants = phoneLookupVariants('phone:0031 6 24640254');
    expect(variants).toContain('+31624640254');
    expect(variants).toContain('31624640254');
    expect(variants).toContain('0031624640254');
  });

  it('preserves all Philippine E.164 and local variants', () => {
    expect(phoneLookupVariants('+63 917 123 4567')).toEqual(expect.arrayContaining([
      '+639171234567',
      '639171234567',
      '09171234567',
      '9171234567',
    ]));
  });

  it('builds a suffix match shared by international and national formats', () => {
    expect(phoneSuffixIlikePattern('+33 4 99 43 05 27')).toBe('%4%9%9%4%3%0%5%2%7%');
    expect(phoneSuffixIlikePattern('499430527')).toBe('%4%9%9%4%3%0%5%2%7%');
  });

  it('does not use broad suffix matching for short inputs', () => {
    expect(phoneSuffixIlikePattern('12345678')).toBeNull();
  });
});
