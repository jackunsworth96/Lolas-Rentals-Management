import { z } from 'zod';
export declare const RecordMiscSaleRequestSchema: z.ZodObject<{
    date: z.ZodString;
    storeId: z.ZodString;
    description: z.ZodString;
    category: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    amount: z.ZodNumber;
    receivedInto: z.ZodString;
    incomeAccountId: z.ZodString;
    employeeId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    date: string;
    employeeId: string | null;
    description: string;
    amount: number;
    storeId: string;
    category: string | null;
    receivedInto: string;
    incomeAccountId: string;
}, {
    date: string;
    description: string;
    amount: number;
    storeId: string;
    receivedInto: string;
    incomeAccountId: string;
    employeeId?: string | null | undefined;
    category?: string | null | undefined;
}>;
export type RecordMiscSaleRequest = z.infer<typeof RecordMiscSaleRequestSchema>;
export declare const UpdateMiscSaleRequestSchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    amount: z.ZodOptional<z.ZodNumber>;
    receivedInto: z.ZodOptional<z.ZodString>;
    incomeAccountId: z.ZodOptional<z.ZodString>;
    employeeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    date?: string | undefined;
    employeeId?: string | null | undefined;
    description?: string | undefined;
    amount?: number | undefined;
    category?: string | null | undefined;
    receivedInto?: string | undefined;
    incomeAccountId?: string | undefined;
}, {
    date?: string | undefined;
    employeeId?: string | null | undefined;
    description?: string | undefined;
    amount?: number | undefined;
    category?: string | null | undefined;
    receivedInto?: string | undefined;
    incomeAccountId?: string | undefined;
}>;
export type UpdateMiscSaleRequest = z.infer<typeof UpdateMiscSaleRequestSchema>;
export declare const MiscSaleQuerySchema: z.ZodObject<{
    storeId: z.ZodString;
    date: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    date?: string | undefined;
}, {
    storeId: string;
    date?: string | undefined;
}>;
export type MiscSaleQuery = z.infer<typeof MiscSaleQuerySchema>;
//# sourceMappingURL=misc-sales-schemas.d.ts.map