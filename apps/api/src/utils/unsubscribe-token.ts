import { createHmac, timingSafeEqual } from 'crypto';

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET env var is not set');
  return secret;
}

function sign(customerId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(customerId)
    .digest('base64url');
}

/**
 * Creates an HMAC-SHA256 token for one-click email unsubscribe links.
 * Format: {customerId}.{base64url-signature}
 */
export function generateUnsubscribeToken(customerId: string): string {
  const signature = sign(customerId, getSecret());
  return `${customerId}.${signature}`;
}

/**
 * Verifies an unsubscribe token using a timing-safe comparison.
 * Returns the customerId if valid, null otherwise.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const customerId = token.slice(0, dotIndex);
  const providedSig = token.slice(dotIndex + 1);

  if (!customerId || !providedSig) return null;

  let expectedSig: string;
  try {
    expectedSig = sign(customerId, getSecret());
  } catch {
    return null;
  }

  try {
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  return customerId;
}
