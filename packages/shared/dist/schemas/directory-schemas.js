import { z } from 'zod';
export const DirectoryContactSchema = z.object({
    name: z.string().min(1),
    number: z.string().nullable().optional(),
    email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
    relationship: z.string().nullable().optional(),
    gcash_number: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    bank_name: z.string().nullable().optional(),
    bank_account_number: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
});
//# sourceMappingURL=directory-schemas.js.map