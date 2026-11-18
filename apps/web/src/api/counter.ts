import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client.js';

export interface CounterModel {
  modelId: string;
  modelName: string;
  availableCount: number;
  dailyRate: number | null;
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

export interface CounterBookingPayload {
  vehicleModelId: string;
  days: number;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
}

export function useCounterOptions(days: number, enabled: boolean) {
  return useQuery({
    queryKey: ['counter-options', days],
    queryFn: () => api.get<CounterOptions>(`/counter/options?days=${days}`),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useCreateCounterBooking() {
  return useMutation({
    mutationFn: (body: CounterBookingPayload) => api.post<{ orderReference: string }>('/counter/bookings', body),
  });
}
