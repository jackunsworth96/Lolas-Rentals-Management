import { z } from 'zod';

export const UiErrorListQuerySchema = z.object({
  status: z.enum(['all', 'outstanding', 'fixed']).optional(),
});

export type UiErrorListQuery = z.infer<typeof UiErrorListQuerySchema>;

export const CreateUiErrorRequestSchema = z.object({
  page: z.string().min(1).max(200),
  errorDescription: z.string().min(1).max(8000),
  ideaAndImprovements: z.string().max(8000).nullable().optional(),
});

export type CreateUiErrorRequest = z.infer<typeof CreateUiErrorRequestSchema>;

export const UpdateUiErrorRequestSchema = z.object({
  fixed: z.boolean(),
});

export type UpdateUiErrorRequest = z.infer<typeof UpdateUiErrorRequestSchema>;
