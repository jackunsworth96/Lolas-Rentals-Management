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
  tamperHash: string | null;
  hashEmailedAt: string | null;
  createdAt: string;
  // Flattened joined fields (resolved in toDto on the API)
  fleet: { name: string; plateNumber: string } | null;
  orderReference: string | null;
  customerName: string | null;
  reportedByName: string | null;
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

export function useAccidents(storeId: string, filters: { vehicleId?: string; orderId?: string } = {}) {
  const params = new URLSearchParams({ storeId });
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId);
  if (filters.orderId) params.set('orderId', filters.orderId);

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


export async function uploadAccidentPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const result = await api.upload<{ url: string }>('/accidents/upload-photo', form);
  return result.url;
}
