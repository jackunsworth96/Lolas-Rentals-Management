import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const PayrollPaymentMethodSchema = z.enum(['cash', 'gcash', 'bank_transfer', 'other']);
export type PayrollPaymentMethod = z.infer<typeof PayrollPaymentMethodSchema>;

/** One way an employee's net pay leaves the business (till, safe, GCash, bank...). */
export const PayrollPaymentLineSchema = z.object({
  accountId: z.string().min(1),
  method: PayrollPaymentMethodSchema,
  amount: z.number().nonnegative(),
  fee: z.number().nonnegative().default(0),
  reference: z.string().max(120).optional(),
});
export type PayrollPaymentLine = z.infer<typeof PayrollPaymentLineSchema>;

export const PayrollEmployeeInputSchema = z.object({
  employeeId: z.string(),
  bonuses: z.number().nonnegative().default(0),
  bonusNote: z.string().max(200).optional(),
  /** Omit to pay the full net via the employee's default method. */
  payments: z.array(PayrollPaymentLineSchema).optional(),
});
export type PayrollEmployeeInput = z.infer<typeof PayrollEmployeeInputSchema>;

export const PayrollPeriodSchema = z.object({
  storeId: z.string().min(1),
  periodStart: isoDate,
  periodEnd: isoDate,
  /** Date the journal is posted and staff are paid. Defaults to the period end. */
  payDate: isoDate.optional(),
  isEndOfMonth: z.boolean(),
  workingDaysInMonth: z.number().int().positive(),
  excludeEmployeeIds: z.array(z.string()).default([]),
  employees: z.array(PayrollEmployeeInputSchema).default([]),
});

export const RunPayrollPreviewRequestSchema = PayrollPeriodSchema;
export type RunPayrollPreviewRequest = z.infer<typeof RunPayrollPreviewRequestSchema>;

export const RunPayrollRequestSchema = PayrollPeriodSchema;
export type RunPayrollRequest = z.infer<typeof RunPayrollRequestSchema>;

export const VoidPayrollRunRequestSchema = z.object({
  reason: z.string().min(3).max(300),
  reversalDate: isoDate.optional(),
});
export type VoidPayrollRunRequest = z.infer<typeof VoidPayrollRunRequestSchema>;

export const ThirteenthMonthRunRequestSchema = z.object({
  storeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  payDate: isoDate,
  employees: z.array(z.object({
    employeeId: z.string(),
    amount: z.number().nonnegative(),
    payments: z.array(PayrollPaymentLineSchema).optional(),
  })).min(1),
});
export type ThirteenthMonthRunRequest = z.infer<typeof ThirteenthMonthRunRequestSchema>;

export const PublicHolidaySchema = z.object({
  holidayDate: isoDate,
  name: z.string().min(1).max(120),
  premiumPct: z.number().min(0).max(200),
  storeId: z.string().nullable().optional(),
});
export type PublicHolidayInput = z.infer<typeof PublicHolidaySchema>;

export const AllowanceWithdrawalSchema = z.object({
  employeeId: z.string().min(1),
  storeId: z.string().min(1),
  date: isoDate,
  amount: z.number().positive(),
  paidFromAccountId: z.string().min(1),
  note: z.string().max(200).optional(),
});
export type AllowanceWithdrawalInput = z.infer<typeof AllowanceWithdrawalSchema>;

export const AllowanceAdjustmentSchema = z.object({
  employeeId: z.string().min(1),
  storeId: z.string().min(1),
  date: isoDate,
  /** Positive adds to the balance, negative removes. */
  amount: z.number().refine((n) => n !== 0, 'Amount cannot be zero'),
  entryType: z.enum(['opening', 'adjustment']).default('adjustment'),
  note: z.string().min(1).max(200),
});
export type AllowanceAdjustmentInput = z.infer<typeof AllowanceAdjustmentSchema>;

export const ContributionRemittanceSchema = z.object({
  storeId: z.string().min(1),
  agency: z.enum(['sss', 'philhealth', 'pagibig']),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM'),
  amount: z.number().positive(),
  fee: z.number().nonnegative().default(0),
  paidFromAccountId: z.string().min(1),
  paidDate: isoDate,
  referenceNo: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
});
export type ContributionRemittanceInput = z.infer<typeof ContributionRemittanceSchema>;
