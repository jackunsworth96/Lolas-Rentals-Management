import { z } from 'zod';
export const MerchandiseQuerySchema = z.object({
    storeId: z.string().min(1),
});
export const CreateMerchandiseItemSchema = z.object({
    sku: z.string().min(1),
    itemName: z.string().min(1),
    sizeVariant: z.string().nullable().optional(),
    costPrice: z.coerce.number().min(0),
    salePrice: z.coerce.number().min(0),
    startingStock: z.coerce.number().int().min(0).default(0),
    currentStock: z.coerce.number().int().min(0).default(0),
    lowStockThreshold: z.coerce.number().int().min(0).default(5),
    storeId: z.string().min(1),
    isActive: z.boolean().default(true),
});
export const UpdateMerchandiseItemSchema = z.object({
    itemName: z.string().min(1).optional(),
    sizeVariant: z.string().nullable().optional(),
    costPrice: z.coerce.number().min(0).optional(),
    salePrice: z.coerce.number().min(0).optional(),
    lowStockThreshold: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
});
export const AdjustStockSchema = z.object({
    delta: z.coerce.number().int(),
    reason: z.string().min(1),
});
//# sourceMappingURL=merchandise-schemas.js.map