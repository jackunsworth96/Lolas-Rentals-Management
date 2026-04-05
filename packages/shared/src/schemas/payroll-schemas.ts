import { z } from 'zod';

export const CalculatePayslipRequestSchema = z.object({
  employeeId: z.string(),
  storeId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  isEndOfMonth: z.boolean(),
  workingDaysInMonth: z.number().int().positive(),
});

export type CalculatePayslipRequest = z.infer<typeof CalculatePayslipRequestSchema>;

export const EmployeePaymentDetailSchema = z.object({
  employeeId: z.string(),
  paymentMethod: z.enum(['cash', 'gcash', 'bank_transfer']),
  fromTill: z.number().nonnegative().optional(),
  fromSafe: z.number().nonnegative().optional(),
  bonuses: z.number().nonnegative().default(0).optional(),
});

export type EmployeePaymentDetail = z.infer<typeof EmployeePaymentDetailSchema>;

export const RunPayrollPreviewRequestSchema = z.object({
  storeId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  isEndOfMonth: z.boolean(),
  workingDaysInMonth: z.number().int().positive(),
});

export type RunPayrollPreviewRequest = z.infer<typeof RunPayrollPreviewRequestSchema>;

export const RunPayrollRequestSchema = z.object({
  storeId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  isEndOfMonth: z.boolean(),
  workingDaysInMonth: z.number().int().positive(),
  employeePayments: z.array(EmployeePaymentDetailSchema),
});

export type RunPayrollRequest = z.infer<typeof RunPayrollRequestSchema>;
