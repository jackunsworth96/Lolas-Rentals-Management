import { useAuthStore } from '../stores/auth-store.js';
import { normalizeApiBase } from './normalize-api-base.js';

const BASE_URL = normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);

/** Thrown when the API returns `success: false` or a non-OK status with a JSON body. */
export class ApiError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
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

  if (!response.ok || !json.success) {
    throw new ApiError(json.error?.message ?? 'Request failed', json.error?.code);
  }

  return json.data as T;
}

async function uploadRequest<T>(path: string, body: FormData): Promise<T> {
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
