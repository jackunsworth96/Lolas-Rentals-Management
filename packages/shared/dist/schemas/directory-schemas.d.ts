import { z } from 'zod';
export declare const DirectoryContactSchema: z.ZodObject<{
    name: z.ZodString;
    number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>;
    relationship: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    gcash_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bank_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bank_account_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    number?: string | null | undefined;
    email?: string | null | undefined;
    relationship?: string | null | undefined;
    gcash_number?: string | null | undefined;
    category?: string | null | undefined;
    bank_name?: string | null | undefined;
    bank_account_number?: string | null | undefined;
    address?: string | null | undefined;
    notes?: string | null | undefined;
}, {
    name: string;
    number?: string | null | undefined;
    email?: string | null | undefined;
    relationship?: string | null | undefined;
    gcash_number?: string | null | undefined;
    category?: string | null | undefined;
    bank_name?: string | null | undefined;
    bank_account_number?: string | null | undefined;
    address?: string | null | undefined;
    notes?: string | null | undefined;
}>;
export type DirectoryContact = z.infer<typeof DirectoryContactSchema>;
//# sourceMappingURL=directory-schemas.d.ts.map