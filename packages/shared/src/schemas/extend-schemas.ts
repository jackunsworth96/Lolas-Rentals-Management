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

export const ExtendConfirmRequestSchema = z.object({
  orderReference: z.string().min(1),
  email: z.string().email(),
  newDropoffDatetime: z.string().min(1),
});

export type ExtendConfirmRequest = z.infer<typeof ExtendConfirmRequestSchema>;

export type ExtendConfirmResponse =
  | { success: true; newDropoffDatetime: string; extensionCost: number }
  | { success: false; reason: string };
