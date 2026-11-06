import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: vi.fn() }));

const { visitorKeyFor } = await import('../src/lib/demand-misses.js');

function fakeRequest(ip: string, ua = 'Mozilla/5.0'): Request {
  return { ip, socket: { remoteAddress: ip }, get: () => ua } as unknown as Request;
}

describe('visitorKeyFor', () => {
  it('keys on the browser visitor ID, ignoring the proxy IP it arrived through', () => {
    const id = '3f2b6c1e-8a4d-4f0e-9b7a-2c5d1e6f7a8b';
    expect(visitorKeyFor(fakeRequest('76.76.21.1'), id)).toBe(visitorKeyFor(fakeRequest('76.76.21.99'), id));
  });

  it('gives different visitors different keys', () => {
    const req = fakeRequest('76.76.21.1');
    expect(visitorKeyFor(req, 'visitor-aaaaaaaa')).not.toBe(visitorKeyFor(req, 'visitor-bbbbbbbb'));
  });

  it('falls back to IP and user agent when no visitor ID is sent', () => {
    expect(visitorKeyFor(fakeRequest('1.2.3.4'))).toBe(visitorKeyFor(fakeRequest('1.2.3.4')));
    expect(visitorKeyFor(fakeRequest('1.2.3.4'))).not.toBe(visitorKeyFor(fakeRequest('5.6.7.8')));
  });
});
