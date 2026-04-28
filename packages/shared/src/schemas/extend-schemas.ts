import { z } from 'zod';

export const ExtendLookupRequestSchema = z.object({
  email: z.string().email(),
  orderReference: z.string().min(1),
});

export type ExtendLookupRequest = z.infer<typeof ExtendLookupRequestSchema>;

export interface ExtendLookupOrderAddon {
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
}

export interface ExtendLookupLocation {
  id: number;
  name: string;
  deliveryCost: number;
  collectionCost: number;
  locationType: string | null;
}

export interface ExtendLookupOrder {
  orderReference: string;
  customerName?: string | null;
  vehicleModelName: string;
  vehicleModelId: string;
  storeId: string;
  currentDropoffDatetime: string;
  pickupLocationName: string;
  originalTotal: number;
  rentalDays: number;
  currentOrderAddons: ExtendLookupOrderAddon[];
  currentDropoffLocationId: number | null;
  currentDropoffFee: number;
  availableLocations: ExtendLookupLocation[];
}

export type ExtendLookupResponse =
  | { found: true; order: ExtendLookupOrder }
  | { found: false };

export const PublicExtendConfirmSchema = z.object({
  orderReference: z.string().min(1),
  email: z.string().email(),
  newDropoffDatetime: z.string().min(1),
  ninePmAddonId: z.number().int().positive().optional(),
  newOneTimeAddonIds: z.array(z.number().int().positive()).optional(),
  newDropoffLocationId: z.number().int().positive().optional(),
  newDropoffLocationAddress: z.string().max(500).optional(),
});

export const StaffExtendConfirmSchema = PublicExtendConfirmSchema.extend({
  overrideDailyRate: z.number().positive().optional(),
  paymentStatus: z.enum(['paid', 'unpaid']).optional(),
  paymentMethod: z.string().optional(),
  paymentAccountId: z.string().optional(),
  newPerDayAddonIds: z.array(z.number().int().positive()).optional(),
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
