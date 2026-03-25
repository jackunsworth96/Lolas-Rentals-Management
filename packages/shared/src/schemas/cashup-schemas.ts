import { z } from 'zod';

export const CashupQuerySchema = z.object({
  storeId: z.string(),
  date: z.string(),
});

export type CashupQuery = z.infer<typeof CashupQuerySchema>;

export const ReconcileCashRequestSchema = z.object({
  storeId: z.string(),
  date: z.string(),
  openingBalance: z.number(),
  expectedCash: z.number(),
  actualCounted: z.number(),
  tillCounted: z.number().nullable().default(null),
  depositsCounted: z.number().nullable().default(null),
  tillDenoms: z.record(z.number()).nullable().default(null),
  depositDenoms: z.record(z.number()).nullable().default(null),
  tillExpected: z.number().nullable().default(null),
  depositsExpected: z.number().nullable().default(null),
  closingBalance: z.number(),
});

export type ReconcileCashRequest = z.infer<typeof ReconcileCashRequestSchema>;

export const OverrideReconciliationRequestSchema = z.object({
  storeId: z.string(),
  date: z.string(),
  actualCounted: z.number(),
  reason: z.string().min(1),
});

export type OverrideReconciliationRequest = z.infer<typeof OverrideReconciliationRequestSchema>;
