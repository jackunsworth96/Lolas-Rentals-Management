import { z } from 'zod';
export declare const DirectoryContactSchema: z.ZodObject<{
    name: z.ZodString;
    number: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodUndefined]>>;
    relationship: z.ZodOptional<z.ZodString>;
    gcash_number: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    bank_name: z.ZodOptional<z.ZodString>;
    bank_account_number: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    number?: string | undefined;
    email?: string | undefined;
    relationship?: string | undefined;
    gcash_number?: string | undefined;
    category?: string | undefined;
    bank_name?: string | undefined;
    bank_account_number?: string | undefined;
    address?: string | undefined;
    notes?: string | undefined;
}, {
    name: string;
    number?: string | undefined;
    email?: string | undefined;
    relationship?: string | undefined;
    gcash_number?: string | undefined;
    category?: string | undefined;
    bank_name?: string | undefined;
    bank_account_number?: string | undefined;
    address?: string | undefined;
    notes?: string | undefined;
}>;
export type DirectoryContact = z.infer<typeof DirectoryContactSchema>;
//# sourceMappingURL=directory-schemas.d.ts.map