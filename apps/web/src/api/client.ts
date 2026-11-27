import { useAuthStore, type AuthUser } from '../stores/auth-store.js';
import { normalizeApiBase } from './normalize-api-base.js';
import { useUIStore } from '../stores/ui-store.js';

const BASE_URL = normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);

/** Thrown when the API returns `success: false` or a non-OK status with a JSON body. */
export class ApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

function isAuthLoginPath(path: string): boolean {
  return path === '/auth/login' || path.startsWith('/auth/login?');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = String(options.method ?? 'GET').toUpperCase();
  if (useUIStore.getState().archiveMode && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !isAuthLoginPath(path)) {
    throw new ApiError('Archived stores are read-only', 'STORE_ARCHIVED');
  }
  const token = useAuthStore.getState().token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (isAuthLoginPath(path)) {
      let json: ApiResponse<T>;
      try {
        json = await response.json();
      } catch {
        throw new Error('Invalid credentials');
      }
      throw new Error(json.error?.message ?? 'Invalid credentials');
    }
    useAuthStore.getState().logout();
    throw new Error('Session expired');
  }

  let json: ApiResponse<T>;
  try {
    json = await response.json();
  } catch {
    throw new Error(response.ok ? 'Invalid response' : `Request failed: ${response.status} ${response.statusText}`);
  }

  const accessVersion = response.headers.get(PERMISSIONS_VERSION_HEADER);
  if (accessVersion && path !== ME_PATH) noteAccessVersion(accessVersion);

  if (!response.ok || !json.success) {
    throw new ApiError(json.error?.message ?? 'Request failed', json.error?.code, json.error?.details);
  }

  return json.data as T;
}

const PERMISSIONS_VERSION_HEADER = 'X-Permissions-Version';
const ME_PATH = '/auth/me';
let accessRefresh: Promise<void> | null = null;

/** Re-read the signed-in user's permissions so role changes apply without logging out. */
export function refreshAccess(): Promise<void> {
  if (!useAuthStore.getState().token) return Promise.resolve();
  accessRefresh ??= request<{ user: AuthUser }>(ME_PATH)
    .then(({ user }) => useAuthStore.getState().updateUser(user))
    .catch(() => undefined)
    .finally(() => { accessRefresh = null; });
  return accessRefresh;
}

function noteAccessVersion(version: string): void {
  const current = useAuthStore.getState().user?.permissionsVersion;
  if (current !== version) void refreshAccess();
}

async function uploadRequest<T>(path: string, body: FormData): Promise<T> {
  if (useUIStore.getState().archiveMode) {
    throw new ApiError('Archived stores are read-only', 'STORE_ARCHIVED');
  }
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, { method: 'POST', body, headers });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Session expired');
  }

  let json: ApiResponse<T>;
  try {
    json = await response.json();
  } catch {
    throw new Error(response.ok ? 'Invalid response' : `Request failed: ${response.status} ${response.statusText}`);
  }

  if (!response.ok || !json.success) {
    throw new ApiError(json.error?.message ?? 'Request failed', json.error?.code);
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', ...(body != null ? { body: JSON.stringify(body) } : {}) }),
  /** POST multipart/form-data — does NOT set Content-Type so the browser supplies the correct boundary. */
  upload: <T>(path: string, body: FormData) => uploadRequest<T>(path, body),
};
