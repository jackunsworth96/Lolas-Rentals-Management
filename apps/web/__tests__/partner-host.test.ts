/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { partnerSlugFromHost } from '../src/utils/partnerHost.js';

describe('partnerHost', () => {
  it('extracts a partner slug from a partner subdomain', () => {
    expect(partnerSlugFromHost('bravo.lolasrentals.com')).toBe('bravo');
  });

  it('ignores normal app hostnames', () => {
    expect(partnerSlugFromHost('lolasrentals.com')).toBeNull();
    expect(partnerSlugFromHost('www.lolasrentals.com')).toBeNull();
    expect(partnerSlugFromHost('api.lolasrentals.com')).toBeNull();
  });
});
