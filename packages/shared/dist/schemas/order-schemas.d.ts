import { z } from 'zod';
export declare const OrderLineSchema: z.ZodObject<{
    vehicleTypeId: z.ZodNumber;
    quantity: z.ZodNumber;
    ratePerDay: z.ZodNumber;
    days: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    vehicleTypeId: number;
    quantity: number;
    ratePerDay: number;
    days: number;
}, {
    vehicleTypeId: number;
    quantity: number;
    ratePerDay: number;
    days: number;
}>;
export type OrderLine = z.infer<typeof OrderLineSchema>;
export declare const OrderAddonSchema: z.ZodObject<{
    addonId: z.ZodNumber;
    quantity: z.ZodNumber;
    unitPrice: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    quantity: number;
    addonId: number;
    unitPrice: number;
}, {
    quantity: number;
    addonId: number;
    unitPrice: number;
}>;
export type OrderAddon = z.infer<typeof OrderAddonSchema>;
export declare const CreateOrderRequestSchema: z.ZodObject<{
    customerId: z.ZodNumber;
    locationId: z.ZodNumber;
    startDate: z.ZodString;
    endDate: z.ZodString;
    lines: z.ZodArray<z.ZodObject<{
        vehicleTypeId: z.ZodNumber;
        quantity: z.ZodNumber;
        ratePerDay: z.ZodNumber;
        days: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }, {
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }>, "many">;
    addons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        addonId: z.ZodNumber;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        addonId: number;
        unitPrice: number;
    }, {
        quantity: number;
        addonId: number;
        unitPrice: number;
    }>, "many">>;
    depositAmount: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    customerId: number;
    locationId: number;
    startDate: string;
    endDate: string;
    lines: {
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }[];
    addons?: {
        quantity: number;
        addonId: number;
        unitPrice: number;
    }[] | undefined;
    depositAmount?: number | undefined;
    notes?: string | undefined;
}, {
    customerId: number;
    locationId: number;
    startDate: string;
    endDate: string;
    lines: {
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }[];
    addons?: {
        quantity: number;
        addonId: number;
        unitPrice: number;
    }[] | undefined;
    depositAmount?: number | undefined;
    notes?: string | undefined;
}>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export declare const UpdateOrderRequestSchema: z.ZodObject<{
    orderId: z.ZodNumber;
    customerId: z.ZodOptional<z.ZodNumber>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    lines: z.ZodOptional<z.ZodArray<z.ZodObject<{
        vehicleTypeId: z.ZodNumber;
        quantity: z.ZodNumber;
        ratePerDay: z.ZodNumber;
        days: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }, {
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }>, "many">>;
    addons: z.ZodOptional<z.ZodArray<z.ZodObject<{
        addonId: z.ZodNumber;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        addonId: number;
        unitPrice: number;
    }, {
        quantity: number;
        addonId: number;
        unitPrice: number;
    }>, "many">>;
    depositAmount: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    orderId: number;
    customerId?: number | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    lines?: {
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }[] | undefined;
    addons?: {
        quantity: number;
        addonId: number;
        unitPrice: number;
    }[] | undefined;
    depositAmount?: number | undefined;
    notes?: string | undefined;
}, {
    orderId: number;
    customerId?: number | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    lines?: {
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }[] | undefined;
    addons?: {
        quantity: number;
        addonId: number;
        unitPrice: number;
    }[] | undefined;
    depositAmount?: number | undefined;
    notes?: string | undefined;
}>;
export type UpdateOrderRequest = z.infer<typeof UpdateOrderRequestSchema>;
export declare const VehicleAssignmentSchema: z.ZodObject<{
    orderLineId: z.ZodNumber;
    vehicleId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    orderLineId: number;
    vehicleId: number;
}, {
    orderLineId: number;
    vehicleId: number;
}>;
export type VehicleAssignment = z.infer<typeof VehicleAssignmentSchema>;
export declare const ActivateOrderRequestSchema: z.ZodObject<{
    orderId: z.ZodNumber;
    vehicleAssignments: z.ZodArray<z.ZodObject<{
        orderLineId: z.ZodNumber;
        vehicleId: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        orderLineId: number;
        vehicleId: number;
    }, {
        orderLineId: number;
        vehicleId: number;
    }>, "many">;
    employeeId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    employeeId: number;
    orderId: number;
    vehicleAssignments: {
        orderLineId: number;
        vehicleId: number;
    }[];
}, {
    employeeId: number;
    orderId: number;
    vehicleAssignments: {
        orderLineId: number;
        vehicleId: number;
    }[];
}>;
export type ActivateOrderRequest = z.infer<typeof ActivateOrderRequestSchema>;
export declare const SettleOrderRequestSchema: z.ZodObject<{
    orderId: z.ZodNumber;
    adjustments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        amount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        description: string;
        amount: number;
    }, {
        description: string;
        amount: number;
    }>, "many">>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    orderId: number;
    notes?: string | undefined;
    adjustments?: {
        description: string;
        amount: number;
    }[] | undefined;
}, {
    orderId: number;
    notes?: string | undefined;
    adjustments?: {
        description: string;
        amount: number;
    }[] | undefined;
}>;
export type SettleOrderRequest = z.infer<typeof SettleOrderRequestSchema>;
export declare const CollectPaymentRequestSchema: z.ZodObject<{
    orderId: z.ZodNumber;
    amount: z.ZodNumber;
    paymentMethodId: z.ZodNumber;
    accountId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    orderId: number;
    amount: number;
    paymentMethodId: number;
    accountId: number;
}, {
    orderId: number;
    amount: number;
    paymentMethodId: number;
    accountId: number;
}>;
export type CollectPaymentRequest = z.infer<typeof CollectPaymentRequestSchema>;
export declare const OrderResponseSchema: z.ZodObject<{
    id: z.ZodNumber;
    orderNumber: z.ZodString;
    customerId: z.ZodNumber;
    customerName: z.ZodString;
    locationId: z.ZodNumber;
    locationName: z.ZodString;
    status: z.ZodString;
    startDate: z.ZodString;
    endDate: z.ZodString;
    lines: z.ZodArray<z.ZodObject<{
        vehicleTypeId: z.ZodNumber;
        quantity: z.ZodNumber;
        ratePerDay: z.ZodNumber;
        days: z.ZodNumber;
    } & {
        id: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: number;
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }, {
        id: number;
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }>, "many">;
    addons: z.ZodArray<z.ZodObject<{
        addonId: z.ZodNumber;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
    } & {
        id: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: number;
        quantity: number;
        addonId: number;
        unitPrice: number;
    }, {
        id: number;
        quantity: number;
        addonId: number;
        unitPrice: number;
    }>, "many">;
    depositAmount: z.ZodNumber;
    totalAmount: z.ZodNumber;
    paidAmount: z.ZodNumber;
    balanceDue: z.ZodNumber;
    notes: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: string;
    id: number;
    customerId: number;
    locationId: number;
    startDate: string;
    endDate: string;
    lines: {
        id: number;
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }[];
    addons: {
        id: number;
        quantity: number;
        addonId: number;
        unitPrice: number;
    }[];
    depositAmount: number;
    notes: string | null;
    orderNumber: string;
    customerName: string;
    locationName: string;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    createdAt: string;
    updatedAt: string;
}, {
    status: string;
    id: number;
    customerId: number;
    locationId: number;
    startDate: string;
    endDate: string;
    lines: {
        id: number;
        vehicleTypeId: number;
        quantity: number;
        ratePerDay: number;
        days: number;
    }[];
    addons: {
        id: number;
        quantity: number;
        addonId: number;
        unitPrice: number;
    }[];
    depositAmount: number;
    notes: string | null;
    orderNumber: string;
    customerName: string;
    locationName: string;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    createdAt: string;
    updatedAt: string;
}>;
export type OrderResponse = z.infer<typeof OrderResponseSchema>;
//# sourceMappingURL=order-schemas.d.ts.map