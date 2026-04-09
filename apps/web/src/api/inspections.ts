import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export type InspectionItemVehicleType = 'all' | 'scooter' | 'tuktuk';

export interface InspectionItem {
  id: string;
  storeId: string | null;
  name: string;
  itemType:
    | 'accepted_issue'
    | 'accepted_issue_qty'
    | 'accepted_issue_na'
    | 'accepted_issue_declined';
  sortOrder: number;
  isActive: boolean;
  vehicleType: InspectionItemVehicleType;
}

export interface Inspection {
  id: string;
  orderId: string | null;
  orderReference: string;
  storeId: string;
  vehicleId: string | null;
  vehicleName: string | null;
  employeeId: string | null;
  kmReading: string | null;
  damageNotes: string | null;
  helmetNumbers: string | null;
  customerSignatureUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function useInspectionItems(storeId: string) {
  return useQuery<InspectionItem[]>({
    queryKey: ['inspection-items', storeId],
    queryFn: () => api.get('/inspections/items'),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInspectionByOrder(orderId: string) {
  return useQuery<{ exists: boolean; inspection: Inspection | null }>({
    queryKey: ['inspection', 'order', orderId],
    queryFn: () => api.get(`/inspections/order/${orderId}`),
    enabled: !!orderId,
  });
}

export function useSubmitInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/inspections', body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['inspection', 'order', variables.orderId as string] });
      qc.invalidateQueries({ queryKey: ['orders', 'enriched'] });
    },
  });
}

export function useInspectionItemsAll() {
  return useQuery<InspectionItem[]>({
    queryKey: ['inspection-items', 'all'],
    queryFn: () => api.get('/inspections/items/all'),
  });
}

export type CreateInspectionItemInput = {
  name: string;
  itemType: InspectionItem['itemType'];
  sortOrder: number;
  storeId?: string | null;
  vehicleType?: InspectionItemVehicleType;
};

export type UpdateInspectionItemInput = {
  name?: string;
  itemType?: InspectionItem['itemType'];
  sortOrder?: number;
  isActive?: boolean;
  vehicleType?: InspectionItemVehicleType;
};

export function useCreateInspectionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInspectionItemInput) => api.post<InspectionItem>('/inspections/items', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspection-items', 'all'] });
      qc.invalidateQueries({ queryKey: ['inspection-items'] });
    },
  });
}

export function useUpdateInspectionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateInspectionItemInput }) =>
      api.put<InspectionItem>(`/inspections/items/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspection-items', 'all'] });
      qc.invalidateQueries({ queryKey: ['inspection-items'] });
    },
  });
}

export const inspectionsApi = {
  getItems: () => api.get<InspectionItem[]>('/inspections/items'),
  getItemsAll: () => api.get<InspectionItem[]>('/inspections/items/all'),
  getByOrder: (orderId: string) =>
    api.get<{ exists: boolean; inspection: Inspection | null }>(`/inspections/order/${orderId}`),
  submit: (data: unknown) => api.post<{ inspectionId: string }>('/inspections', data),
  createItem: (body: CreateInspectionItemInput) => api.post<InspectionItem>('/inspections/items', body),
  updateItem: (id: string, body: UpdateInspectionItemInput) => api.put<InspectionItem>(`/inspections/items/${id}`, body),
};
