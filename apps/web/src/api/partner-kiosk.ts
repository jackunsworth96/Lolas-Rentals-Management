import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useQuery } from '@tanstack/react-query';
import { normalizeApiBase } from './normalize-api-base.js';
import { ApiError } from './client.js';
import { usePartnerAuthStore } from '../stores/partner-auth-store.js';
import type { CounterApi } from './counter.js';

const BASE_URL = normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);

interface PartnerKioskState {
  token: string | null;
  setToken: (token: string | null) => void;
}

/** The front-desk tablet's own sign-in, kept apart from the portal login it was launched from. */
export const usePartnerKioskStore = create<PartnerKioskState>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => set({ token }),
    }),
    { name: 'lolas-partner-kiosk', storage: createJSONStorage(() => localStorage) },
  ),
);

async function request<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const json = await response.json().catch(() => ({})) as { success?: boolean; data?: T; error?: { code?: string; message?: string } };
  if (!response.ok || !json.success) {
    throw new ApiError(json.error?.message ?? 'Something went wrong. Please try again.', json.error?.code);
  }
  return json.data as T;
}

async function kioskRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(`/partner/kiosk${path}`, usePartnerKioskStore.getState().token, options);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'KIOSK_SIGNED_OUT') usePartnerKioskStore.getState().setToken(null);
    throw err;
  }
}

export const partnerKioskCounterApi: CounterApi = {
  key: 'partner-kiosk',
  get: (path) => kioskRequest(path),
  post: (path, body) => kioskRequest(path, { method: 'POST', body: JSON.stringify(body) }),
  del: (path, body) => kioskRequest(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};

export interface PartnerKioskBrand {
  partnerName: string;
  logoUrl: string | null;
  welcomeMessage: string | null;
  ready: boolean;
}

export function usePartnerKioskBrand(enabled: boolean) {
  return useQuery({
    queryKey: ['partner-kiosk', 'me'],
    queryFn: () => kioskRequest<PartnerKioskBrand>('/me'),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Turns this device into the front-desk tablet, using the portal login. */
export async function startPartnerKiosk(): Promise<void> {
  const { token } = await request<{ token: string }>('/partner/kiosk/start', usePartnerAuthStore.getState().token, { method: 'POST' });
  usePartnerKioskStore.getState().setToken(token);
}

export async function exitPartnerKiosk(pin: string): Promise<void> {
  await kioskRequest('/exit', { method: 'POST', body: JSON.stringify({ pin }) });
  usePartnerKioskStore.getState().setToken(null);
}
