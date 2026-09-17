import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  authenticatePawCardAccess,
  generatePawCardAccessToken,
  verifyPawCardAccessToken,
} from '../src/auth/paw-card-access.js';

describe('Paw Card customer access tokens', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-at-least-thirty-two-characters';
  });

  it('normalizes identity and verifies a scoped token', () => {
    const token = generatePawCardAccessToken({
      email: ' Customer@Example.com ',
      customerId: 'customer-1',
      customerName: 'Test Customer',
    });

    expect(verifyPawCardAccessToken(token)).toEqual({
      scope: 'paw-card:customer',
      email: 'customer@example.com',
      customerId: 'customer-1',
      customerName: 'Test Customer',
    });
  });

  it('rejects a JWT that is not scoped and addressed to Paw Card customers', () => {
    const staffLikeToken = jwt.sign(
      { userId: 'staff-1', scope: 'staff' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' },
    );

    expect(verifyPawCardAccessToken(staffLikeToken)).toBeNull();
  });

  it('returns 401 when the Paw Card token is missing', () => {
    const status = vi.fn(() => ({ json }));
    const json = vi.fn();
    const next = vi.fn();

    authenticatePawCardAccess(
      { headers: {} } as never,
      { status } as never,
      next,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
