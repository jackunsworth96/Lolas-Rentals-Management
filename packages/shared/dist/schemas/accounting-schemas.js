import { z } from 'zod';
export const JournalLegSchema = z.object({
    accountId: z.string().min(1),
    debit: z.number().nonnegative(),
    credit: z.number().nonnegative(),
    description: z.string().nullable().optional(),
    referenceType: z.string().optional(),
    referenceId: z.string().nullable().optional(),
});
export const CreateJournalEntryRequestSchema = z.object({
    date: z.string(),
    referenceType: z.string(),
    referenceId: z.string().nullable().optional(),
    description: z.string().min(1),
    legs: z.array(JournalLegSchema).min(2),
    locationId: z.string().optional(),
    storeId: z.string().optional(),
});
export const TransferFundsRequestSchema = z.object({
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    amount: z.number().positive(),
    date: z.string(),
    description: z.string().optional(),
    locationId: z.string().optional(),
    storeId: z.string().optional(),
});
export const BalanceResponseSchema = z.object({
    accountId: z.string(),
    accountName: z.string(),
    accountType: z.string(),
    balance: z.number(),
    asOf: z.string(),
});
//# sourceMappingURL=accounting-schemas.js.map