import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client.js';

/** Where a kiosk sends its requests: our staff counter API or a partner kiosk API. */
export interface CounterApi {
  /** Query-key prefix, so a staff and a partner kiosk never share cached data. */
  key: string;
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
  del: <T>(path: string, body?: unknown) => Promise<T>;
}

export const staffCounterApi: CounterApi = {
  key: 'counter',
  get: (path) => api.get(`/counter${path}`),
  post: (path, body) => api.post(`/counter${path}`, body),
  del: (path, body) => api.delete(`/counter${path}`, body),
};

export interface CounterModel {
  modelId: string;
  modelName: string;
  availableCount: number;
  /** For a fully booked model: the first slot it is free for the whole requested length. */
  nextFreePickup: string | null;
  dailyRate: number | null;
  rentalSubtotal: number | null;
  rentalDiscount: number;
  deliveryFee: number;
  total: number | null;
  securityDeposit: number | null;
}

export interface CounterOptions {
  storeId: string;
  rentalDays: number;
  pickupDatetime: string;
  dropoffDatetime: string;
  models: CounterModel[];
}

export type CounterAddonKind = 'peace_of_mind' | 'surf_rack' | 'bungee';

export interface CounterAddon {
  id: number;
  name: string;
  kind: CounterAddonKind;
  addonType: 'per_day' | 'one_time';
  unitPrice: number;
  total: number;
  soldOut: boolean;
}

export interface CollectionArea {
  id: number;
  name: string;
  fee: number;
}

export interface CounterExtras {
  addons: CounterAddon[];
  collectionAreas: CollectionArea[];
}

export interface CounterWindowQuery {
  days: number;
  /** Partner kiosks only: the chosen pickup slot. */
  pickupDatetime?: string | null;
  sessionToken?: string | null;
}

export interface CounterBookingPayload {
  vehicleModelId: string;
  days: number;
  pickupDatetime?: string | null;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  addonIds?: number[];
  collectionLocationId?: number | null;
  stayingAt?: string | null;
  holdId?: string | null;
  sessionToken?: string | null;
}

function queryString(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v));
  return q.toString();
}

export function useCounterOptions(counter: CounterApi, query: CounterWindowQuery, enabled: boolean) {
  return useQuery({
    queryKey: [counter.key, 'options', query.days, query.pickupDatetime ?? null, query.sessionToken ?? null],
    queryFn: () => counter.get<CounterOptions>(`/options?${queryString({ ...query })}`),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useCounterExtras(counter: CounterApi, query: CounterWindowQuery & { modelId: string | null }, enabled: boolean) {
  return useQuery({
    queryKey: [counter.key, 'extras', query.modelId, query.days, query.pickupDatetime ?? null],
    queryFn: () => counter.get<CounterExtras>(`/extras?${queryString({ ...query })}`),
    enabled: enabled && !!query.modelId,
  });
}

export function useCreateCounterBooking(counter: CounterApi) {
  return useMutation({
    mutationFn: (body: CounterBookingPayload) => counter.post<{ orderReference: string }>('/bookings', body),
  });
}

export function holdCounterVehicle(counter: CounterApi, body: CounterWindowQuery & { modelId: string; sessionToken: string }) {
  return counter.post<{ holdId: string; expiresAt: string }>('/holds', body);
}

export function releaseCounterVehicle(counter: CounterApi, holdId: string, sessionToken: string) {
  return counter.del<null>(`/holds/${encodeURIComponent(holdId)}`, { sessionToken }).catch(() => null);
}
