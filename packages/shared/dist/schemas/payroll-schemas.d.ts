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
export declare const EmployeePaymentDetailSchema: z.ZodObject<{
    employeeId: z.ZodString;
    paymentMethod: z.ZodEnum<["cash", "gcash", "bank_transfer"]>;
    fromTill: z.ZodOptional<z.ZodNumber>;
    fromSafe: z.ZodOptional<z.ZodNumber>;
    bonuses: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    employeeId: string;
    paymentMethod: "cash" | "gcash" | "bank_transfer";
    fromTill?: number | undefined;
    fromSafe?: number | undefined;
    bonuses?: number | undefined;
}, {
    employeeId: string;
    paymentMethod: "cash" | "gcash" | "bank_transfer";
    fromTill?: number | undefined;
    fromSafe?: number | undefined;
    bonuses?: number | undefined;
}>;
export type EmployeePaymentDetail = z.infer<typeof EmployeePaymentDetailSchema>;
export declare const RunPayrollPreviewRequestSchema: z.ZodObject<{
    storeId: z.ZodString;
    periodStart: z.ZodString;
    periodEnd: z.ZodString;
    isEndOfMonth: z.ZodBoolean;
    workingDaysInMonth: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    periodStart: string;
    periodEnd: string;
    isEndOfMonth: boolean;
    workingDaysInMonth: number;
}, {
    storeId: string;
    periodStart: string;
    periodEnd: string;
    isEndOfMonth: boolean;
    workingDaysInMonth: number;
}>;
export type RunPayrollPreviewRequest = z.infer<typeof RunPayrollPreviewRequestSchema>;
export declare const RunPayrollRequestSchema: z.ZodObject<{
    storeId: z.ZodString;
    periodStart: z.ZodString;
    periodEnd: z.ZodString;
    isEndOfMonth: z.ZodBoolean;
    workingDaysInMonth: z.ZodNumber;
    employeePayments: z.ZodArray<z.ZodObject<{
        employeeId: z.ZodString;
        paymentMethod: z.ZodEnum<["cash", "gcash", "bank_transfer"]>;
        fromTill: z.ZodOptional<z.ZodNumber>;
        fromSafe: z.ZodOptional<z.ZodNumber>;
        bonuses: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        employeeId: string;
        paymentMethod: "cash" | "gcash" | "bank_transfer";
        fromTill?: number | undefined;
        fromSafe?: number | undefined;
        bonuses?: number | undefined;
    }, {
        employeeId: string;
        paymentMethod: "cash" | "gcash" | "bank_transfer";
        fromTill?: number | undefined;
        fromSafe?: number | undefined;
        bonuses?: number | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    periodStart: string;
    periodEnd: string;
    isEndOfMonth: boolean;
    workingDaysInMonth: number;
    employeePayments: {
        employeeId: string;
        paymentMethod: "cash" | "gcash" | "bank_transfer";
        fromTill?: number | undefined;
        fromSafe?: number | undefined;
        bonuses?: number | undefined;
    }[];
}, {
    storeId: string;
    periodStart: string;
    periodEnd: string;
    isEndOfMonth: boolean;
    workingDaysInMonth: number;
    employeePayments: {
        employeeId: string;
        paymentMethod: "cash" | "gcash" | "bank_transfer";
        fromTill?: number | undefined;
        fromSafe?: number | undefined;
        bonuses?: number | undefined;
    }[];
}>;
export type RunPayrollRequest = z.infer<typeof RunPayrollRequestSchema>;
//# sourceMappingURL=payroll-schemas.d.ts.map