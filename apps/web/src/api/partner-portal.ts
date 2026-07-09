import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { normalizeApiBase } from './normalize-api-base.js';
import { usePartnerAuthStore, type PartnerAuthUser } from '../stores/partner-auth-store.js';

const BASE_URL = normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function partnerRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = usePartnerAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (response.status === 401) {
    usePartnerAuthStore.getState().logout();
  }
  const json = await response.json() as ApiResponse<T>;
  if (!response.ok || !json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data as T;
}

export interface PartnerProfile {
  id: string;
  slug: string;
  name: string;
  store_id: string;
  logo_url: string | null;
  welcome_message: string | null;
  portal_subdomain: string | null;
  commission_type: 'fixed' | 'percentage';
  commission_value: number;
  advance_booking_days: number;
  commission_includes_extensions: boolean;
}

export interface PartnerReportBooking {
  id: string;
  orderReference: string | null;
  customerName: string | null;
  pickupDatetime: string | null;
  status: string;
  advanceDays: number | null;
  commissionable: boolean;
  commissionAmount: number;
  commissionBase: number | null;
}

export interface PartnerReport {
  totalBookings: number;
  commissionableBookings: number;
  totalCommission: number;
  bookings: PartnerReportBooking[];
}

export interface AvailabilityModel {
  modelId: string;
  modelName: string;
  availableCount: number;
  totalCount: number;
}

export interface PublicModel {
  id: string;
  name: string;
  minDailyRate: number | null;
}

export interface PublicLocation {
  id: number;
  name: string;
  deliveryCost: number;
  collectionCost: number;
  locationType: string | null;
}

export interface PublicAddon {
  id: number | string;
  name: string;
  pricePerDay: number;
  priceOneTime: number;
  addonType: 'per_day' | 'one_time';
  mutualExclusivityGroup: string | null;
  isActive: boolean;
}

export interface PartnerBookingInput {
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  vehicleModelId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId: number;
  dropoffLocationId: number;
  addonIds?: number[];
  accommodationName?: string;
  extraComments?: string;
  roomReference?: string;
}

export function usePartnerLogin() {
  return useMutation({
    mutationFn: (body: { partnerSlug: string; username: string; pin: string }) =>
      partnerRequest<{ token: string; user: PartnerAuthUser; partner: { id: string; slug: string; name: string; storeId: string } }>('/partner-auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function usePartnerMe() {
  return useQuery({
    queryKey: ['partner', 'me'],
    queryFn: () => partnerRequest<{ user: PartnerAuthUser; partner: PartnerProfile }>('/partner/me'),
  });
}

export function usePartnerAvailability(pickupDatetime: string, dropoffDatetime: string) {
  const params = new URLSearchParams({ pickupDatetime, dropoffDatetime });
  return useQuery<AvailabilityModel[]>({
    queryKey: ['partner', 'availability', pickupDatetime, dropoffDatetime],
    queryFn: () => partnerRequest<AvailabilityModel[]>(`/partner/availability?${params.toString()}`),
    enabled: !!pickupDatetime && !!dropoffDatetime,
  });
}

export function usePartnerReport(month: string) {
  return useQuery<PartnerReport>({
    queryKey: ['partner', 'report', month],
    queryFn: () => partnerRequest<PartnerReport>(`/partner/reports?month=${encodeURIComponent(month)}`),
    enabled: !!month,
  });
}

export function usePartnerBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PartnerBookingInput) =>
      partnerRequest<{ id: string; orderReference: string }>('/partner/book', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner', 'report'] });
      qc.invalidateQueries({ queryKey: ['partner', 'availability'] });
    },
  });
}

export async function fetchPublicModels(storeId: string): Promise<PublicModel[]> {
  const res = await fetch(`${BASE_URL}/public/booking/models?storeId=${encodeURIComponent(storeId)}`);
  const json = await res.json() as ApiResponse<PublicModel[]>;
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Failed to load models');
  return json.data ?? [];
}

export async function fetchPublicLocations(storeId: string): Promise<PublicLocation[]> {
  const res = await fetch(`${BASE_URL}/public/booking/locations?storeId=${encodeURIComponent(storeId)}`);
  const json = await res.json() as ApiResponse<PublicLocation[]>;
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Failed to load locations');
  return json.data ?? [];
}

export async function fetchPublicAddons(storeId: string, vehicleModelId?: string): Promise<PublicAddon[]> {
  const params = new URLSearchParams({ storeId });
  if (vehicleModelId) params.set('vehicleModelId', vehicleModelId);
  const res = await fetch(`${BASE_URL}/public/booking/addons?${params.toString()}`);
  const json = await res.json() as ApiResponse<PublicAddon[]>;
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Failed to load add-ons');
  return json.data ?? [];
}
