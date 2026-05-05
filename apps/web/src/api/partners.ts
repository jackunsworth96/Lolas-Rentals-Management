import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export type PartnerDealType = 'commission' | 'discount' | 'free_delivery' | 'combined';
export type PartnerDiscountType = 'percentage' | 'fixed';
export type PartnerStatus = 'active' | 'pending' | 'rejected';

export interface AccommodationPartner {
  id: string;
  store_id: string;
  name: string;
  slug: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  commission_type: 'fixed' | 'percentage';
  commission_value: number;
  advance_booking_days: number;
  commission_includes_extensions: boolean;
  active: boolean;
  status: PartnerStatus;
  deal_type: PartnerDealType;
  discount_type: PartnerDiscountType | null;
  discount_value: number | null;
  free_delivery: boolean;
  advance_discount_days: number | null;
  logo_url: string | null;
  early_bird_days: number | null;
  early_bird_discount_value: number | null;
  notes: string | null;
  telegram_chat_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerEnrollmentDetails {
  partner_id: string;
  property_type: string | null;
  room_count: number | null;
  star_rating: string | null;
  guest_profile: string | null;
  avg_length_of_stay: string | null;
  monthly_occupancy_pct: number | null;
  existing_vehicle_provider: string | null;
  estimated_vehicles_per_month: number | null;
  peak_seasons: string | null;
  rental_type_preference: string | null;
  has_concierge: boolean | null;
  wants_printed_materials: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerBookingRow {
  id: string;
  orderReference: string | null;
  customerName: string | null;
  pickupDatetime: string | null;
  dropoffDatetime: string | null;
  rentalValue: number;
  bookingValue: number;
  commissionBase: number | null;
  status: string;
  bookedAt: string;
  advanceDays: number | null;
  commissionable: boolean;
  commissionAmount: number;
}

export interface PartnerStats {
  totalBookings: number;
  commissionableBookings: number;
  totalCommission: number;
  bookings: PartnerBookingRow[];
}

export type PartnerInput = Omit<AccommodationPartner, 'id' | 'created_at' | 'updated_at'>;

export function usePartners(storeId?: string) {
  const params = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return useQuery<AccommodationPartner[]>({
    queryKey: ['partners', storeId],
    queryFn: () => api.get<AccommodationPartner[]>(`/partners${params}`),
    staleTime: 60_000,
  });
}

export function usePartnerEnrollmentDetails(partnerId: string | null) {
  return useQuery<PartnerEnrollmentDetails | null>({
    queryKey: ['partner-enrollment-details', partnerId],
    queryFn: () => api.get<PartnerEnrollmentDetails | null>(`/partners/${partnerId}/enrollment-details`),
    enabled: !!partnerId,
    staleTime: 60_000,
  });
}

export function usePartnerStats(partnerId: string, month?: string, enabled = true) {
  const params = month ? `?month=${encodeURIComponent(month)}` : '';
  return useQuery<PartnerStats>({
    queryKey: ['partners', partnerId, 'stats', month],
    queryFn: () => api.get<PartnerStats>(`/partners/${partnerId}/stats${params}`),
    staleTime: 60_000,
    enabled,
  });
}

export function useCreatePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PartnerInput) => api.post<AccommodationPartner>('/partners', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partners'] }),
  });
}

export function useUpdatePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<PartnerInput> & { id: string }) =>
      api.put<AccommodationPartner>(`/partners/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partners'] }),
  });
}

export function useApprovePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<PartnerInput> & { id: string }) =>
      api.post<AccommodationPartner>(`/partners/${id}/approve`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partners'] }),
  });
}

export function useRejectPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | null }) =>
      api.post<{ success: true }>(`/partners/${id}/reject`, { reason: reason ?? null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partners'] }),
  });
}

export function useDeletePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/partners/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partners'] }),
  });
}

export interface MonthlyReportResult {
  totalBookings: number;
  commissionableBookings: number;
  totalCommission: number;
}

export function useSendMonthlyReport() {
  return useMutation({
    mutationFn: ({ id, month }: { id: string; month?: string }) =>
      api.post<MonthlyReportResult>(`/partners/${id}/send-monthly-report`, { month }),
  });
}

// ── Public benefit lookup (no auth) ───────────────────────────────────────────

export interface PublicPartnerBenefit {
  name: string;
  dealType: PartnerDealType;
  discountType: PartnerDiscountType | null;
  discountValue: number | null;
  freeDelivery: boolean;
  advanceDiscountDays: number | null;
  earlyBirdDays: number | null;
  earlyBirdDiscountValue: number | null;
  logoUrl: string | null;
  welcomeMessage: string | null;
}

export async function fetchPublicPartnerBenefit(slug: string): Promise<PublicPartnerBenefit | null> {
  if (!slug) return null;
  try {
    return await api.get<PublicPartnerBenefit>(`/partners/public/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}
