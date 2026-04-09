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
export declare const PublicExtendConfirmSchema: z.ZodObject<{
    orderReference: z.ZodString;
    email: z.ZodString;
    newDropoffDatetime: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
}, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
}>;
export declare const StaffExtendConfirmSchema: z.ZodObject<{
    orderReference: z.ZodString;
    email: z.ZodString;
    newDropoffDatetime: z.ZodString;
} & {
    overrideDailyRate: z.ZodOptional<z.ZodNumber>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["paid", "unpaid"]>>;
    paymentMethod: z.ZodOptional<z.ZodString>;
    paymentAccountId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
    paymentAccountId?: string | undefined;
    paymentMethod?: string | undefined;
    paymentStatus?: "paid" | "unpaid" | undefined;
    overrideDailyRate?: number | undefined;
}, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
    paymentAccountId?: string | undefined;
    paymentMethod?: string | undefined;
    paymentStatus?: "paid" | "unpaid" | undefined;
    overrideDailyRate?: number | undefined;
}>;
export declare const ExtendConfirmRequestSchema: z.ZodObject<{
    orderReference: z.ZodString;
    email: z.ZodString;
    newDropoffDatetime: z.ZodString;
} & {
    overrideDailyRate: z.ZodOptional<z.ZodNumber>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["paid", "unpaid"]>>;
    paymentMethod: z.ZodOptional<z.ZodString>;
    paymentAccountId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
    paymentAccountId?: string | undefined;
    paymentMethod?: string | undefined;
    paymentStatus?: "paid" | "unpaid" | undefined;
    overrideDailyRate?: number | undefined;
}, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
    paymentAccountId?: string | undefined;
    paymentMethod?: string | undefined;
    paymentStatus?: "paid" | "unpaid" | undefined;
    overrideDailyRate?: number | undefined;
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