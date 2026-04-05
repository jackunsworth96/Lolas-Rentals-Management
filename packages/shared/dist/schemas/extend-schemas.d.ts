import { z } from 'zod';
export declare const ExtendLookupRequestSchema: z.ZodObject<{
    email: z.ZodString;
    orderReference: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    orderReference: string;
}, {
    email: string;
    orderReference: string;
}>;
export type ExtendLookupRequest = z.infer<typeof ExtendLookupRequestSchema>;
export interface ExtendLookupOrder {
    orderReference: string;
    vehicleModelName: string;
    vehicleModelId: string;
    storeId: string;
    currentDropoffDatetime: string;
    pickupLocationName: string;
    originalTotal: number;
    rentalDays: number;
}
export type ExtendLookupResponse = {
    found: true;
    order: ExtendLookupOrder;
} | {
    found: false;
};
export declare const ExtendConfirmRequestSchema: z.ZodObject<{
    orderReference: z.ZodString;
    email: z.ZodString;
    newDropoffDatetime: z.ZodString;
    /** Staff-entered rate override — skips the no-downgrade check when provided */
    overrideDailyRate: z.ZodOptional<z.ZodNumber>;
    /** Whether the extension fee is collected now or left as a pending balance */
    paymentStatus: z.ZodOptional<z.ZodEnum<["paid", "unpaid"]>>;
    /** Payment method identifier (cash / gcash / card / bank_transfer) — required when paid */
    paymentMethod: z.ZodOptional<z.ZodString>;
    /** Account ID to credit — required when paid */
    paymentAccountId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
    overrideDailyRate?: number | undefined;
    paymentStatus?: "paid" | "unpaid" | undefined;
    paymentMethod?: string | undefined;
    paymentAccountId?: string | undefined;
}, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
    overrideDailyRate?: number | undefined;
    paymentStatus?: "paid" | "unpaid" | undefined;
    paymentMethod?: string | undefined;
    paymentAccountId?: string | undefined;
}>;
export type ExtendConfirmRequest = z.infer<typeof ExtendConfirmRequestSchema>;
export type ExtendConfirmResponse = {
    success: true;
    newDropoffDatetime: string;
    extensionCost: number;
} | {
    success: false;
    reason: string;
};
export interface ExtendPreviewResponse {
    extensionDays: number;
    dailyRate: number;
    extensionTotal: number;
    bracketLabel: string;
}
//# sourceMappingURL=extend-schemas.d.ts.map