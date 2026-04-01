import { z } from 'zod';
export declare const JournalLegSchema: z.ZodObject<{
    accountId: z.ZodString;
    debit: z.ZodNumber;
    credit: z.ZodNumber;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    referenceType: z.ZodOptional<z.ZodString>;
    referenceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    accountId: string;
    debit: number;
    credit: number;
    description?: string | null | undefined;
    referenceType?: string | undefined;
    referenceId?: string | null | undefined;
}, {
    accountId: string;
    debit: number;
    credit: number;
    description?: string | null | undefined;
    referenceType?: string | undefined;
    referenceId?: string | null | undefined;
}>;
export type JournalLeg = z.infer<typeof JournalLegSchema>;
export declare const CreateJournalEntryRequestSchema: z.ZodObject<{
    date: z.ZodString;
    referenceType: z.ZodString;
    referenceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodString;
    legs: z.ZodArray<z.ZodObject<{
        accountId: z.ZodString;
        debit: z.ZodNumber;
        credit: z.ZodNumber;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        referenceType: z.ZodOptional<z.ZodString>;
        referenceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        accountId: string;
        debit: number;
        credit: number;
        description?: string | null | undefined;
        referenceType?: string | undefined;
        referenceId?: string | null | undefined;
    }, {
        accountId: string;
        debit: number;
        credit: number;
        description?: string | null | undefined;
        referenceType?: string | undefined;
        referenceId?: string | null | undefined;
    }>, "many">;
    locationId: z.ZodOptional<z.ZodString>;
    storeId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    date: string;
    description: string;
    referenceType: string;
    legs: {
        accountId: string;
        debit: number;
        credit: number;
        description?: string | null | undefined;
        referenceType?: string | undefined;
        referenceId?: string | null | undefined;
    }[];
    locationId?: string | undefined;
    storeId?: string | undefined;
    referenceId?: string | null | undefined;
}, {
    date: string;
    description: string;
    referenceType: string;
    legs: {
        accountId: string;
        debit: number;
        credit: number;
        description?: string | null | undefined;
        referenceType?: string | undefined;
        referenceId?: string | null | undefined;
    }[];
    locationId?: string | undefined;
    storeId?: string | undefined;
    referenceId?: string | null | undefined;
}>;
export type CreateJournalEntryRequest = z.infer<typeof CreateJournalEntryRequestSchema>;
export declare const TransferFundsRequestSchema: z.ZodObject<{
    fromAccountId: z.ZodString;
    toAccountId: z.ZodString;
    amount: z.ZodNumber;
    date: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    locationId: z.ZodOptional<z.ZodString>;
    storeId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    date: string;
    amount: number;
    fromAccountId: string;
    toAccountId: string;
    locationId?: string | undefined;
    description?: string | undefined;
    storeId?: string | undefined;
}, {
    date: string;
    amount: number;
    fromAccountId: string;
    toAccountId: string;
    locationId?: string | undefined;
    description?: string | undefined;
    storeId?: string | undefined;
}>;
export type TransferFundsRequest = z.infer<typeof TransferFundsRequestSchema>;
export declare const BalanceResponseSchema: z.ZodObject<{
    accountId: z.ZodString;
    accountName: z.ZodString;
    accountType: z.ZodString;
    balance: z.ZodNumber;
    asOf: z.ZodString;
}, "strip", z.ZodTypeAny, {
    accountId: string;
    accountName: string;
    accountType: string;
    balance: number;
    asOf: string;
}, {
    accountId: string;
    accountName: string;
    accountType: string;
    balance: number;
    asOf: string;
}>;
export type BalanceResponse = z.infer<typeof BalanceResponseSchema>;
//# sourceMappingURL=accounting-schemas.d.ts.map