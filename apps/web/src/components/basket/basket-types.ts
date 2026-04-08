export interface Addon {
  id: number | string;
  name: string;
  pricePerDay: number;
  priceOneTime: number;
  addonType: 'per_day' | 'one_time';
  storeId: string | null;
  mutualExclusivityGroup: string | null;
  isActive: boolean;
  applicableModelIds: string[] | null;
}

export interface TransferDetails {
  /** Submitted to backend — 'shared', 'private', or 'tuktuk' */
  transferType: 'shared' | 'private' | 'tuktuk';
  /** Route text from DB (submitted to backend) */
  transferRoute: string;
  flightNumber: string;
  flightArrivalTime: string;
  /** DB primary key from transfer_routes */
  transferRouteId: number;
  /** Raw van_type string from DB */
  vanType: string;
  pricingType: 'fixed' | 'per_head';
  /** Unit price from DB */
  unitPrice: number;
  /** 1 for fixed pricing; user-set for per_head */
  paxCount: number;
  /** unitPrice * paxCount for per_head, unitPrice for fixed */
  totalPrice: number;
}

export interface RenterInfo {
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
}

export type PaymentMethodId = string;

export interface PaymentMethodOption {
  id: string;
  name: string;
  surchargePercent: number;
}
