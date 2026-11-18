import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  username: string;
  employeeId: string;
  roleId: string;
  storeIds: string[];
  permissions: string[];
  /** Missing on tokens issued before person types existed; treat as 'staff'. */
  personType?: 'staff' | 'owner' | 'developer' | 'counter';
}

export function isStaffToken(payload: Pick<TokenPayload, 'personType'> | undefined): boolean {
  return (payload?.personType ?? 'staff') === 'staff';
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch {
    return null;
  }
}
