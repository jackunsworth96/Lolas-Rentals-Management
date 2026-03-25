export const OrderStatus = {
  Unprocessed: 'unprocessed',
  Active: 'active',
  Confirmed: 'confirmed',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;

export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus];
