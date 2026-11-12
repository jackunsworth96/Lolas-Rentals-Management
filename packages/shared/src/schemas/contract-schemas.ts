import { z } from 'zod';

export const ContractCategorySchema = z.enum(['accommodation_partner', 'paw_card_partner', 'staff', 'other']);
export type ContractCategory = z.infer<typeof ContractCategorySchema>;

export const ContractCounterpartyTypeSchema = z.enum(['accommodation_partner', 'paw_card_establishment', 'employee', 'external']);
export type ContractCounterpartyType = z.infer<typeof ContractCounterpartyTypeSchema>;

export const ContractStatusSchema = z.enum(['draft', 'sent', 'viewed', 'completed', 'voided', 'expired']);
export type ContractStatus = z.infer<typeof ContractStatusSchema>;

export const CONTRACT_CATEGORY_LABELS: Record<ContractCategory, string> = {
  accommodation_partner: 'Accommodation partner',
  paw_card_partner: 'Paw Card partner',
  staff: 'Staff',
  other: 'Other',
};

/** The linked record type that suits each category by default. */
export const CONTRACT_CATEGORY_COUNTERPARTY: Record<ContractCategory, ContractCounterpartyType> = {
  accommodation_partner: 'accommodation_partner',
  paw_card_partner: 'paw_card_establishment',
  staff: 'employee',
  other: 'external',
};

/**
 * Fields a linked record exposes for auto-filling placeholders
 * (a placeholder's `source` is one of these keys).
 */
export const CONTRACT_COUNTERPARTY_FIELDS: Record<ContractCounterpartyType, { key: string; label: string }[]> = {
  accommodation_partner: [
    { key: 'name', label: 'Partner name' },
    { key: 'contact_name', label: 'Contact name' },
    { key: 'contact_email', label: 'Contact email' },
    { key: 'contact_whatsapp', label: 'Contact WhatsApp' },
    { key: 'commission_type', label: 'Commission type' },
    { key: 'commission_value', label: 'Commission value' },
    { key: 'store_name', label: 'Store' },
  ],
  paw_card_establishment: [
    { key: 'name', label: 'Establishment name' },
    { key: 'category', label: 'Category' },
    { key: 'discount_headline', label: 'Offer headline' },
    { key: 'discount_conditions', label: 'Offer conditions' },
    { key: 'discount_code', label: 'Discount code' },
  ],
  employee: [
    { key: 'full_name', label: 'Full name' },
    { key: 'role', label: 'Role' },
    { key: 'start_date', label: 'Start date' },
    { key: 'probation_end_date', label: 'Probation end date' },
    { key: 'rate_type', label: 'Rate type' },
    { key: 'basic_rate', label: 'Basic rate' },
    { key: 'store_name', label: 'Store' },
  ],
  external: [],
};

export const ContractPlaceholderTypeSchema = z.enum(['text', 'multiline', 'date', 'number', 'money']);

export const ContractPlaceholderFieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Use letters, numbers and underscores, starting with a letter').max(60),
  label: z.string().trim().min(1).max(120),
  type: ContractPlaceholderTypeSchema.default('text'),
  required: z.boolean().default(true),
  defaultValue: z.string().max(5000).optional(),
  source: z.string().max(60).optional(),
});
export type ContractPlaceholderField = z.infer<typeof ContractPlaceholderFieldSchema>;

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));

const PlaceholderListSchema = z.array(ContractPlaceholderFieldSchema).max(100)
  .refine((fields) => new Set(fields.map((f) => f.key)).size === fields.length, 'Placeholder keys must be unique');

export const CreateContractTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: ContractCategorySchema,
  description: optionalText(1000),
  bodyMarkdown: z.string().max(200_000),
  placeholders: PlaceholderListSchema,
  isActive: z.boolean().default(true),
});
export type CreateContractTemplateRequest = z.infer<typeof CreateContractTemplateRequestSchema>;

export const UpdateContractTemplateRequestSchema = CreateContractTemplateRequestSchema.partial();
export type UpdateContractTemplateRequest = z.infer<typeof UpdateContractTemplateRequestSchema>;

