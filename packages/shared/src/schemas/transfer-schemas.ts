import { z } from 'zod';
import { WhatsAppNumberSchema } from './whatsapp-schemas.js';

export const TransferCollectorSchema = z.enum(['lolas', 'driver']);

export const CreateTransferRequestSchema = z.object({
  serviceDate: z.string(),
  customerName: z.string().min(1),
  contactNumber: WhatsAppNumberSchema,
  customerEmail: z.string().email().nullable().default(null),
  customerType: z.enum(['Walk-in', 'Online']).nullable().default(null),
  route: z.string().min(1),
  flightTime: z.string().nullable().default(null),
  flightNumber: z.string().nullable().default(null),
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
  collectVia: TransferCollectorSchema.default('lolas'),
});

export type CreateTransferRequest = z.infer<typeof CreateTransferRequestSchema>;

/**
 * Customer payment on a transfer. `collector: 'lolas'` needs a payment method and
 * the account the money went into; `collector: 'driver'` records that the driver
 * took the cash and now owes Lola's until settlement.
 */
export const ReceiveTransferPaymentRequestSchema = z.object({
  transferId: z.string().min(1),
  amount: z.number().positive(),
  collector: TransferCollectorSchema,
  paymentMethod: z.string().min(1).nullable().default(null),
  cashAccountId: z.string().min(1).nullable().default(null),
  isCardPayment: z.boolean().default(false),
  date: z.string().min(1),
}).refine((v) => v.collector === 'driver' || !!v.paymentMethod, {
  message: 'Select a payment method',
  path: ['paymentMethod'],
});

export type ReceiveTransferPaymentRequest = z.infer<typeof ReceiveTransferPaymentRequestSchema>;

export const SettleDriverRequestSchema = z.object({
  storeId: z.string().min(1),
  transferIds: z.array(z.string()).min(1),
  date: z.string().min(1),
  /** Cash account the net settlement moves through; required when the net is non-zero and postJournal is true. */
  cashAccountId: z.string().min(1).nullable().default(null),
  driverExpenseAccountId: z.string().min(1).nullable().default(null),
  /** false = mark settled without posting, for jobs already paid outside the system. */
  postJournal: z.boolean().default(true),
});

export type SettleDriverRequest = z.infer<typeof SettleDriverRequestSchema>;

export const SetCollectViaRequestSchema = z.object({
  collectVia: TransferCollectorSchema,
});

export const TransferQuerySchema = z.object({
  storeId: z.string().optional(),
  orderId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  driverPaidStatus: z.string().optional(),
  scope: z.enum(['open', 'closed']).optional(),
}).refine((v) => !!v.storeId || !!v.orderId, {
  message: 'Either storeId or orderId must be provided',
});

export type TransferQuery = z.infer<typeof TransferQuerySchema>;

export const TransferSummaryQuerySchema = z.object({
  storeId: z.string(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type TransferSummaryQuery = z.infer<typeof TransferSummaryQuerySchema>;

export const PublicTransferBookingSchema = z.object({
  customerName:  z.string().min(1),
  contactNumber: WhatsAppNumberSchema,
  customerEmail: z.union([z.string().email(), z.literal(''), z.null()]).default(null).transform((v) => v || null),
  flightNumber:  z.string().nullable().default(null),
  serviceDate:   z.string().min(1),
  flightTime:    z.string().nullable().default(null),
  paxCount:      z.number().int().min(1).max(20),
  route:         z.string().min(1),
  vanType:       z.enum(['Shared', 'Private', 'TukTuk']),
  totalPrice:    z.number().positive(),
  accommodation: z.string().nullable().default(null),
  opsNotes:      z.string().nullable().default(null),
  token:         z.string().min(1).optional(),
  storeId:       z.string().min(1).optional(),
});

export type PublicTransferBooking = z.infer<typeof PublicTransferBookingSchema>;
