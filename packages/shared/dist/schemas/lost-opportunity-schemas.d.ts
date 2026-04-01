import { z } from 'zod';
export declare const LostOpportunityQuerySchema: z.ZodObject<{
    storeId: z.ZodString;
    date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    date: string;
    storeId: string;
}, {
    date: string;
    storeId: string;
}>;
export type LostOpportunityQuery = z.infer<typeof LostOpportunityQuerySchema>;
export declare const CreateLostOpportunitySchema: z.ZodObject<{
    storeId: z.ZodString;
    date: z.ZodString;
    time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    vehicleRequested: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    quantity: z.ZodDefault<z.ZodNumber>;
    durationDays: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    estValue: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    reason: z.ZodString;
    outcome: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    staffNotes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    date: string;
    quantity: number;
    storeId: string;
    reason: string;
    time?: string | null | undefined;
    vehicleRequested?: string | null | undefined;
    durationDays?: number | null | undefined;
    estValue?: number | null | undefined;
    outcome?: string | null | undefined;
    staffNotes?: string | null | undefined;
}, {
    date: string;
    storeId: string;
    reason: string;
    quantity?: number | undefined;
    time?: string | null | undefined;
    vehicleRequested?: string | null | undefined;
    durationDays?: number | null | undefined;
    estValue?: number | null | undefined;
    outcome?: string | null | undefined;
    staffNotes?: string | null | undefined;
}>;
export type CreateLostOpportunityInput = z.infer<typeof CreateLostOpportunitySchema>;
export declare const UpdateLostOpportunitySchema: z.ZodObject<{
    storeId: z.ZodString;
    date: z.ZodOptional<z.ZodString>;
    time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    vehicleRequested: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    quantity: z.ZodOptional<z.ZodNumber>;
    durationDays: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    estValue: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    reason: z.ZodOptional<z.ZodString>;
    outcome: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    staffNotes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    date?: string | undefined;
    quantity?: number | undefined;
    time?: string | null | undefined;
    reason?: string | undefined;
    vehicleRequested?: string | null | undefined;
    durationDays?: number | null | undefined;
    estValue?: number | null | undefined;
    outcome?: string | null | undefined;
    staffNotes?: string | null | undefined;
}, {
    storeId: string;
    date?: string | undefined;
    quantity?: number | undefined;
    time?: string | null | undefined;
    reason?: string | undefined;
    vehicleRequested?: string | null | undefined;
    durationDays?: number | null | undefined;
    estValue?: number | null | undefined;
    outcome?: string | null | undefined;
    staffNotes?: string | null | undefined;
}>;
export type UpdateLostOpportunityInput = z.infer<typeof UpdateLostOpportunitySchema>;
//# sourceMappingURL=lost-opportunity-schemas.d.ts.map