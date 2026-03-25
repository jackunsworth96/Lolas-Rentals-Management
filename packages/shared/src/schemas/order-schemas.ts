import { z } from 'zod';

export const OrderLineSchema = z.object({
  vehicleTypeId: z.number(),
  quantity: z.number().int().positive(),
  ratePerDay: z.number().nonnegative(),
  days: z.number().int().positive(),
});

export type OrderLine = z.infer<typeof OrderLineSchema>;

export const OrderAddonSchema = z.object({
  addonId: z.number(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

export type OrderAddon = z.infer<typeof OrderAddonSchema>;

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

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

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

export type UpdateOrderRequest = z.infer<typeof UpdateOrderRequestSchema>;

export const VehicleAssignmentSchema = z.object({
  orderLineId: z.number(),
  vehicleId: z.number(),
});

export type VehicleAssignment = z.infer<typeof VehicleAssignmentSchema>;

export const ActivateOrderRequestSchema = z.object({
  orderId: z.number(),
  vehicleAssignments: z.array(VehicleAssignmentSchema).min(1),
  employeeId: z.number(),
});

export type ActivateOrderRequest = z.infer<typeof ActivateOrderRequestSchema>;

export const SettleOrderRequestSchema = z.object({
  orderId: z.number(),
  adjustments: z
    .array(
      z.object({
        description: z.string(),
        amount: z.number(),
      }),
    )
    .optional(),
  notes: z.string().optional(),
});

export type SettleOrderRequest = z.infer<typeof SettleOrderRequestSchema>;

export const CollectPaymentRequestSchema = z.object({
  orderId: z.number(),
  amount: z.number().positive(),
  paymentMethodId: z.number(),
  accountId: z.number(),
});

export type CollectPaymentRequest = z.infer<
  typeof CollectPaymentRequestSchema
>;

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

export type OrderResponse = z.infer<typeof OrderResponseSchema>;
