import { z } from 'zod';
export declare const CreateTransferRequestSchema: z.ZodObject<{
    serviceDate: z.ZodString;
    customerName: z.ZodString;
    contactNumber: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    customerEmail: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    customerType: z.ZodDefault<z.ZodNullable<z.ZodEnum<["Walk-in", "Online"]>>>;
    route: z.ZodString;
    flightTime: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    paxCount: z.ZodDefault<z.ZodNumber>;
    vanType: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    accommodation: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    opsNotes: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    totalPrice: z.ZodNumber;
    paymentMethod: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    bookingSource: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    bookingToken: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    storeId: z.ZodString;
    orderId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    serviceDate: string;
    customerName: string;
    contactNumber: string | null;
    customerEmail: string | null;
    customerType: "Walk-in" | "Online" | null;
    route: string;
    flightTime: string | null;
    paxCount: number;
    vanType: string | null;
    accommodation: string | null;
    opsNotes: string | null;
    totalPrice: number;
    paymentMethod: string | null;
    bookingSource: string | null;
    bookingToken: string | null;
    storeId: string;
    orderId: string | null;
}, {
    serviceDate: string;
    customerName: string;
    route: string;
    totalPrice: number;
    storeId: string;
    contactNumber?: string | null | undefined;
    customerEmail?: string | null | undefined;
    customerType?: "Walk-in" | "Online" | null | undefined;
    flightTime?: string | null | undefined;
    paxCount?: number | undefined;
    vanType?: string | null | undefined;
    accommodation?: string | null | undefined;
    opsNotes?: string | null | undefined;
    paymentMethod?: string | null | undefined;
    bookingSource?: string | null | undefined;
    bookingToken?: string | null | undefined;
    orderId?: string | null | undefined;
}>;
export type CreateTransferRequest = z.infer<typeof CreateTransferRequestSchema>;
export declare const RecordTransferPaymentRequestSchema: z.ZodObject<{
    transferId: z.ZodString;
    amount: z.ZodNumber;
    paymentMethod: z.ZodString;
    date: z.ZodString;
    cashAccountId: z.ZodString;
    transferIncomeAccountId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    paymentMethod: string;
    transferId: string;
    amount: number;
    date: string;
    cashAccountId: string;
    transferIncomeAccountId: string;
}, {
    paymentMethod: string;
    transferId: string;
    amount: number;
    date: string;
    cashAccountId: string;
    transferIncomeAccountId: string;
}>;
export type RecordTransferPaymentRequest = z.infer<typeof RecordTransferPaymentRequestSchema>;
export declare const RecordDriverPaymentRequestSchema: z.ZodObject<{
    transferId: z.ZodString;
    driverFee: z.ZodNumber;
    date: z.ZodString;
    driverExpenseAccountId: z.ZodString;
    cashAccountId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    transferId: string;
    date: string;
    cashAccountId: string;
    driverFee: number;
    driverExpenseAccountId: string;
}, {
    transferId: string;
    date: string;
    cashAccountId: string;
    driverFee: number;
    driverExpenseAccountId: string;
}>;
export type RecordDriverPaymentRequest = z.infer<typeof RecordDriverPaymentRequestSchema>;
export declare const TransferQuerySchema: z.ZodObject<{
    storeId: z.ZodString;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    paymentStatus: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    status?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    paymentStatus?: string | undefined;
}, {
    storeId: string;
    status?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    paymentStatus?: string | undefined;
}>;
export type TransferQuery = z.infer<typeof TransferQuerySchema>;
export declare const PublicTransferBookingSchema: z.ZodObject<{
    customerName: z.ZodString;
    contactNumber: z.ZodString;
    flightNumber: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    serviceDate: z.ZodString;
    flightTime: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    paxCount: z.ZodNumber;
    route: z.ZodString;
    vanType: z.ZodEnum<["Shared", "Private", "TukTuk"]>;
    totalPrice: z.ZodNumber;
    opsNotes: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    serviceDate: string;
    customerName: string;
    contactNumber: string;
    route: string;
    flightTime: string | null;
    paxCount: number;
    vanType: "Shared" | "Private" | "TukTuk";
    opsNotes: string | null;
    totalPrice: number;
    flightNumber: string | null;
    token: string;
}, {
    serviceDate: string;
    customerName: string;
    contactNumber: string;
    route: string;
    paxCount: number;
    vanType: "Shared" | "Private" | "TukTuk";
    totalPrice: number;
    token: string;
    flightTime?: string | null | undefined;
    opsNotes?: string | null | undefined;
    flightNumber?: string | null | undefined;
}>;
export type PublicTransferBooking = z.infer<typeof PublicTransferBookingSchema>;
//# sourceMappingURL=transfer-schemas.d.ts.map