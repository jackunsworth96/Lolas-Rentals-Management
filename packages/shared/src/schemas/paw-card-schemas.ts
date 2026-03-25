import { z } from 'zod';

export const PawCardLookupQuerySchema = z.object({
  email: z.string().optional(),
  mobile: z.string().optional(),
  orderId: z.string().optional(),
});

export type PawCardLookupQuery = z.infer<typeof PawCardLookupQuerySchema>;

export const PawCardSubmitRequestSchema = z.object({
  customerId: z.string(),
  establishmentId: z.string(),
  discountAmount: z.number().positive(),
  visitDate: z.string(),
  storeId: z.string(),
});

export type PawCardSubmitRequest = z.infer<typeof PawCardSubmitRequestSchema>;

export const PawCardMySubmissionsQuerySchema = z.object({
  email: z.string(),
});

export type PawCardMySubmissionsQuery = z.infer<typeof PawCardMySubmissionsQuerySchema>;
