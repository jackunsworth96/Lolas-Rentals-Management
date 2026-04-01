import { z } from 'zod';
export const ExtendLookupRequestSchema = z.object({
    email: z.string().email(),
    orderReference: z.string().min(1),
});
export const ExtendConfirmRequestSchema = z.object({
    orderReference: z.string().min(1),
    email: z.string().email(),
    newDropoffDatetime: z.string().min(1),
});
//# sourceMappingURL=extend-schemas.js.map