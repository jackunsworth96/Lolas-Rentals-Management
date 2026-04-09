/** API response shapes used by list/detail views (snake_case from DB may be camelCase from API). */

export interface OrderSummary {
  id: string;
  storeId: string;
  orderDate: string;
  customerId: string | null;
  status: { value: string } | string;
  finalTotal: { amount: number } | number;
  balanceDue: { amount: number } | number;
  webNotes?: string | null;
  addons?: Array<{ addonName: string; totalAmount: number }>;
}

export interface VehicleSummary {
  id: string;
  storeId: string;
  name: string;
  modelId?: string | null;
  plateNumber: string | null;
  status: string;
  currentMileage: number | null;
  orcrExpiryDate: string | null;
  gpsId?: string | null;
  surfRack?: boolean;
  owner?: string | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  setUpCosts?: number;
  totalBikeCost?: number;
  usefulLifeMonths?: number | null;
  salvageValue?: number;
  accumulatedDepreciation?: number;
  bookValue?: number;
  dateSold?: string | null;
  soldPrice?: number | null;
  profitLoss?: number | null;
  rentableStartDate?: string | null;
  registrationDate?: string | null;
}

export interface EnrichedOrder {
  id: string;
  storeId: string;
  orderDate: string;
  customerName: string;
  customerMobile: string | null;
  /** From customers table — used for Paw Card savings lookup */
  customerEmail: string | null;
  vehicleNames: string;
  returnDatetime: string | null;
  /** Human-facing ref (e.g. walk-in LR-… / BB-…); stored as orders.booking_token */
  bookingToken: string | null;
  wooOrderId: string | null;
  finalTotal: number;
  balanceDue: number;
  totalPaid: number;
  securityDeposit: number;
  cardFeeSurcharge: number;
  status: string;
  webNotes: string | null;
  paymentMethodId: string | null;
  waiverStatus: 'pending' | 'signed' | 'expired';
  waiverSignedAt: string | null;
  /** From inspections table — list views only show a badge when `completed`. */
  inspectionStatus?: 'pending' | 'completed';
}

export interface MaintenanceRecordSummary {
  id: string;
  assetId: string;
  vehicleName: string | null;
  status: string;
  downtimeTracked: boolean;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  totalDowntimeDays: number | null;
  issueDescription: string | null;
  workPerformed: string | null;
  partsReplaced: unknown | null;
  partsCost: number | { amount: number };
  laborCost: number | { amount: number };
  totalCost: number | { amount: number };
  paidFrom: string | null;
  mechanic: string | null;
  odometer: number | null;
  nextServiceDue: number | null;
  nextServiceDueDate: string | null;
  opsNotes: string | null;
  employeeId: string | null;
  storeId: string;
  createdAt: string;
}
