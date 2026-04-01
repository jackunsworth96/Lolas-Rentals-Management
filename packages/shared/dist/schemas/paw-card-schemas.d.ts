import { z } from 'zod';
export declare const PawCardLookupQuerySchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodString>;
    mobile: z.ZodOptional<z.ZodString>;
    orderId: z.ZodOptional<z.ZodString>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    orderId?: string | undefined;
    email?: string | undefined;
    mobile?: string | undefined;
    q?: string | undefined;
}, {
    orderId?: string | undefined;
    email?: string | undefined;
    mobile?: string | undefined;
    q?: string | undefined;
}>;
export type PawCardLookupQuery = z.infer<typeof PawCardLookupQuerySchema>;
export declare const PawCardSubmitRequestSchema: z.ZodObject<{
    customerId: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    fullName: z.ZodOptional<z.ZodString>;
    orderId: z.ZodOptional<z.ZodString>;
    establishmentId: z.ZodString;
    discountAmount: z.ZodNumber;
    visitDate: z.ZodString;
    storeId: z.ZodOptional<z.ZodString>;
    receiptUrl: z.ZodOptional<z.ZodString>;
    numberOfPeople: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    customerId: string;
    establishmentId: string;
    discountAmount: number;
    visitDate: string;
    orderId?: string | undefined;
    storeId?: string | undefined;
    fullName?: string | undefined;
    email?: string | undefined;
    receiptUrl?: string | undefined;
    numberOfPeople?: number | undefined;
}, {
    customerId: string;
    establishmentId: string;
    discountAmount: number;
    visitDate: string;
    orderId?: string | undefined;
    storeId?: string | undefined;
    fullName?: string | undefined;
    email?: string | undefined;
    receiptUrl?: string | undefined;
    numberOfPeople?: number | undefined;
}>;
export type PawCardSubmitRequest = z.infer<typeof PawCardSubmitRequestSchema>;
export declare const PawCardMySubmissionsQuerySchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export type PawCardMySubmissionsQuery = z.infer<typeof PawCardMySubmissionsQuerySchema>;
export declare const PawCardRegisterSchema: z.ZodObject<{
    fullName: z.ZodString;
    email: z.ZodString;
    mobile: z.ZodOptional<z.ZodString>;
    orderId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    fullName: string;
    email: string;
    orderId?: string | undefined;
    mobile?: string | undefined;
}, {
    fullName: string;
    email: string;
    orderId?: string | undefined;
    mobile?: string | undefined;
}>;
export type PawCardRegister = z.infer<typeof PawCardRegisterSchema>;
export declare const PawCardLeaderboardQuerySchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
}, {
    email?: string | undefined;
}>;
export type PawCardLeaderboardQuery = z.infer<typeof PawCardLeaderboardQuerySchema>;
//# sourceMappingURL=paw-card-schemas.d.ts.map