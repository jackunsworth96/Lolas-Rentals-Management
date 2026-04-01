import { z } from 'zod';
export const LostOpportunityQuerySchema = z.object({
    storeId: z.string(),
    date: z.string(),
});
export const CreateLostOpportunitySchema = z.object({
    storeId: z.string(),
    date: z.string(),
    time: z.string().nullable().optional(),
    vehicleRequested: z.string().nullable().optional(),
    quantity: z.number().int().positive().default(1),
    durationDays: z.number().int().positive().nullable().optional(),
    estValue: z.number().nonnegative().nullable().optional(),
    reason: z.string().min(1),
    outcome: z.string().nullable().optional(),
    staffNotes: z.string().nullable().optional(),
});
export const UpdateLostOpportunitySchema = z.object({
    storeId: z.string(),
    date: z.string().optional(),
    time: z.string().nullable().optional(),
    vehicleRequested: z.string().nullable().optional(),
    quantity: z.number().int().positive().optional(),
    durationDays: z.number().int().positive().nullable().optional(),
    estValue: z.number().nonnegative().nullable().optional(),
    reason: z.string().min(1).optional(),
    outcome: z.string().nullable().optional(),
    staffNotes: z.string().nullable().optional(),
});
//# sourceMappingURL=lost-opportunity-schemas.js.map