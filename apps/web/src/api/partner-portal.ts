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
  deal_type: 'commission' | 'discount' | 'free_delivery' | 'combined' | 'commission_delivery' | 'discount_delivery';
  logo_url: string | null;
  welcome_message: string | null;
  portal_subdomain: string | null;
  commission_type: 'fixed' | 'percentage';
  commission_value: number;
  advance_booking_days: number;
  commission_includes_extensions: boolean;
  free_delivery: boolean;
  free_delivery_location_ids: number[] | null;
}

export interface PartnerReportBooking {
  id: string;
  orderReference: string | null;
  customerName: string | null;
  vehicleModelId: string | null;
  pickupDatetime: string | null;
  dropoffDatetime: string | null;
  status: string;
  advanceDays: number | null;
  commissionable: boolean;
  commissionAmount: number;
  commissionBase: number | null;
  commissionType: 'fixed' | 'percentage' | null;
  commissionValue: number | null;
  isExtended: boolean;
  extendedDropoffDatetime: string | null;
  pendingCommissionAmount: number;
}

export interface PartnerReport {
  totalBookings: number;
  commissionableBookings: number;
  totalCommission: number;
  totalPendingCommission: number;
  totalVehiclesRented: number;
  averageVehiclesPerDay: number;
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

export interface ModelPricingTier {
  id: number | string;
  modelId: string;
  storeId: string;
  minDays: number;
  maxDays: number;
  dailyRate: number;
}

export interface PartnerQuoteAddonLine {
  id: number;
  name: string;
  type: 'per_day' | 'one_time';
  unitPrice: number;
  total: number;
}

export interface PartnerQuote {
  rentalDays: number;
  dailyRate: number;
  originalRentalSubtotal: number;
  rentalSubtotal: number;
  effectiveRentalSubtotal: number;
  pickupFee: number;
  dropoffFee: number;
  originalPickupFee: number;
  originalDropoffFee: number;
  effectivePickupFee: number;
  effectiveDropoffFee: number;
  rentalDiscount: number;
  deliveryDiscount: number;
  addons: PartnerQuoteAddonLine[];
  addonsTotal: number;
  securityDeposit: number;
  grandTotal: number;
  grandTotalWithFees: number;
}

export interface PartnerBookingInput {
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  vehicleModelId: string;
  vehicles?: Array<{ vehicleModelId: string; driverName?: string | null }>;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId: number;
  dropoffLocationId: number;
  addonIds?: number[];
  accommodationName?: string;
  extraComments?: string;
  roomReference?: string;
}

export interface PartnerBookingResult {
  id: string;
  orderReference: string;
  groupRef: string;
  bookings: Array<{
    id: string;
    orderReference: string;
    vehicleModelId: string;
    driverName: string;
  }>;
}

export function usePartnerLogin() {
  return useMutation({
    meta: { suppressGlobalErrorBanner: true },
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
      partnerRequest<PartnerBookingResult>('/partner/book', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner', 'report'] });
      qc.invalidateQueries({ queryKey: ['partner', 'availability'] });
    },
  });
}

export function usePartnerQuote(input: {
  vehicleModelId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId: number;
  dropoffLocationId: number;
  addonIds?: number[];
  enabled?: boolean;
}) {
  return useQuery<PartnerQuote>({
    queryKey: ['partner', 'quote', input.vehicleModelId, input.pickupDatetime, input.dropoffDatetime, input.pickupLocationId, input.dropoffLocationId, input.addonIds ?? []],
    queryFn: () => {
      const params = new URLSearchParams({
        vehicleModelId: input.vehicleModelId,
        pickupDatetime: input.pickupDatetime,
        dropoffDatetime: input.dropoffDatetime,
        pickupLocationId: String(input.pickupLocationId),
        dropoffLocationId: String(input.dropoffLocationId),
      });
      if (input.addonIds && input.addonIds.length > 0) params.set('addonIds', input.addonIds.join(','));
      return partnerRequest<PartnerQuote>(`/partner/quote?${params.toString()}`);
    },
    enabled: input.enabled !== false && !!input.vehicleModelId && !!input.pickupDatetime && !!input.dropoffDatetime && !!input.pickupLocationId && !!input.dropoffLocationId,
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

export async function fetchPublicModelPricing(storeId: string, vehicleModelId: string): Promise<ModelPricingTier[]> {
  const params = new URLSearchParams({ storeId, vehicleModelId });
  const res = await fetch(`${BASE_URL}/public/booking/model-pricing?${params.toString()}`);
  const json = await res.json() as ApiResponse<{ tiers: ModelPricingTier[] }>;
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Failed to load pricing');
  return json.data?.tiers ?? [];
}
