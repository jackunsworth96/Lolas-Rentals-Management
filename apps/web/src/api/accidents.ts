import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface AccidentReport {
  id: string;
  storeId: string;
  orderId: string;
  vehicleId: string;
  customerId: string | null;
  accidentAt: string;
  location: string | null;
  description: string;
  damageDescription: string | null;
  customerInjured: boolean;
  injuryDescription: string | null;
  medicalAttention: boolean;
  emergencyServicesCalled: boolean;
  policeReportFiled: boolean;
  policeReportNumber: string | null;
  helmetsWorn: string | null;
  thirdPartyNotes: string | null;
  peaceOfMindActive: boolean | null;
  photoUrls: string[];
  customerSignatureUrl: string | null;
  additionalNotes: string | null;
  reportedByEmployeeId: string | null;
  status: 'open' | 'closed';
  tamperHash: string | null;
  hashEmailedAt: string | null;
  createdAt: string;
  // Joined fields
  fleet?: { name: string; plate_number: string } | null;
  orders?: { booking_token: string } | null;
  customers?: { name: string } | null;
  employees?: { full_name: string } | null;
}

export interface CreateAccidentBody {
  storeId: string;
  orderId: string;
  vehicleId: string;
  customerId?: string | null;
  accidentAt: string;
  location?: string | null;
  description: string;
  damageDescription?: string | null;
  customerInjured: boolean;
  injuryDescription?: string | null;
  medicalAttention: boolean;
  emergencyServicesCalled: boolean;
  policeReportFiled: boolean;
  policeReportNumber?: string | null;
  helmetsWorn?: string | null;
  thirdPartyNotes?: string | null;
  peaceOfMindActive?: boolean | null;
  photoUrls: string[];
  customerSignatureUrl?: string | null;
  additionalNotes?: string | null;
}

export function useAccidents(storeId: string, filters: { vehicleId?: string; orderId?: string; status?: string } = {}) {
  const params = new URLSearchParams({ storeId });
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId);
  if (filters.orderId) params.set('orderId', filters.orderId);
  if (filters.status) params.set('status', filters.status);

  return useQuery({
    queryKey: ['accidents', storeId, filters],
    queryFn: () => api.get<AccidentReport[]>(`/accidents?${params}`),
    enabled: !!storeId,
  });
}

export function useVehicleAccidents(vehicleId: string, storeId: string) {
  const params = new URLSearchParams({ storeId, vehicleId });
  return useQuery({
    queryKey: ['accidents', 'vehicle', vehicleId],
    queryFn: () => api.get<AccidentReport[]>(`/accidents?${params}`),
    enabled: !!vehicleId && !!storeId,
  });
}

export function useOrderAccidents(orderId: string, storeId: string) {
  const params = new URLSearchParams({ storeId, orderId });
  return useQuery({
    queryKey: ['accidents', 'order', orderId],
    queryFn: () => api.get<AccidentReport[]>(`/accidents?${params}`),
    enabled: !!orderId && !!storeId,
  });
}

export function useAccident(id: string) {
  return useQuery({
    queryKey: ['accidents', id],
    queryFn: () => api.get<AccidentReport>(`/accidents/${id}`),
    enabled: !!id,
  });
}

export function useCreateAccident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAccidentBody) => api.post<AccidentReport>('/accidents', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accidents'] });
    },
  });
}

export function useCloseAccident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/accidents/${id}/status`, { status: 'closed' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accidents'] });
    },
  });
}

export function useReopenAccident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/accidents/${id}/status`, { status: 'open' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accidents'] });
    },
  });
}

export async function uploadAccidentPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const result = await api.upload<{ url: string }>('/accidents/upload-photo', form);
  return result.url;
}
