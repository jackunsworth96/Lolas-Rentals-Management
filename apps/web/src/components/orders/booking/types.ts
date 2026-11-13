export interface CustomerData {
  name: string;
  email: string;
  phone: string;
}

export interface VehicleRow {
  vehicleId: string;
  vehicleName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  rentalDaysCount: number;
  pickupLocation: string;
  dropoffLocation: string;
  pickupFee: number;
  dropoffFee: number;
  rentalRate: number;
  helmetNumbers: string;
  discount: number;
  opsNotes: string;
  isExtension: boolean;
}

export interface AddonRow {
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
  mutualExclusivityGroup: string | null;
  enabled: boolean;
}

export interface PaymentMethodOption {
  id: string;
  name: string;
}

export type ConfigLocation = Record<string, unknown>;

export function vehicleLineTotal(v: VehicleRow): number {
  return v.rentalRate * v.rentalDaysCount + v.pickupFee + v.dropoffFee - v.discount;
}

export const inputClass =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
