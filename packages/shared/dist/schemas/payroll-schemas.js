import { z } from 'zod';
export const CalculatePayslipRequestSchema = z.object({
    employeeId: z.string(),
    storeId: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
    isEndOfMonth: z.boolean(),
    workingDaysInMonth: z.number().int().positive(),
});
export const EmployeePaymentDetailSchema = z.object({
    employeeId: z.string(),
    paymentMethod: z.enum(['cash', 'gcash', 'bank_transfer']),
    fromTill: z.number().nonnegative().optional(),
    fromSafe: z.number().nonnegative().optional(),
});
export const RunPayrollPreviewRequestSchema = z.object({
    storeId: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
    isEndOfMonth: z.boolean(),
    workingDaysInMonth: z.number().int().positive(),
});
export const RunPayrollRequestSchema = z.object({
    storeId: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
    isEndOfMonth: z.boolean(),
    workingDaysInMonth: z.number().int().positive(),
    employeePayments: z.array(EmployeePaymentDetailSchema),
});
//# sourceMappingURL=payroll-schemas.js.map