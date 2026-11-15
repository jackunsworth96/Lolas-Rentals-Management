import { z } from 'zod';

export const ExpenseCategoryKindSchema = z.enum([
  'standard',
  'bike_allowance',
  'cash_advance',
  'handled_elsewhere',
  'system',
]);

export type ExpenseCategoryKind = z.infer<typeof ExpenseCategoryKindSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const amount = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'At most two decimal places');

const payday = z.enum(['mid_month', 'end_of_month']);

/** Repayment terms when the expense type is a cash advance. */
export const ExpenseAdvanceTermsSchema = z.object({
  repaymentType: z.enum(['lump-sum', 'installments']),
  deductOn: payday.optional(),
  periods: z.number().int().min(2).max(24).optional(),
  startPayday: payday.optional(),
});

/** Admins can book a single expense to a different account, with a reason that is kept. */
export const ExpenseAccountOverrideSchema = z.object({
  accountId: z.string().min(1),
  reason: z.string().trim().min(5).max(300),
});

export const CreateExpenseRequestSchema = z.object({
  storeId: z.string().min(1),
  categoryId: z.number().int().positive(),
  date: isoDate,
  amount,
  description: z.string().trim().min(3).max(500),
  status: z.enum(['paid', 'unpaid']).default('paid'),
  /** How it was paid. The server resolves the paying account from payment routing. */
  paymentMethodId: z.string().nullable().default(null),
  vehicleId: z.string().nullable().default(null),
  employeeId: z.string().nullable().default(null),
  advance: ExpenseAdvanceTermsSchema.optional(),
  confirmDuplicate: z.boolean().default(false),
  confirmOverLimit: z.boolean().default(false),
  accountOverride: ExpenseAccountOverrideSchema.optional(),
});

export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequestSchema>;

export const UpdateExpenseRequestSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  date: isoDate.optional(),
  amount: amount.optional(),
  description: z.string().trim().min(3).max(500).optional(),
  /** Omit to keep how it was paid. */
  paymentMethodId: z.string().optional(),
  vehicleId: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  confirmDuplicate: z.boolean().default(false),
  confirmOverLimit: z.boolean().default(false),
  accountOverride: ExpenseAccountOverrideSchema.optional(),
});

export type UpdateExpenseRequest = z.infer<typeof UpdateExpenseRequestSchema>;

export const ExpenseQuerySchema = z.object({
  storeId: z.string(),
  date: isoDate.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  employeeId: z.string().optional(),
  vehicleId: z.string().optional(),
});

export type ExpenseQuery = z.infer<typeof ExpenseQuerySchema>;

export const ExpenseCheckQuerySchema = z.object({
  storeId: z.string().min(1),
  categoryId: z.coerce.number().int().positive(),
  date: isoDate,
  amount: z.coerce.number().positive(),
  employeeId: z.string().optional(),
  vehicleId: z.string().optional(),
  excludeId: z.string().optional(),
});

export type ExpenseCheckQuery = z.infer<typeof ExpenseCheckQuerySchema>;

export const PayExpensesSchema = z.object({
  expenseIds: z.array(z.string()).min(1),
  paymentMethodId: z.string(),
  storeId: z.string(),
});

export type PayExpensesRequest = z.infer<typeof PayExpensesSchema>;

export const SaveExpenseCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: ExpenseCategoryKindSchema.default('standard'),
  groupName: z.string().trim().max(40).nullable().optional(),
  accountId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  requiresVehicle: z.boolean().optional(),
  requiresEmployee: z.boolean().optional(),
  requiresNote: z.boolean().optional(),
  softLimit: z.number().positive().nullable().optional(),
  managersOnly: z.boolean().optional(),
  helpText: z.string().trim().max(300).nullable().optional(),
  linkPath: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type SaveExpenseCategoryRequest = z.infer<typeof SaveExpenseCategorySchema>;
