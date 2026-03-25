export interface AuthUser {
  employeeId: string;
  fullName: string;
  storeId: string | null;
  role: string | null;
  permissions: string[];
}

export interface AuthResult {
  success: boolean;
  user: AuthUser | null;
  token: string | null;
  error: string | null;
}

export interface TokenPayload {
  sub: string;
  storeId: string | null;
  role: string | null;
  iat: number;
  exp: number;
}

export interface AuthPort {
  authenticate(employeeId: string, pin: string): Promise<AuthResult>;
  hashPin(pin: string): Promise<string>;
  verifyPin(pin: string, hash: string): Promise<boolean>;
  generateToken(user: AuthUser): Promise<string>;
  verifyToken(token: string): Promise<TokenPayload | null>;
}
