import { z } from 'zod';

export const DirectoryContactSchema = z.object({
  name: z.string().min(1),
  number: z.string().optional(),
  email: z.union([z.string().email(), z.literal(''), z.undefined()]).optional(),
  relationship: z.string().optional(),
  gcash_number: z.string().optional(),
  category: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export type DirectoryContact = z.infer<typeof DirectoryContactSchema>;
