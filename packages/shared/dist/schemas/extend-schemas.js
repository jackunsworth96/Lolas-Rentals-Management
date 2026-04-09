import { z } from 'zod';
export const ExtendLookupRequestSchema = z.object({
    email: z.string().email(),
    orderReference: z.string().min(1),
});
export const PublicExtendConfirmSchema = z.object({
    orderReference: z.string().min(1),
    email: z.string().email(),
    newDropoffDatetime: z.string().min(1),
});
export const StaffExtendConfirmSchema = PublicExtendConfirmSchema.extend({
    overrideDailyRate: z.number().positive().optional(),
    paymentStatus: z.enum(['paid', 'unpaid']).optional(),
    paymentMethod: z.string().optional(),
    paymentAccountId: z.string().optional(),
});
export const ExtendConfirmRequestSchema = StaffExtendConfirmSchema;
//# sourceMappingURL=extend-schemas.js.map