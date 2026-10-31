import { z } from 'zod';

export const InvoiceLineTypeSchema = z.enum([
  'rental',
  'addon',
  'fee',
  'transfer',
  'charity',
  'surcharge',
  'return_charge',
  'discount',
  'adjustment',
  'payment',
]);

export type InvoiceLineType = z.infer<typeof InvoiceLineTypeSchema>;

export type InvoiceOrderStage = 'inbox' | 'active' | 'completed' | 'cancelled';

export interface InvoiceLine {
  orderReference: string;
  lineType: InvoiceLineType;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** One order's contribution to an invoice. Payment lines are negative amounts. */
export interface InvoiceOrderSummary {
  orderReference: string;
  stage: InvoiceOrderStage;
  customerName: string | null;
  customerEmail: string | null;
  customerCompany: string | null;
  storeId: string | null;
  pickupDatetime: string | null;
  dropoffDatetime: string | null;
  charges: number;
  paid: number;
  depositHeld: number;
  lines: InvoiceLine[];
}

export interface InvoiceTotals {
  subtotal: number;
  amountPaid: number;
  balanceDue: number;
  depositHeld: number;
}

export interface InvoicePreview extends InvoiceTotals {
  orders: InvoiceOrderSummary[];
  /** References that matched no booking. */
  missing: string[];
}

export interface InvoiceSettings {
  legalName: string;
  address: string | null;
  tin: string | null;
  email: string | null;
  phone: string | null;
  showLogo: boolean;
  paymentInstructions: string | null;
  footerNote: string | null;
  numberPrefix: string;
  nextNumber: number;
}

export interface InvoiceBillTo {
  billToName: string;
  billToCompany: string | null;
  billToAddress: string | null;
  billToEmail: string | null;
  billToTin: string | null;
}

export interface Invoice extends InvoiceBillTo, InvoiceTotals {
  id: string;
  invoiceNumber: string;
  storeId: string | null;
  status: 'issued' | 'void';
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  orderReferences: string[];
  lines: InvoiceLine[];
  lastRefreshedAt: string;
  voidedAt: string | null;
  createdAt: string;
}

export interface InvoiceOrderSearchResult {
  orderReference: string;
  stage: InvoiceOrderStage;
  customerName: string | null;
  customerEmail: string | null;
  storeId: string | null;
  pickupDatetime: string | null;
  dropoffDatetime: string | null;
  total: number | null;
}

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));

const OrderReferencesSchema = z.array(z.string().trim().min(1).max(120)).min(1).max(50);

export const InvoicePreviewRequestSchema = z.object({
  orderReferences: OrderReferencesSchema,
});

export const CreateInvoiceRequestSchema = z.object({
  orderReferences: OrderReferencesSchema,
  billToName: z.string().trim().min(1).max(200),
  billToCompany: optionalText(200),
  billToAddress: optionalText(500),
  billToEmail: optionalText(200),
  billToTin: optionalText(50),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: optionalText(2000),
});

export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceRequestSchema>;

export const UpdateInvoiceRequestSchema = CreateInvoiceRequestSchema.partial();

export type UpdateInvoiceRequest = z.infer<typeof UpdateInvoiceRequestSchema>;

export const InvoiceListQuerySchema = z.object({
  orderReference: z.string().optional(),
  q: z.string().optional(),
  status: z.enum(['issued', 'void']).optional(),
});

export const InvoiceOrderSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  storeId: z.string().optional(),
});

export const UpdateInvoiceSettingsRequestSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  address: optionalText(500),
  tin: optionalText(50),
  email: optionalText(200),
  phone: optionalText(50),
  showLogo: z.boolean(),
  paymentInstructions: optionalText(2000),
  footerNote: optionalText(1000),
  numberPrefix: z.string().trim().max(20),
  nextNumber: z.number().int().positive(),
});

export type UpdateInvoiceSettingsRequest = z.infer<typeof UpdateInvoiceSettingsRequestSchema>;
