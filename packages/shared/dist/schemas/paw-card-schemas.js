import { z } from 'zod';
export const PawCardLookupQuerySchema = z.object({
    email: z.string().optional(),
    mobile: z.string().optional(),
    orderId: z.string().optional(),
    q: z.string().optional(),
});
export const PawCardSubmitRequestSchema = z.object({
    customerId: z.string(),
    email: z.string().email().optional(),
    fullName: z.string().min(1).optional(),
    orderId: z.string().optional(),
    establishmentId: z.string(),
    discountAmount: z.number().positive(),
    visitDate: z.string(),
    storeId: z.string().optional(),
    receiptUrl: z.string().optional(),
    numberOfPeople: z.number().int().positive().optional(),
});
export const PawCardMySubmissionsQuerySchema = z.object({
    email: z.string(),
});
export const PawCardRegisterSchema = z.object({
    fullName: z.string().min(1),
    email: z.string().email(),
    mobile: z.string().optional(),
    orderId: z.string().optional(),
});
export const PawCardLeaderboardQuerySchema = z.object({
    email: z.string().optional(),
});
//# sourceMappingURL=paw-card-schemas.js.map