import { z } from 'zod';
export const CreateTransferRequestSchema = z.object({
    serviceDate: z.string(),
    customerName: z.string().min(1),
    contactNumber: z.string().nullable().default(null),
    customerEmail: z.string().email().nullable().default(null),
    customerType: z.enum(['Walk-in', 'Online']).nullable().default(null),
    route: z.string().min(1),
    flightTime: z.string().nullable().default(null),
    paxCount: z.number().int().positive().default(1),
    vanType: z.string().nullable().default(null),
    accommodation: z.string().nullable().default(null),
    opsNotes: z.string().nullable().default(null),
    totalPrice: z.number().positive(),
    paymentMethod: z.string().nullable().default(null),
    bookingSource: z.string().nullable().default(null),
    bookingToken: z.string().nullable().default(null),
    storeId: z.string(),
    orderId: z.string().nullable().default(null),
});
export const RecordTransferPaymentRequestSchema = z.object({
    transferId: z.string(),
    amount: z.number().positive(),
    paymentMethod: z.string(),
    date: z.string(),
    cashAccountId: z.string(),
    transferIncomeAccountId: z.string(),
});
export const RecordDriverPaymentRequestSchema = z.object({
    transferId: z.string(),
    driverFee: z.number().positive(),
    date: z.string(),
    driverExpenseAccountId: z.string(),
    cashAccountId: z.string(),
});
export const TransferQuerySchema = z.object({
    storeId: z.string(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    status: z.string().optional(),
    paymentStatus: z.string().optional(),
});
export const PublicTransferBookingSchema = z.object({
    customerName: z.string().min(1),
    contactNumber: z.string().min(1),
    customerEmail: z.union([z.string().email(), z.literal(''), z.null()]).default(null).transform((v) => v || null),
    flightNumber: z.string().nullable().default(null),
    serviceDate: z.string().min(1),
    flightTime: z.string().nullable().default(null),
    paxCount: z.number().int().min(1).max(20),
    route: z.string().min(1),
    vanType: z.enum(['Shared', 'Private', 'TukTuk']),
    totalPrice: z.number().positive(),
    accommodation: z.string().nullable().default(null),
    opsNotes: z.string().nullable().default(null),
    token: z.string().min(1).optional(),
    storeId: z.string().min(1).optional(),
});
//# sourceMappingURL=transfer-schemas.js.map