import { z } from 'zod';
export const ExtendLookupRequestSchema = z.object({
    email: z.string().email(),
    orderReference: z.string().min(1),
});
export const ExtendConfirmRequestSchema = z.object({
    orderReference: z.string().min(1),
    email: z.string().email(),
    newDropoffDatetime: z.string().min(1),
    /** Staff-entered rate override — skips the no-downgrade check when provided */
    overrideDailyRate: z.number().positive().optional(),
    /** Whether the extension fee is collected now or left as a pending balance */
    paymentStatus: z.enum(['paid', 'unpaid']).optional(),
    /** Payment method identifier (cash / gcash / card / bank_transfer) — required when paid */
    paymentMethod: z.string().optional(),
    /** Account ID to credit — required when paid */
    paymentAccountId: z.string().optional(),
});
//# sourceMappingURL=extend-schemas.js.map