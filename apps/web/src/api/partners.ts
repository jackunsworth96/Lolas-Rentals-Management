import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

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
  notes: string | null;
  telegram_chat_id: string | null;
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
