export interface AvailableModel {
  modelId: string;
  modelName: string;
  availableCount: number;
  /** Earliest observed time an overlapping blocker clears for this model.
   * This is a hint for re-checking, not proof that the model is available for
   * the same rental duration starting at this timestamp. */
  nextAvailablePickup?: string;
  /** Set when availableCount is 0 solely because active basket holds are consuming all capacity.
   * ISO timestamp of when the earliest blocking hold expires. Absent when a confirmed
   * booking (order_items / orders_raw) is the reason for unavailability. */
  holdExpiresAt?: string;
  /** Set when availableCount is 0 but at least one unit was free at the very start of the
   * requested window. Indicates the ISO timestamp when the first new conflict begins — so the
   * caller can display "available [pickup] – [just before firstConflictAt], free again from
   * nextAvailablePickup". Absent when the model was already fully blocked at pickup time. */
  firstConflictAt?: string;
}

export interface AvailabilityQuery {
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  /** When set, holds belonging to this session are excluded from the count.
   * Used during order submission so the customer's own hold is not counted
   * against their own booking. */
  excludeSessionToken?: string;
  /** When set, this order item is ignored in overlap checks.
   * Used by extension flows so the rental being extended does not block itself,
   * especially because availability applies a 30-minute handover buffer. */
  excludeOrderItemId?: string;
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
  transferPaxCount?: number | null;
  /** Guest accommodation note; persisted on orders_raw.payload.accommodation_name when no DB column. */
  accommodationName?: string | null;
  /** Company name provided by the customer (optional). */
  company?: string | null;
  /** Extra comments / notes from the customer (optional). */
  extraComments?: string | null;
  /** Customer's exact address for a delivery pickup when a non-store location is selected. */
  pickupLocationAddress?: string | null;
  /** Customer's exact address for a collection return when a non-store location is selected. */
  dropoffLocationAddress?: string | null;
  /** Device type detected from the User-Agent header at submission time. */
  deviceType?: 'mobile' | 'desktop' | null;
  /** Accommodation partner referral slug. Stored in orders_raw.partner_ref (migration 129). */
  partnerRef?: string | null;
  /** Pure rental subtotal (days × daily rate) at booking time — excludes add-ons, fees, charity, transfer.
   * Used as the commission base for percentage commissions (migration 130). */
  rentalValueRaw?: number | null;
  /** Shared reference for partner portal bookings that created multiple raw orders together. */
  partnerBookingGroupRef?: string | null;
  /** Driver/renter name for this specific vehicle in a grouped partner booking. */
  driverName?: string | null;
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