const ValuesSchema = z.record(z.string().max(60), z.string().max(5000));

export const CreateContractRequestSchema = z.object({
  templateId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  category: ContractCategorySchema,
  counterpartyType: ContractCounterpartyTypeSchema.default('external'),
  counterpartyId: optionalText(100),
  recipientName: z.string().trim().min(1).max(200),
  recipientEmail: z.string().trim().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  values: ValuesSchema.default({}),
  renderedBody: z.string().max(200_000),
});
export type CreateContractRequest = z.infer<typeof CreateContractRequestSchema>;

export const UpdateContractRequestSchema = CreateContractRequestSchema.omit({ templateId: true }).partial();
export type UpdateContractRequest = z.infer<typeof UpdateContractRequestSchema>;

const SignatureDataUrlSchema = z.string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Signature must be a PNG image')
  .max(2_000_000);

export const SendContractRequestSchema = z.object({
  lolaSignerName: z.string().trim().min(1).max(200),
  lolaSignerTitle: optionalText(200),
  signatureDataUrl: SignatureDataUrlSchema,
  sendEmail: z.boolean().default(true),
  expiresInDays: z.number().int().min(1).max(180).default(30),
});
export type SendContractRequest = z.infer<typeof SendContractRequestSchema>;

export const ResendContractRequestSchema = z.object({
  sendEmail: z.boolean().default(true),
  expiresInDays: z.number().int().min(1).max(180).default(30),
});
export type ResendContractRequest = z.infer<typeof ResendContractRequestSchema>;

export const VoidContractRequestSchema = z.object({
  reason: optionalText(500),
});

export const EmailContractRequestSchema = z.object({
  to: z.array(z.string().trim().email()).min(1).max(10),
  message: optionalText(2000),
});
export type EmailContractRequest = z.infer<typeof EmailContractRequestSchema>;

export const ContractListQuerySchema = z.object({
  q: z.string().max(100).optional(),
  status: ContractStatusSchema.optional(),
  category: ContractCategorySchema.optional(),
  counterpartyType: ContractCounterpartyTypeSchema.optional(),
  counterpartyId: z.string().max(100).optional(),
});

export const SignContractRequestSchema = z.object({
  signerName: z.string().trim().min(2).max(200),
  signatureDataUrl: SignatureDataUrlSchema,
  agreed: z.literal(true),
});
export type SignContractRequest = z.infer<typeof SignContractRequestSchema>;

export interface ContractTemplate {
  id: string;
  name: string;
  category: ContractCategory;
  description: string | null;
  bodyMarkdown: string;
  placeholders: ContractPlaceholderField[];
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractEvent {
  event: 'created' | 'updated' | 'sent' | 'resent' | 'viewed' | 'signed' | 'voided' | 'emailed';
  actor: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface Contract {
  id: string;
  templateId: string | null;
  templateVersion: number | null;
  title: string;
  category: ContractCategory;
  counterpartyType: ContractCounterpartyType;
  counterpartyId: string | null;
  counterpartyName: string | null;
  recipientName: string;
  recipientEmail: string | null;
  values: Record<string, string>;
  renderedBody: string;
  bodySha256: string | null;
  status: ContractStatus;
  tokenExpiresAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  lolaSignerName: string | null;
  lolaSignerTitle: string | null;
  lolaSignedAt: string | null;
  signerName: string | null;
  signedAt: string | null;
  hasPdf: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  events?: ContractEvent[];
}

/** Returned once from send/resend: the raw link is never stored. */
export interface ContractSendResult {
  contract: Contract;
  signingUrl: string;
  emailed: boolean;
}

export interface ContractCounterparty {
  type: ContractCounterpartyType;
  id: string;
  name: string;
  email: string | null;
  fields: Record<string, string>;
}

/** What the public signing page sees. */
export interface PublicContractView {
  title: string;
  recipientName: string;
  renderedBody: string;
  bodySha256: string;
  status: 'awaiting_signature' | 'completed';
  lolaSignerName: string | null;
  lolaSignerTitle: string | null;
  lolaSignedAt: string | null;
  signerName: string | null;
  signedAt: string | null;
}
