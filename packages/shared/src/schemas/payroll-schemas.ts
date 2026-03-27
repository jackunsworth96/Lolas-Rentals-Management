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

export const RunPayrollRequestSchema = z.object({
  storeId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  isEndOfMonth: z.boolean(),
  workingDaysInMonth: z.number().int().positive(),
  payrollExpenseAccountId: z.string(),
  cashAccountId: z.string(),
  storeExpenseAccounts: z.record(z.string(), z.string()).optional(),
});

export type RunPayrollRequest = z.infer<typeof RunPayrollRequestSchema>;
