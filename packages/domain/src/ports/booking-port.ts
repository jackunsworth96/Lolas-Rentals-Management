export interface AvailableModel {
  modelId: string;
  modelName: string;
  availableCount: number;
  nextAvailablePickup?: string;
}

export interface AvailabilityQuery {
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
}

export interface HoldRow {
  id: string;
  vehicleModelId: string;
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  sessionToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface InsertHoldInput {
  vehicleModelId: string;
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  sessionToken: string;
  expiresAt: string;
}

export interface DirectBookingInsert {
  source: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  vehicleModelId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId: number;
  dropoffLocationId: number;
  storeId: string;
  orderReference: string;
  cancellationToken: string;
  addonIds: number[] | null;
  transferType?: string | null;
  flightNumber?: string | null;
  flightArrivalTime?: string | null;
  transferRoute?: string | null;
  webQuoteRaw?: number | null;
  charityDonation?: number;
  webPaymentMethod?: string | null;
  helmetCount?: number | null;
  transferAmount?: number | null;
}

export interface DirectBookingResult {
  id: string;
  orderReference: string;
  cancellationToken: string;
}

export interface BookingPort {
  checkAvailability(query: AvailabilityQuery): Promise<AvailableModel[]>;
  insertHold(input: InsertHoldInput): Promise<HoldRow>;
  deleteHold(holdId: string, sessionToken: string): Promise<boolean>;
  deleteHoldBySessionAndModel(sessionToken: string, vehicleModelId: string, holdId?: string): Promise<void>;
  findActiveHoldsBySession(sessionToken: string): Promise<HoldRow[]>;
  findActiveHold(
    sessionToken: string,
    vehicleModelId: string,
    pickupDatetime: string,
    dropoffDatetime: string,
  ): Promise<HoldRow | null>;
  insertDirectBooking(input: DirectBookingInsert): Promise<DirectBookingResult>;
  isOrderReferenceUnique(orderReference: string): Promise<boolean>;
}
