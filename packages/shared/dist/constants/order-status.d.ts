export declare const OrderStatus: {
    readonly Unprocessed: "unprocessed";
    readonly Active: "active";
    readonly Confirmed: "confirmed";
    readonly Completed: "completed";
    readonly Cancelled: "cancelled";
};
export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus];
//# sourceMappingURL=order-status.d.ts.map