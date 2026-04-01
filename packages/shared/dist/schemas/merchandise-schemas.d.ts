import { z } from 'zod';
export declare const MerchandiseQuerySchema: z.ZodObject<{
    storeId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    storeId: string;
}, {
    storeId: string;
}>;
export declare const CreateMerchandiseItemSchema: z.ZodObject<{
    sku: z.ZodString;
    itemName: z.ZodString;
    sizeVariant: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    costPrice: z.ZodNumber;
    salePrice: z.ZodNumber;
    startingStock: z.ZodDefault<z.ZodNumber>;
    currentStock: z.ZodDefault<z.ZodNumber>;
    lowStockThreshold: z.ZodDefault<z.ZodNumber>;
    storeId: z.ZodString;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    salePrice: number;
    isActive: boolean;
    sku: string;
    itemName: string;
    costPrice: number;
    startingStock: number;
    currentStock: number;
    lowStockThreshold: number;
    sizeVariant?: string | null | undefined;
}, {
    storeId: string;
    salePrice: number;
    sku: string;
    itemName: string;
    costPrice: number;
    isActive?: boolean | undefined;
    sizeVariant?: string | null | undefined;
    startingStock?: number | undefined;
    currentStock?: number | undefined;
    lowStockThreshold?: number | undefined;
}>;
export declare const UpdateMerchandiseItemSchema: z.ZodObject<{
    itemName: z.ZodOptional<z.ZodString>;
    sizeVariant: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    costPrice: z.ZodOptional<z.ZodNumber>;
    salePrice: z.ZodOptional<z.ZodNumber>;
    lowStockThreshold: z.ZodOptional<z.ZodNumber>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    salePrice?: number | undefined;
    isActive?: boolean | undefined;
    itemName?: string | undefined;
    sizeVariant?: string | null | undefined;
    costPrice?: number | undefined;
    lowStockThreshold?: number | undefined;
}, {
    salePrice?: number | undefined;
    isActive?: boolean | undefined;
    itemName?: string | undefined;
    sizeVariant?: string | null | undefined;
    costPrice?: number | undefined;
    lowStockThreshold?: number | undefined;
}>;
export declare const AdjustStockSchema: z.ZodObject<{
    delta: z.ZodNumber;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    delta: number;
}, {
    reason: string;
    delta: number;
}>;
//# sourceMappingURL=merchandise-schemas.d.ts.map