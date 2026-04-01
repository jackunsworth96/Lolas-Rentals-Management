import { z } from 'zod';
export const BookingChannel = {
    WooCommerce: 'woocommerce',
    Direct: 'direct',
};
export const OrdersRawStatusSchema = z.enum([
    'unprocessed',
    'processed',
    'skipped',
]);
/**
 * Public POST /submit body: direct booking fields plus session token for hold verification.
 * Single object schema so `z.infer` exposes every field reliably (used by submit-direct-booking).
 */
export const SubmitDirectBookingRequestSchema = z.object({
    sessionToken: z.string().min(1),
    customerName: z.string().min(1),
    customerEmail: z.string().email(),
    customerMobile: z.string().min(1),
    vehicleModelId: z.string().min(1),
    pickupDatetime: z.string().min(1),
    dropoffDatetime: z.string().min(1),
    pickupLocationId: z.number().int().positive(),
    dropoffLocationId: z.number().int().positive(),
    storeId: z.string().min(1),
    addonIds: z.array(z.number().int().positive()).optional(),
    transferType: z.enum(['shared', 'private']).nullable().optional(),
    flightNumber: z.string().optional(),
    flightArrivalTime: z.string().optional(),
    transferRoute: z.string().optional(),
    charityDonation: z.number().min(0).optional(),
    webPaymentMethod: z.string().optional(),
});
/**
 * Zod schema for creating a direct booking in `orders_raw` (same as submit body minus session token).
 * Source (lolas | bass) and booking_channel='direct' are set server-side.
 */
export const DirectBookingRequestSchema = SubmitDirectBookingRequestSchema.omit({
    sessionToken: true,
});
/**
 * Payload for creating a `booking_holds` row (`id` and `created_at` are DB defaults).
 */
export const CreateHoldSchema = z.object({
    vehicleModelId: z.string().min(1),
    storeId: z.string().min(1),
    pickupDatetime: z.string().min(1),
    dropoffDatetime: z.string().min(1),
    sessionToken: z.string().min(1),
    expiresAt: z.string().min(1),
});
//# sourceMappingURL=orders-raw-schemas.js.map