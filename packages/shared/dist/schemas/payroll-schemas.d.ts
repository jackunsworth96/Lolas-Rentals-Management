import { z } from 'zod';
export declare const CalculatePayslipRequestSchema: z.ZodObject<{
    employeeId: z.ZodString;
    storeId: z.ZodString;
    periodStart: z.ZodString;
    periodEnd: z.ZodString;
    isEndOfMonth: z.ZodBoolean;
    workingDaysInMonth: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    employeeId: string;
    storeId: string;
    periodStart: string;
    periodEnd: string;
    isEndOfMonth: boolean;
    workingDaysInMonth: number;
}, {
    employeeId: string;
    storeId: string;
    periodStart: string;
    periodEnd: string;
    isEndOfMonth: boolean;
    workingDaysInMonth: number;
}>;
export type CalculatePayslipRequest = z.infer<typeof CalculatePayslipRequestSchema>;
export declare const RunPayrollRequestSchema: z.ZodObject<{
    storeId: z.ZodString;
    periodStart: z.ZodString;
    periodEnd: z.ZodString;
    isEndOfMonth: z.ZodBoolean;
    workingDaysInMonth: z.ZodNumber;
    payrollExpenseAccountId: z.ZodString;
    cashAccountId: z.ZodString;
    storeExpenseAccounts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    periodStart: string;
    periodEnd: string;
    cashAccountId: string;
    isEndOfMonth: boolean;
    workingDaysInMonth: number;
    payrollExpenseAccountId: string;
    storeExpenseAccounts?: Record<string, string> | undefined;
}, {
    storeId: string;
    periodStart: string;
    periodEnd: string;
    cashAccountId: string;
    isEndOfMonth: boolean;
    workingDaysInMonth: number;
    payrollExpenseAccountId: string;
    storeExpenseAccounts?: Record<string, string> | undefined;
}>;
export type RunPayrollRequest = z.infer<typeof RunPayrollRequestSchema>;
//# sourceMappingURL=payroll-schemas.d.ts.map