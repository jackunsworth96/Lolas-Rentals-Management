import { describe, expect, it } from 'vitest';
import { normalizePublicWebOrigin, publicWebOriginFromEnv } from '../src/lib/public-web-url.js';

describe('public web links', () => {
  it.each([
    'https://lolas-rentals-management-web.vercel.app',
    'http://lolas-rentals-management-web.vercel.app/',
    ' lolas-rentals-management-web.vercel.app/ ',
    'https://https://lolas-rentals-management-web.vercel.app/',
  ])('uses the customer domain for the legacy production origin %s', (origin) => {
    expect(`${publicWebOriginFromEnv(origin)}/waiver/LR-0625-A1B2`).toBe(
      'https://www.lolasrentals.com/waiver/LR-0625-A1B2',
    );
    expect(normalizePublicWebOrigin(origin)).toBe('https://www.lolasrentals.com');
  });

  it.each([undefined, '', ' '])('defaults to the customer domain when WEB_URL is %s', (origin) => {
    expect(publicWebOriginFromEnv(origin)).toBe('https://www.lolasrentals.com');
  });

  it.each([
    ['https://www.lolasrentals.com/', 'https://www.lolasrentals.com'],
    ['http://localhost:3002/', 'http://localhost:3002'],
    ['https://lolas-rentals-management-web-preview.vercel.app/', 'https://lolas-rentals-management-web-preview.vercel.app'],
    ['example.com/', 'https://example.com'],
  ])('preserves other configured origins %s', (input, expected) => {
    expect(publicWebOriginFromEnv(input)).toBe(expected);
  });

  it('preserves an explicit development fallback', () => {
    expect(publicWebOriginFromEnv(undefined, 'http://localhost:3002/')).toBe('http://localhost:3002');
  });
});
