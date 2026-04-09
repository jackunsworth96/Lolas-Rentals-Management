import { z } from 'zod';

export const ExtendLookupRequestSchema = z.object({
  email: z.string().email(),
  orderReference: z.string().min(1),
});

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

export type ExtendLookupResponse =
  | { found: true; order: ExtendLookupOrder }
  | { found: false };

export const PublicExtendConfirmSchema = z.object({
  orderReference: z.string().min(1),
  email: z.string().email(),
  newDropoffDatetime: z.string().min(1),
});

export const StaffExtendConfirmSchema = PublicExtendConfirmSchema.extend({
  overrideDailyRate: z.number().positive().optional(),
  paymentStatus: z.enum(['paid', 'unpaid']).optional(),
  paymentMethod: z.string().optional(),
  paymentAccountId: z.string().optional(),
});

export const ExtendConfirmRequestSchema = StaffExtendConfirmSchema;

export type ExtendConfirmRequest = z.infer<typeof ExtendConfirmRequestSchema>;

export type ExtendConfirmResponse =
  | { success: true; newDropoffDatetime: string; extensionCost: number }
  | { success: false; reason: string };

export interface ExtendPreviewResponse {
  extensionDays: number;
  dailyRate: number;
  extensionTotal: number;
  bracketLabel: string;
}
