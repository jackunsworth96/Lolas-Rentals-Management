import { z } from 'zod';

export const UpdateVehicleRequestSchema = z.object({
  vehicleId: z.number(),
  registrationNumber: z.string().optional(),
  vehicleTypeId: z.number().optional(),
  locationId: z.number().optional(),
  status: z.enum(['available', 'rented', 'maintenance', 'retired']).optional(),
  odometerReading: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export type UpdateVehicleRequest = z.infer<typeof UpdateVehicleRequestSchema>;

export const RecordPurchaseRequestSchema = z.object({
  registrationNumber: z.string().min(1),
  vehicleTypeId: z.number(),
  locationId: z.number(),
  purchaseDate: z.string(),
  purchasePrice: z.number().positive(),
  odometerReading: z.number().nonnegative(),
  depreciationAccountId: z.number(),
  assetAccountId: z.number(),
  paymentAccountId: z.number(),
  notes: z.string().optional(),
});

export type RecordPurchaseRequest = z.infer<
  typeof RecordPurchaseRequestSchema
>;

export const RecordSaleRequestSchema = z.object({
  vehicleId: z.number(),
  saleDate: z.string(),
  salePrice: z.number().nonnegative(),
  receivingAccountId: z.number(),
  notes: z.string().optional(),
});

export type RecordSaleRequest = z.infer<typeof RecordSaleRequestSchema>;

export const BatchDepreciationRequestSchema = z.object({
  effectiveDate: z.string(),
  entries: z
    .array(
      z.object({
        vehicleId: z.number(),
        amount: z.number().positive(),
      }),
    )
    .min(1),
});

export type BatchDepreciationRequest = z.infer<
  typeof BatchDepreciationRequestSchema
>;

export const VehicleResponseSchema = z.object({
  id: z.number(),
  registrationNumber: z.string(),
  vehicleTypeId: z.number(),
  vehicleTypeName: z.string(),
  locationId: z.number(),
  locationName: z.string(),
  status: z.string(),
  purchaseDate: z.string().nullable(),
  purchasePrice: z.number().nullable(),
  bookValue: z.number().nullable(),
  odometerReading: z.number(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type VehicleResponse = z.infer<typeof VehicleResponseSchema>;
