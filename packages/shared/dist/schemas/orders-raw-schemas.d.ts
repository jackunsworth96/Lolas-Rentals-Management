import { z } from 'zod';
export declare const BookingChannel: {
    readonly WooCommerce: "woocommerce";
    readonly Direct: "direct";
    readonly WalkIn: "walk_in";
};
export type BookingChannelType = (typeof BookingChannel)[keyof typeof BookingChannel];
export declare const OrdersRawStatusSchema: z.ZodEnum<["unprocessed", "processed", "skipped", "cancelled"]>;
export type OrdersRawStatus = z.infer<typeof OrdersRawStatusSchema>;
/**
 * Matches the `orders_raw` Supabase table (migrations 011, 035, 038, 041, 042).
 * Direct-booking quote totals are stored in `payload.web_quote` (jsonb), not a top-level column.
 */
export interface OrdersRawRow {
    id: string;
    source: string;
    booking_channel: BookingChannelType;
    payload: Record<string, unknown> | null;
    status: OrdersRawStatus;
    created_at: string;
    customer_name: string | null;
    customer_email: string | null;
    customer_mobile: string | null;
    vehicle_model_id: string | null;
    pickup_datetime: string | null;
    dropoff_datetime: string | null;
    pickup_location_id: number | null;
    dropoff_location_id: number | null;
    store_id: string | null;
    order_reference: string | null;
    addon_ids: number[] | null;
    transfer_type: string | null;
    flight_number: string | null;
    flight_arrival_time: string | null;
    transfer_route: string | null;
    charity_donation: number;
    web_payment_method: string | null;
}
/**
 * Public POST /submit body: direct booking fields plus session token for hold verification.
 * Single object schema so `z.infer` exposes every field reliably (used by submit-direct-booking).
 */
export declare const SubmitDirectBookingRequestSchema: z.ZodObject<{
    sessionToken: z.ZodString;
    customerName: z.ZodString;
    customerEmail: z.ZodString;
    customerMobile: z.ZodString;
    vehicleModelId: z.ZodString;
    pickupDatetime: z.ZodString;
    dropoffDatetime: z.ZodString;
    pickupLocationId: z.ZodNumber;
    dropoffLocationId: z.ZodNumber;
    storeId: z.ZodString;
    addonIds: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    transferType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["shared", "private", "tuktuk"]>>>;
    flightNumber: z.ZodOptional<z.ZodString>;
    flightArrivalTime: z.ZodOptional<z.ZodString>;
    transferRoute: z.ZodOptional<z.ZodString>;
    charityDonation: z.ZodOptional<z.ZodNumber>;
    webPaymentMethod: z.ZodOptional<z.ZodString>;
    /** Requested helmet count for scooter/bike direct bookings (1 default, 2 if extra helmet requested). */
    helmet_count: z.ZodOptional<z.ZodNumber>;
    /** ID of the specific hold being consumed. Used server-side to delete only that hold row. */
    holdId: z.ZodOptional<z.ZodString>;
    /** Total price of any transfer booked alongside this rental (for email/receipt display). */
    transferAmount: z.ZodOptional<z.ZodNumber>;
    /** Number of passengers for the transfer (defaults to 1 if not provided). */
    transferPaxCount: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    sessionToken: string;
    customerName: string;
    customerEmail: string;
    customerMobile: string;
    vehicleModelId: string;
    pickupDatetime: string;
    dropoffDatetime: string;
    pickupLocationId: number;
    dropoffLocationId: number;
    storeId: string;
    addonIds?: number[] | undefined;
    transferType?: "shared" | "private" | "tuktuk" | null | undefined;
    flightNumber?: string | undefined;
    flightArrivalTime?: string | undefined;
    transferRoute?: string | undefined;
    charityDonation?: number | undefined;
    webPaymentMethod?: string | undefined;
    helmet_count?: number | undefined;
    holdId?: string | undefined;
    transferAmount?: number | undefined;
    transferPaxCount?: number | undefined;
}, {
    sessionToken: string;
    customerName: string;
    customerEmail: string;
    customerMobile: string;
    vehicleModelId: string;
    pickupDatetime: string;
    dropoffDatetime: string;
    pickupLocationId: number;
    dropoffLocationId: number;
    storeId: string;
    addonIds?: number[] | undefined;
    transferType?: "shared" | "private" | "tuktuk" | null | undefined;
    flightNumber?: string | undefined;
    flightArrivalTime?: string | undefined;
    transferRoute?: string | undefined;
    charityDonation?: number | undefined;
    webPaymentMethod?: string | undefined;
    helmet_count?: number | undefined;
    holdId?: string | undefined;
    transferAmount?: number | undefined;
    transferPaxCount?: number | undefined;
}>;
export type SubmitDirectBookingInput = z.infer<typeof SubmitDirectBookingRequestSchema>;
/**
 * Zod schema for creating a direct booking in `orders_raw` (same as submit body minus session token).
 * Source (lolas | bass) and booking_channel='direct' are set server-side.
 */
