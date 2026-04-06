import { z } from 'zod';
export declare const CreateExpenseRequestSchema: z.ZodObject<{
    storeId: z.ZodString;
    date: z.ZodString;
    category: z.ZodString;
    description: z.ZodString;
    amount: z.ZodNumber;
    paidFrom: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    vehicleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    employeeId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    expenseAccountId: z.ZodString;
    cashAccountId: z.ZodDefault<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["paid", "unpaid"]>>;
}, "strip", z.ZodTypeAny, {
    status: "paid" | "unpaid";
    date: string;
    employeeId: string | null;
    vehicleId: string | null;
    description: string;
    amount: number;
    storeId: string;
    cashAccountId: string;
    category: string;
    paidFrom: string | null;
    expenseAccountId: string;
}, {
    date: string;
    description: string;
    amount: number;
    storeId: string;
    category: string;
    expenseAccountId: string;
    status?: "paid" | "unpaid" | undefined;
    employeeId?: string | null | undefined;
    vehicleId?: string | null | undefined;
    cashAccountId?: string | undefined;
    paidFrom?: string | null | undefined;
}>;
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequestSchema>;
export declare const UpdateExpenseRequestSchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    amount: z.ZodOptional<z.ZodNumber>;
    paidFrom: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    employeeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    expenseAccountId: z.ZodOptional<z.ZodString>;
    cashAccountId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    date?: string | undefined;
    employeeId?: string | null | undefined;
    vehicleId?: string | null | undefined;
    description?: string | undefined;
    amount?: number | undefined;
    cashAccountId?: string | undefined;
    category?: string | undefined;
    paidFrom?: string | null | undefined;
    expenseAccountId?: string | undefined;
}, {
    date?: string | undefined;
    employeeId?: string | null | undefined;
    vehicleId?: string | null | undefined;
    description?: string | undefined;
    amount?: number | undefined;
    cashAccountId?: string | undefined;
    category?: string | undefined;
    paidFrom?: string | null | undefined;
    expenseAccountId?: string | undefined;
}>;
export type UpdateExpenseRequest = z.infer<typeof UpdateExpenseRequestSchema>;
export declare const ExpenseQuerySchema: z.ZodObject<{
    storeId: z.ZodString;
    date: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    date?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    category?: string | undefined;
}, {
    storeId: string;
    date?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    category?: string | undefined;
}>;
export type ExpenseQuery = z.infer<typeof ExpenseQuerySchema>;
export declare const PayExpensesSchema: z.ZodObject<{
    expenseIds: z.ZodArray<z.ZodString, "many">;
    paymentMethodId: z.ZodString;
    storeId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    paymentMethodId: string;
    storeId: string;
    expenseIds: string[];
}, {
    paymentMethodId: string;
    storeId: string;
    expenseIds: string[];
}>;
export type PayExpensesRequest = z.infer<typeof PayExpensesSchema>;
//# sourceMappingURL=expense-schemas.d.ts.map