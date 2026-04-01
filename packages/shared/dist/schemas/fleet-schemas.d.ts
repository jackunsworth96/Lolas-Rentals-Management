import { z } from 'zod';
export declare const UpdateVehicleRequestSchema: z.ZodObject<{
    vehicleId: z.ZodNumber;
    registrationNumber: z.ZodOptional<z.ZodString>;
    vehicleTypeId: z.ZodOptional<z.ZodNumber>;
    locationId: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["available", "rented", "maintenance", "retired"]>>;
    odometerReading: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    vehicleId: number;
    status?: "maintenance" | "available" | "rented" | "retired" | undefined;
    vehicleTypeId?: number | undefined;
    locationId?: number | undefined;
    notes?: string | undefined;
    registrationNumber?: string | undefined;
    odometerReading?: number | undefined;
}, {
    vehicleId: number;
    status?: "maintenance" | "available" | "rented" | "retired" | undefined;
    vehicleTypeId?: number | undefined;
    locationId?: number | undefined;
    notes?: string | undefined;
    registrationNumber?: string | undefined;
    odometerReading?: number | undefined;
}>;
export type UpdateVehicleRequest = z.infer<typeof UpdateVehicleRequestSchema>;
export declare const RecordPurchaseRequestSchema: z.ZodObject<{
    registrationNumber: z.ZodString;
    vehicleTypeId: z.ZodNumber;
    locationId: z.ZodNumber;
    purchaseDate: z.ZodString;
    purchasePrice: z.ZodNumber;
    odometerReading: z.ZodNumber;
    depreciationAccountId: z.ZodNumber;
    assetAccountId: z.ZodNumber;
    paymentAccountId: z.ZodNumber;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    vehicleTypeId: number;
    locationId: number;
    registrationNumber: string;
    odometerReading: number;
    purchaseDate: string;
    purchasePrice: number;
    depreciationAccountId: number;
    assetAccountId: number;
    paymentAccountId: number;
    notes?: string | undefined;
}, {
    vehicleTypeId: number;
    locationId: number;
    registrationNumber: string;
    odometerReading: number;
    purchaseDate: string;
    purchasePrice: number;
    depreciationAccountId: number;
    assetAccountId: number;
    paymentAccountId: number;
    notes?: string | undefined;
}>;
export type RecordPurchaseRequest = z.infer<typeof RecordPurchaseRequestSchema>;
export declare const RecordSaleRequestSchema: z.ZodObject<{
    vehicleId: z.ZodNumber;
    saleDate: z.ZodString;
    salePrice: z.ZodNumber;
    receivingAccountId: z.ZodNumber;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    vehicleId: number;
    saleDate: string;
    salePrice: number;
    receivingAccountId: number;
    notes?: string | undefined;
}, {
    vehicleId: number;
    saleDate: string;
    salePrice: number;
    receivingAccountId: number;
    notes?: string | undefined;
}>;
export type RecordSaleRequest = z.infer<typeof RecordSaleRequestSchema>;
export declare const BatchDepreciationRequestSchema: z.ZodObject<{
    effectiveDate: z.ZodString;
    entries: z.ZodArray<z.ZodObject<{
        vehicleId: z.ZodNumber;
        amount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        vehicleId: number;
        amount: number;
    }, {
        vehicleId: number;
        amount: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    entries: {
        vehicleId: number;
        amount: number;
    }[];
    effectiveDate: string;
}, {
    entries: {
        vehicleId: number;
        amount: number;
    }[];
    effectiveDate: string;
}>;
export type BatchDepreciationRequest = z.infer<typeof BatchDepreciationRequestSchema>;
export declare const VehicleResponseSchema: z.ZodObject<{
    id: z.ZodNumber;
    registrationNumber: z.ZodString;
    vehicleTypeId: z.ZodNumber;
    vehicleTypeName: z.ZodString;
    locationId: z.ZodNumber;
    locationName: z.ZodString;
    status: z.ZodString;
    purchaseDate: z.ZodNullable<z.ZodString>;
    purchasePrice: z.ZodNullable<z.ZodNumber>;
    bookValue: z.ZodNullable<z.ZodNumber>;
    odometerReading: z.ZodNumber;
    notes: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: string;
    id: number;
    vehicleTypeId: number;
    locationId: number;
    notes: string | null;
    locationName: string;
    createdAt: string;
    updatedAt: string;
    registrationNumber: string;
    odometerReading: number;
    purchaseDate: string | null;
    purchasePrice: number | null;
    vehicleTypeName: string;
    bookValue: number | null;
}, {
    status: string;
    id: number;
    vehicleTypeId: number;
    locationId: number;
    notes: string | null;
    locationName: string;
    createdAt: string;
    updatedAt: string;
    registrationNumber: string;
    odometerReading: number;
    purchaseDate: string | null;
    purchasePrice: number | null;
    vehicleTypeName: string;
    bookValue: number | null;
}>;
export type VehicleResponse = z.infer<typeof VehicleResponseSchema>;
//# sourceMappingURL=fleet-schemas.d.ts.map