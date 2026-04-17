import {
  useOrder,
  useOrderItems,
  useOrderPayments,
  useOrderAddons,
  useOrderSwaps,
  useOrderHistory,
} from '../../api/orders.js';

export type OrderItem = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  rentalDaysCount: number;
  rentalRate: number;
  pickupFee?: number;
  dropoffFee?: number;
  discount?: number;
};

export type OrderPayment = {
  transactionDate: string;
  amount: number;
  paymentMethodId: string;
  paymentType?: string;
  settlementStatus?: string | null;
  settlementRef?: string | null;
};

export type OrderAddon = {
  id: string;
  orderId: string;
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
};

export type OrderSwap = {
  id: string;
  oldVehicleName: string;
  newVehicleName: string;
  swapDate: string;
  swapTime: string;
  reason: string;
};

export type OrderHistoryEvent = {
  timestamp: string;
  type: string;
  description: string;
  detail?: string;
  amount?: number;
};

export type OrderDetail = {
  id: string;
  orderDate?: string;
  customerId?: string;
  customerEmail?: string | null;
  status?: string | { value: string };
  finalTotal?: unknown;
  securityDeposit?: unknown;
  cardFeeSurcharge?: unknown;
  paymentMethodId?: string;
  webNotes?: string;
  booking_token?: string;
  balance_due?: unknown;
};

/**
 * Aggregates the core queries that power the Order Detail modal.
 *
 * Returns the order itself (with loading/error/refresh) plus the list queries
 * that tabs need for counts and content. Tab subcomponents receive the relevant
 * slices as props rather than re-querying.
 */
export function useOrderDetail(orderId: string) {
  const { data: order, isLoading, error, refetch } = useOrder(orderId) as {
    data: OrderDetail | undefined;
    isLoading: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  };
  const { data: items = [] } = useOrderItems(orderId) as { data: OrderItem[] | undefined };
  const { data: payments = [] } = useOrderPayments(orderId) as { data: OrderPayment[] | undefined };
  const { data: orderAddons = [] } = useOrderAddons(orderId) as { data: OrderAddon[] | undefined };
  const { data: swaps = [] } = useOrderSwaps(orderId) as { data: OrderSwap[] | undefined };
  const { data: history = [] } = useOrderHistory(orderId) as { data: OrderHistoryEvent[] | undefined };

  return {
    order,
    loading: isLoading,
    error,
    refresh: refetch,
    items,
    payments,
    orderAddons,
    swaps,
    history,
  };
}
