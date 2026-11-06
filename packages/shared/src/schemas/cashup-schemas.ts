import { z } from 'zod';

/** Till or envelope variance (either direction, in pesos) above which staff must explain it. */
export const CASHUP_VARIANCE_NOTE_THRESHOLD = 100;

export const CashupQuerySchema = z.object({
  storeId: z.string(),
  date: z.string(),
});

export type CashupQuery = z.infer<typeof CashupQuerySchema>;

const DenomsSchema = z.record(z.number().int().min(0));

/**
 * Staff submit only what they counted. Expected figures, variances and
 * closing balances are worked out on the server from the same summary the
 * page displays.
 */
export const ReconcileCashRequestSchema = z.object({
  storeId: z.string(),
  date: z.string(),
  tillDenoms: DenomsSchema,
  depositDenoms: DenomsSchema,
  varianceNote: z.string().max(1000).nullable().optional(),
  /** Cash taken out of the counted till to the bank or safe at close. */
  cashDrop: z
    .object({
      amount: z.number().positive(),
      cashAccountId: z.string().min(1),
      bankAccountId: z.string().min(1),
    })
    .nullable()
    .optional(),
});

export type ReconcileCashRequest = z.infer<typeof ReconcileCashRequestSchema>;

export const ReopenReconciliationRequestSchema = z.object({
  storeId: z.string(),
  date: z.string(),
  reason: z.string().trim().min(1),
});

export type ReopenReconciliationRequest = z.infer<typeof ReopenReconciliationRequestSchema>;

/** @deprecated Override now reopens the day for a recount; counts are ignored. */
export const OverrideReconciliationRequestSchema = ReopenReconciliationRequestSchema.extend({
  actualCounted: z.number().optional(),
});

export type OverrideReconciliationRequest = z.infer<typeof OverrideReconciliationRequestSchema>;
