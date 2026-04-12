import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';

export interface PawCardEstablishment {
  id: string;
  name: string;
  category: string;
  discount_headline: string;
  discount_conditions?: string | null;
  description?: string | null;
  opening_hours?: string | null;
  saving_solo?: number | null;
  saving_group?: number | null;
  google_rating?: number | null;
  google_maps_url?: string | null;
  instagram_url?: string | null;
  is_favourite: boolean;
  is_high_value: boolean;
  time_of_day?: string | null;
  discount_code?: string | null;
}

export function usePublicEstablishments() {
  return useQuery<PawCardEstablishment[]>({
    queryKey: ['paw-card', 'establishments', 'public'],
    queryFn: () => api.get<PawCardEstablishment[]>('/public/paw-card/establishments'),
    staleTime: 5 * 60_000,
  });
}

export function useTopEstablishments() {
  return useQuery({
    queryKey: ['top-establishments'],
    queryFn: () => api.get<{ name: string; count: number }[]>(
      '/public/paw-card/top-establishments',
    ),
    staleTime: 5 * 60 * 1000,
  });
}
