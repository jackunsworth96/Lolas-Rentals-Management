import { z } from 'zod';
export const BookingChannel = {
    WooCommerce: 'woocommerce',
    Direct: 'direct',
    WalkIn: 'walk_in',
};
export const OrdersRawStatusSchema = z.enum([
    'unprocessed',
    'processed',
    'skipped',
    'cancelled',
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
    transferType: z.enum(['shared', 'private', 'tuktuk']).nullable().optional(),
    flightNumber: z.string().optional(),
    flightArrivalTime: z.string().optional(),
    transferRoute: z.string().optional(),
    charityDonation: z.number().min(0).optional(),
    webPaymentMethod: z.string().optional(),
    /** Requested helmet count for scooter/bike direct bookings (1 default, 2 if extra helmet requested). */
    helmet_count: z.number().int().min(1).max(2).optional(),
    /** ID of the specific hold being consumed. Used server-side to delete only that hold row. */
    holdId: z.string().optional(),
    /** Total price of any transfer booked alongside this rental (for email/receipt display). */
    transferAmount: z.number().min(0).optional(),
    /** Number of passengers for the transfer (defaults to 1 if not provided). */
    transferPaxCount: z.number().int().positive().optional(),
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