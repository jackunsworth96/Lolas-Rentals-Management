import { z } from 'zod';
export const OrderLineSchema = z.object({
    vehicleTypeId: z.number(),
    quantity: z.number().int().positive(),
    ratePerDay: z.number().nonnegative(),
    days: z.number().int().positive(),
});
export const OrderAddonSchema = z.object({
    addonId: z.number(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
});
export const CreateOrderRequestSchema = z.object({
    customerId: z.number(),
    locationId: z.number(),
    startDate: z.string(),
    endDate: z.string(),
    lines: z.array(OrderLineSchema).min(1),
    addons: z.array(OrderAddonSchema).optional(),
    depositAmount: z.number().nonnegative().optional(),
    notes: z.string().optional(),
});
export const UpdateOrderRequestSchema = z.object({
    orderId: z.number(),
    customerId: z.number().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    lines: z.array(OrderLineSchema).optional(),
    addons: z.array(OrderAddonSchema).optional(),
    depositAmount: z.number().nonnegative().optional(),
    notes: z.string().optional(),
});
export const VehicleAssignmentSchema = z.object({
    orderLineId: z.number(),
    vehicleId: z.number(),
});
export const ActivateOrderRequestSchema = z.object({
    orderId: z.number(),
    vehicleAssignments: z.array(VehicleAssignmentSchema).min(1),
    employeeId: z.number(),
});
export const SettleOrderRequestSchema = z.object({
    orderId: z.number(),
    adjustments: z
        .array(z.object({
        description: z.string(),
        amount: z.number(),
    }))
        .optional(),
    notes: z.string().optional(),
});
export const CollectPaymentRequestSchema = z.object({
    orderId: z.number(),
    amount: z.number().positive(),
    paymentMethodId: z.number(),
    accountId: z.number(),
});
export const OrderResponseSchema = z.object({
    id: z.number(),
    orderNumber: z.string(),
    customerId: z.number(),
    customerName: z.string(),
    locationId: z.number(),
    locationName: z.string(),
    status: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    lines: z.array(OrderLineSchema.extend({ id: z.number() })),
    addons: z.array(OrderAddonSchema.extend({ id: z.number() })),
    depositAmount: z.number(),
    totalAmount: z.number(),
    paidAmount: z.number(),
    balanceDue: z.number(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
//# sourceMappingURL=order-schemas.js.map