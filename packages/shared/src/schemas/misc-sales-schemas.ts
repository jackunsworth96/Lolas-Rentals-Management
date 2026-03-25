import { z } from 'zod';

export const RecordMiscSaleRequestSchema = z.object({
  date: z.string(),
  storeId: z.string(),
  description: z.string().min(1),
  category: z.string().nullable().default(null),
  amount: z.number().positive(),
  receivedInto: z.string(),
  incomeAccountId: z.string(),
  employeeId: z.string().nullable().default(null),
});

export type RecordMiscSaleRequest = z.infer<typeof RecordMiscSaleRequestSchema>;

export const UpdateMiscSaleRequestSchema = z.object({
  date: z.string().optional(),
  description: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  amount: z.number().positive().optional(),
  receivedInto: z.string().optional(),
  incomeAccountId: z.string().optional(),
  employeeId: z.string().nullable().optional(),
});

export type UpdateMiscSaleRequest = z.infer<typeof UpdateMiscSaleRequestSchema>;

export const MiscSaleQuerySchema = z.object({
  storeId: z.string(),
  date: z.string().optional(),
});

export type MiscSaleQuery = z.infer<typeof MiscSaleQuerySchema>;
