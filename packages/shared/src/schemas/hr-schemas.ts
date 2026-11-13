import { z } from 'zod';

export const TimesheetEntrySchema = z.object({
  date: z.string(),
  employeeId: z.string(),
  name: z.string().nullable(),
  dayType: z.string(),
  timeIn: z.string().nullable(),
  timeOut: z.string().nullable(),
  ninePmReturnsCount: z.number().int().nonnegative().default(0),
  dailyNotes: z.string().nullable().default(null),
  silInflation: z.number().nonnegative().default(0),
  storeId: z.string(),
});

export type TimesheetEntry = z.infer<typeof TimesheetEntrySchema>;

export const SubmitTimesheetRequestSchema = z.object({
  entries: z.array(TimesheetEntrySchema).min(1),
});

export type SubmitTimesheetRequest = z.infer<typeof SubmitTimesheetRequestSchema>;

export const ApproveTimesheetsRequestSchema = z.object({
  timesheetIds: z.array(z.string()).min(1),
});

export type ApproveTimesheetsRequest = z.infer<typeof ApproveTimesheetsRequestSchema>;

export const SubmitLeaveRequestSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  leaveType: z.enum(['holiday', 'sick']),
  storeId: z.string(),
});

export type SubmitLeaveRequest = z.infer<typeof SubmitLeaveRequestSchema>;

export const TimesheetQuerySchema = z.object({
  storeId: z.string().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

export type TimesheetQuery = z.infer<typeof TimesheetQuerySchema>;

export const GrantCashAdvanceRequestSchema = z.object({
  storeId: z.string(),
  employeeId: z.string(),
  amount: z.number().positive(),
  date: z.string(),
  repaymentType: z.enum(['lump-sum', 'installments']),
  /** Lump-sum: which payday to deduct the full amount on. Defaults to 'end_of_month'. */
  deductOn: z.enum(['mid_month', 'end_of_month']).optional(),
  /** Installments: how many payroll periods to spread across. Min 2. */
  periods: z.number().int().min(2).optional(),
  /** Installments: which payday to start deductions from. Defaults to 'end_of_month'. */
  startPayday: z.enum(['mid_month', 'end_of_month']).optional(),
  expenseAccountId: z.string(),
  cashAccountId: z.string(),
  description: z.string().optional(),
});

export type GrantCashAdvanceRequest = z.infer<typeof GrantCashAdvanceRequestSchema>;

export const CashAdvanceQuerySchema = z.object({
  employeeId: z.string(),
  storeId: z.string(),
});

export const EditTimesheetRequestSchema = z.object({
  dayType: z.string().min(1),
  timeIn: z.string().nullable(),
  timeOut: z.string().nullable(),
  regularHours: z.number().nonnegative(),
  overtimeHours: z.number().nonnegative(),
  ninePmReturnsCount: z.number().int().nonnegative(),
  dailyNotes: z.string().nullable(),
  storeId: z.string().min(1),
  /** Share of a full day's pay (0.5 = half day). */
  dayFraction: z.number().gt(0).max(1).optional(),
});

export type EditTimesheetRequest = z.infer<typeof EditTimesheetRequestSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const CreateLeaveRequestSchema = z.object({
  leaveType: z.enum(['holiday', 'sick', 'unpaid']),
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().max(500).optional(),
}).refine((v) => v.endDate >= v.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] });

export type CreateLeaveRequest = z.infer<typeof CreateLeaveRequestSchema>;

export const CreateAdvanceRequestSchema = z.object({
  amount: z.number().positive().max(100000),
  reason: z.string().max(500).optional(),
  paydayType: z.enum(['mid_month', 'end_of_month']),
});

export type CreateAdvanceRequest = z.infer<typeof CreateAdvanceRequestSchema>;

export const ReviewRequestSchema = z.object({
  note: z.string().max(500).optional(),
});

export const ApproveAdvanceRequestSchema = z.object({
  note: z.string().max(500).optional(),
  cashAccountId: z.string().min(1),
  /** Defaults to the request's payday when omitted. */
  deductOn: z.enum(['mid_month', 'end_of_month']).optional(),
});

export type ApproveAdvanceRequest = z.infer<typeof ApproveAdvanceRequestSchema>;

export const AcknowledgePayslipSchema = z.object({
  status: z.enum(['confirmed', 'disputed']),
  signedName: z.string().trim().min(2).max(120),
  /** PNG data URL of the drawn signature. */
  signaturePng: z.string().startsWith('data:image/png;base64,').max(300_000).optional(),
  comment: z.string().max(1000).optional(),
}).refine((v) => v.status === 'confirmed' || (v.comment ?? '').trim().length > 0, {
  message: 'Tell us what looks wrong on the payslip',
  path: ['comment'],
}).refine((v) => v.status === 'disputed' || !!v.signaturePng, {
  message: 'Sign in the box to confirm',
  path: ['signaturePng'],
});

export type AcknowledgePayslipRequest = z.infer<typeof AcknowledgePayslipSchema>;

export const ResolvePayslipDisputeSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});

export const SaveWorkUpdateSchema = z.object({
  /** Monday of the week the update covers. */
  weekStart: isoDate,
  workedOn: z.string().trim().min(3).max(4000),
  results: z.string().max(4000).optional(),
  nextWeek: z.string().max(4000).optional(),
  blockers: z.string().max(2000).optional(),
});

export type SaveWorkUpdateRequest = z.infer<typeof SaveWorkUpdateSchema>;

export const CommentWorkUpdateSchema = z.object({
  comment: z.string().trim().min(1).max(2000),
});
