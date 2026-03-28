export interface Addon {
  id: number | string;
  name: string;
  pricePerDay: number;
  priceOneTime: number;
  addonType: 'per_day' | 'one_time';
  storeId: string | null;
  mutualExclusivityGroup: string | null;
  isActive: boolean;
}

export interface TransferDetails {
  transferType: 'shared' | 'private';
  flightNumber: string;
  flightArrivalTime: string;
  transferRoute: string;
}

export interface RenterInfo {
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
}

export type PaymentMethod = 'card' | 'gcash' | 'cash';
