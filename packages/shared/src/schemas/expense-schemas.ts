import { z } from 'zod';

export const CreateExpenseRequestSchema = z.object({
  storeId: z.string(),
  date: z.string(),
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().positive(),
  paidFrom: z.string().nullable().default(null),
  vehicleId: z.string().nullable().default(null),
  employeeId: z.string().nullable().default(null),
  expenseAccountId: z.string(),
  cashAccountId: z.string().default(''),
  status: z.enum(['paid', 'unpaid']).default('paid'),
});

export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequestSchema>;

export const UpdateExpenseRequestSchema = z.object({
  date: z.string().optional(),
  category: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  paidFrom: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  expenseAccountId: z.string().optional(),
  cashAccountId: z.string().optional(),
});

export type UpdateExpenseRequest = z.infer<typeof UpdateExpenseRequestSchema>;

export const ExpenseQuerySchema = z.object({
  storeId: z.string(),
  date: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  category: z.string().optional(),
});

export type ExpenseQuery = z.infer<typeof ExpenseQuerySchema>;

export const PayExpensesSchema = z.object({
  expenseIds: z.array(z.string()).min(1),
  paymentMethodId: z.string(),
  storeId: z.string(),
});

export type PayExpensesRequest = z.infer<typeof PayExpensesSchema>;
