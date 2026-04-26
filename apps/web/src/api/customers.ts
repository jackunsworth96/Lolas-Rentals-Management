import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface PendingWaiver {
  id: string;
  driver_name: string;
  driver_email: string | null;
  status: string;
  created_at: string;
}

export interface PendingInspection {
  id: string;
  vehicle_name: string | null;
  order_reference: string | null;
  status: string;
  created_at: string;
}

export interface CustomerPendingCheckin {
  waivers: PendingWaiver[];
  inspections: PendingInspection[];
}

export interface CustomerSummary {
  id: string;
  storeId: string;
  name: string;
  email: string | null;
  mobile: string | null;
  totalSpent: number;
  totalBookings?: number;
  notes: string | null;
  blacklisted: boolean;
}

export interface CustomerOrder {
  id: string;
  orderDate: string;
  status: string;
  finalTotal: number;
  balanceDue: number;
  vehicleNames: string;
}

export interface CustomerPawCard {
  totalSaved: number;
  entryCount: number;
  hasPawCard: boolean;
}

export interface CustomerDetail {
  customer: CustomerSummary;
  orders: CustomerOrder[];
  pawCard: CustomerPawCard;
}

export function useCustomers(storeId: string, query: string) {
  const params = new URLSearchParams({ storeId });
  if (query) params.set('q', query);
  return useQuery<CustomerSummary[]>({
    queryKey: ['customers', storeId, query],
    queryFn: () => api.get(`/customers?${params.toString()}`),
    enabled: !!storeId,
  });
}

export function useCustomer(id: string | null) {
  return useQuery<CustomerDetail>({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/customers/${id}`),
    enabled: !!id,
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch(`/customers/${id}`, body),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['customer', variables.id] });
    },
  });
}

export function useCustomerPendingCheckin(customerId: string | null) {
  return useQuery<CustomerPendingCheckin>({
    queryKey: ['customer-pending-checkin', customerId],
    queryFn: () => api.get(`/customers/${customerId}/pending-checkin`),
    enabled: !!customerId,
  });
}

export function useLookupOrCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; name: string; mobile?: string; storeId: string }) =>
      api.post<{ customer: CustomerSummary; isNew: boolean }>('/customers/lookup-or-create', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
