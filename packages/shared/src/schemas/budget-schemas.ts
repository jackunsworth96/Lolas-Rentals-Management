import { z } from 'zod';

export const UpsertBudgetLinesSchema = z.object({
  storeId: z.string().nullable(),
  year: z.number().int().min(2020).max(2100),
  lines: z.array(
    z.object({
      lineType: z.enum([
        'revenue',
        'expense',
        'payroll',
        'depreciation',
        'drawings',
        'transfer_revenue',
        'misc_revenue',
      ]),
      categoryLabel: z.string().min(1),
      coaAccountId: z.string().nullable().optional(),
      expenseCategoryId: z.number().int().nullable().optional(),
      month: z.number().int().min(1).max(12),
      amount: z.number().min(0),
    }),
  ),
});

export type UpsertBudgetLinesRequest = z.infer<typeof UpsertBudgetLinesSchema>;

export const GetBudgetQuerySchema = z.object({
  storeId: z.string().nullable().optional(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type GetBudgetQuery = z.infer<typeof GetBudgetQuerySchema>;

export const AutoFillQuerySchema = z.object({
  storeId: z.string().nullable().optional(),
  year: z.coerce.number().int().min(2020).max(2100),
});

export type AutoFillQuery = z.infer<typeof AutoFillQuerySchema>;
