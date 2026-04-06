import { z } from 'zod';
export declare const UpsertBudgetLinesSchema: z.ZodObject<{
    storeId: z.ZodNullable<z.ZodString>;
    year: z.ZodNumber;
    lines: z.ZodArray<z.ZodObject<{
        lineType: z.ZodEnum<["revenue", "expense", "payroll", "depreciation", "drawings", "transfer_revenue", "misc_revenue"]>;
        categoryLabel: z.ZodString;
        coaAccountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        expenseCategoryId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        month: z.ZodNumber;
        amount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        amount: number;
        lineType: "payroll" | "expense" | "depreciation" | "revenue" | "drawings" | "transfer_revenue" | "misc_revenue";
        categoryLabel: string;
        month: number;
        coaAccountId?: string | null | undefined;
        expenseCategoryId?: number | null | undefined;
    }, {
        amount: number;
        lineType: "payroll" | "expense" | "depreciation" | "revenue" | "drawings" | "transfer_revenue" | "misc_revenue";
        categoryLabel: string;
        month: number;
        coaAccountId?: string | null | undefined;
        expenseCategoryId?: number | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    lines: {
        amount: number;
        lineType: "payroll" | "expense" | "depreciation" | "revenue" | "drawings" | "transfer_revenue" | "misc_revenue";
        categoryLabel: string;
        month: number;
        coaAccountId?: string | null | undefined;
        expenseCategoryId?: number | null | undefined;
    }[];
    storeId: string | null;
    year: number;
}, {
    lines: {
        amount: number;
        lineType: "payroll" | "expense" | "depreciation" | "revenue" | "drawings" | "transfer_revenue" | "misc_revenue";
        categoryLabel: string;
        month: number;
        coaAccountId?: string | null | undefined;
        expenseCategoryId?: number | null | undefined;
    }[];
    storeId: string | null;
    year: number;
}>;
export type UpsertBudgetLinesRequest = z.infer<typeof UpsertBudgetLinesSchema>;
export declare const GetBudgetQuerySchema: z.ZodObject<{
    storeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    year: z.ZodNumber;
    month: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    year: number;
    storeId?: string | null | undefined;
    month?: number | undefined;
}, {
    year: number;
    storeId?: string | null | undefined;
    month?: number | undefined;
}>;
export type GetBudgetQuery = z.infer<typeof GetBudgetQuerySchema>;
export declare const AutoFillQuerySchema: z.ZodObject<{
    storeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    year: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    year: number;
    storeId?: string | null | undefined;
}, {
    year: number;
    storeId?: string | null | undefined;
}>;
export type AutoFillQuery = z.infer<typeof AutoFillQuerySchema>;
//# sourceMappingURL=budget-schemas.d.ts.map