export declare const DirectBookingRequestSchema: z.ZodObject<Omit<{
    sessionToken: z.ZodString;
    customerName: z.ZodString;
    customerEmail: z.ZodString;
    customerMobile: z.ZodString;
    vehicleModelId: z.ZodString;
    pickupDatetime: z.ZodString;
    dropoffDatetime: z.ZodString;
    pickupLocationId: z.ZodNumber;
    dropoffLocationId: z.ZodNumber;
    storeId: z.ZodString;
    addonIds: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    transferType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["shared", "private", "tuktuk"]>>>;
    flightNumber: z.ZodOptional<z.ZodString>;
    flightArrivalTime: z.ZodOptional<z.ZodString>;
    transferRoute: z.ZodOptional<z.ZodString>;
    charityDonation: z.ZodOptional<z.ZodNumber>;
    webPaymentMethod: z.ZodOptional<z.ZodString>;
    /** Requested helmet count for scooter/bike direct bookings (1 default, 2 if extra helmet requested). */
    helmet_count: z.ZodOptional<z.ZodNumber>;
    /** ID of the specific hold being consumed. Used server-side to delete only that hold row. */
    holdId: z.ZodOptional<z.ZodString>;
    /** Total price of any transfer booked alongside this rental (for email/receipt display). */
    transferAmount: z.ZodOptional<z.ZodNumber>;
    /** Number of passengers for the transfer (defaults to 1 if not provided). */
    transferPaxCount: z.ZodOptional<z.ZodNumber>;
}, "sessionToken">, "strip", z.ZodTypeAny, {
    customerName: string;
    customerEmail: string;
    customerMobile: string;
    vehicleModelId: string;
    pickupDatetime: string;
    dropoffDatetime: string;
    pickupLocationId: number;
    dropoffLocationId: number;
    storeId: string;
    addonIds?: number[] | undefined;
    transferType?: "shared" | "private" | "tuktuk" | null | undefined;
    flightNumber?: string | undefined;
    flightArrivalTime?: string | undefined;
    transferRoute?: string | undefined;
    charityDonation?: number | undefined;
    webPaymentMethod?: string | undefined;
    helmet_count?: number | undefined;
    holdId?: string | undefined;
    transferAmount?: number | undefined;
    transferPaxCount?: number | undefined;
}, {
    customerName: string;
    customerEmail: string;
    customerMobile: string;
    vehicleModelId: string;
    pickupDatetime: string;
    dropoffDatetime: string;
    pickupLocationId: number;
    dropoffLocationId: number;
    storeId: string;
    addonIds?: number[] | undefined;
    transferType?: "shared" | "private" | "tuktuk" | null | undefined;
    flightNumber?: string | undefined;
    flightArrivalTime?: string | undefined;
    transferRoute?: string | undefined;
    charityDonation?: number | undefined;
    webPaymentMethod?: string | undefined;
    helmet_count?: number | undefined;
    holdId?: string | undefined;
    transferAmount?: number | undefined;
    transferPaxCount?: number | undefined;
}>;
export type DirectBookingRequest = z.infer<typeof DirectBookingRequestSchema>;
/**
 * Matches the `booking_holds` Supabase table (migration 036).
 */
export interface BookingHold {
    id: string;
    vehicle_model_id: string;
    store_id: string;
    pickup_datetime: string;
    dropoff_datetime: string;
    session_token: string;
    expires_at: string;
    created_at: string;
}
/**
 * Payload for creating a `booking_holds` row (`id` and `created_at` are DB defaults).
 */
export declare const CreateHoldSchema: z.ZodObject<{
    vehicleModelId: z.ZodString;
    storeId: z.ZodString;
    pickupDatetime: z.ZodString;
    dropoffDatetime: z.ZodString;
    sessionToken: z.ZodString;
    expiresAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sessionToken: string;
    vehicleModelId: string;
    pickupDatetime: string;
    dropoffDatetime: string;
    storeId: string;
    expiresAt: string;
}, {
    sessionToken: string;
    vehicleModelId: string;
    pickupDatetime: string;
    dropoffDatetime: string;
    storeId: string;
    expiresAt: string;
}>;
export type CreateHold = z.infer<typeof CreateHoldSchema>;
export interface QuoteAddonLine {
    id: number;
    name: string;
    type: 'per_day' | 'one_time';
    unitPrice: number;
    total: number;
}
export interface QuoteBreakdown {
    rentalDays: number;
    dailyRate: number;
    rentalSubtotal: number;
    pickupFee: number;
    dropoffFee: number;
    addons: QuoteAddonLine[];
    addonsTotal: number;
    /** Refundable security deposit (e.g. cash/card hold at pickup); not included in grandTotal */
    securityDeposit: number;
    /** Rental + add-ons only; location fees excluded (fees are shared across the order, not per-vehicle) */
    grandTotal: number;
    /** grandTotal plus pickupFee + dropoffFee; use for single-vehicle display or full order totals */
    grandTotalWithFees: number;
}
//# sourceMappingURL=orders-raw-schemas.d.ts.map