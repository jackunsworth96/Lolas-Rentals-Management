import { z } from 'zod';
export declare const CashupQuerySchema: z.ZodObject<{
    storeId: z.ZodString;
    date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    date: string;
    storeId: string;
}, {
    date: string;
    storeId: string;
}>;
export type CashupQuery = z.infer<typeof CashupQuerySchema>;
export declare const ReconcileCashRequestSchema: z.ZodObject<{
    storeId: z.ZodString;
    date: z.ZodString;
    openingBalance: z.ZodNumber;
    expectedCash: z.ZodNumber;
    actualCounted: z.ZodNumber;
    tillCounted: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    depositsCounted: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    tillDenoms: z.ZodDefault<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodNumber>>>;
    depositDenoms: z.ZodDefault<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodNumber>>>;
    tillExpected: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    depositsExpected: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    closingBalance: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    date: string;
    storeId: string;
    openingBalance: number;
    expectedCash: number;
    actualCounted: number;
    tillCounted: number | null;
    depositsCounted: number | null;
    tillDenoms: Record<string, number> | null;
    depositDenoms: Record<string, number> | null;
    tillExpected: number | null;
    depositsExpected: number | null;
    closingBalance: number;
}, {
    date: string;
    storeId: string;
    openingBalance: number;
    expectedCash: number;
    actualCounted: number;
    closingBalance: number;
    tillCounted?: number | null | undefined;
    depositsCounted?: number | null | undefined;
    tillDenoms?: Record<string, number> | null | undefined;
    depositDenoms?: Record<string, number> | null | undefined;
    tillExpected?: number | null | undefined;
    depositsExpected?: number | null | undefined;
}>;
export type ReconcileCashRequest = z.infer<typeof ReconcileCashRequestSchema>;
export declare const OverrideReconciliationRequestSchema: z.ZodObject<{
    storeId: z.ZodString;
    date: z.ZodString;
    actualCounted: z.ZodNumber;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    date: string;
    storeId: string;
    actualCounted: number;
    reason: string;
}, {
    date: string;
    storeId: string;
    actualCounted: number;
    reason: string;
}>;
export type OverrideReconciliationRequest = z.infer<typeof OverrideReconciliationRequestSchema>;
//# sourceMappingURL=cashup-schemas.d.ts.map