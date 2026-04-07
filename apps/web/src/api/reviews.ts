import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface Review {
  id: number;
  platform: string;
  storeId: string | null;
  date: string | null;
  reviewerName: string;
  reviewerRole: string | null;
  starRating: number;
  comment: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export type SaveReviewPayload = {
  id?: number;
  reviewerName: string;
  reviewerRole?: string | null;
  starRating: number;
  comment: string;
  platform?: string;
  date?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  storeId?: string | null;
};

export function useReviews() {
  return useQuery<Review[]>({
    queryKey: ['reviews'],
    queryFn: () => api.get('/config/reviews'),
  });
}

export function useSaveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveReviewPayload) =>
      body.id != null
        ? api.put(`/config/reviews/${body.id}`, {
            reviewerName: body.reviewerName,
            reviewerRole: body.reviewerRole,
            starRating: body.starRating,
            comment: body.comment,
            platform: body.platform,
            date: body.date,
            sortOrder: body.sortOrder,
            isActive: body.isActive,
            storeId: body.storeId,
          })
        : api.post('/config/reviews', {
            reviewerName: body.reviewerName,
            reviewerRole: body.reviewerRole,
            starRating: body.starRating,
            comment: body.comment,
            platform: body.platform,
            date: body.date,
            sortOrder: body.sortOrder,
            isActive: body.isActive,
            storeId: body.storeId,
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['public-reviews'] });
    },
  });
}

export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/config/reviews/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['public-reviews'] });
    },
  });
}

export function usePublicReviews() {
  return useQuery<Review[]>({
    queryKey: ['public-reviews'],
    queryFn: () => api.get('/public/reviews'),
  });
}
