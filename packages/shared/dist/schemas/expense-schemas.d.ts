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
    storeId: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    paidFrom: string | null;
    vehicleId: string | null;
    employeeId: string | null;
    expenseAccountId: string;
    cashAccountId: string;
    status: "paid" | "unpaid";
}, {
    storeId: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    expenseAccountId: string;
    paidFrom?: string | null | undefined;
    vehicleId?: string | null | undefined;
    employeeId?: string | null | undefined;
    cashAccountId?: string | undefined;
    status?: "paid" | "unpaid" | undefined;
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
    category?: string | undefined;
    description?: string | undefined;
    amount?: number | undefined;
    paidFrom?: string | null | undefined;
    vehicleId?: string | null | undefined;
    employeeId?: string | null | undefined;
    expenseAccountId?: string | undefined;
    cashAccountId?: string | undefined;
}, {
    date?: string | undefined;
    category?: string | undefined;
    description?: string | undefined;
    amount?: number | undefined;
    paidFrom?: string | null | undefined;
    vehicleId?: string | null | undefined;
    employeeId?: string | null | undefined;
    expenseAccountId?: string | undefined;
    cashAccountId?: string | undefined;
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
    category?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}, {
    storeId: string;
    date?: string | undefined;
    category?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}>;
export type ExpenseQuery = z.infer<typeof ExpenseQuerySchema>;
export declare const PayExpensesSchema: z.ZodObject<{
    expenseIds: z.ZodArray<z.ZodString, "many">;
    paymentMethodId: z.ZodString;
    storeId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    expenseIds: string[];
    paymentMethodId: string;
}, {
    storeId: string;
    expenseIds: string[];
    paymentMethodId: string;
}>;
export type PayExpensesRequest = z.infer<typeof PayExpensesSchema>;
//# sourceMappingURL=expense-schemas.d.ts.map