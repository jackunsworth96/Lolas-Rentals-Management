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
}, "strip", z.ZodTypeAny, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
}, {
    email: string;
    orderReference: string;
    newDropoffDatetime: string;
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
//# sourceMappingURL=extend-schemas.d.ts.map