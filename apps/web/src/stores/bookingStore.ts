import { create } from 'zustand';
import { DEFAULT_STORE_ID } from '@lolas/shared';

export interface BasketItem {
  holdId: string;
  vehicleModelId: string;
  modelName: string;
  dailyRate: number;
  securityDeposit?: number;
  expiresAt: string;
}

export interface RenterDetails {
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
  accommodationName: string;
  company: string;
  extraComments: string;
}

const RENTER_DETAILS_KEY = 'lolas_renter_details';

const EMPTY_RENTER_DETAILS: RenterDetails = {
  fullName: '',
  email: '',
  phone: '',
  nationality: '',
  accommodationName: '',
  company: '',
  extraComments: '',
};

function loadRenterDetails(): RenterDetails {
  try {
    const stored = localStorage.getItem(RENTER_DETAILS_KEY);
    if (stored) return { ...EMPTY_RENTER_DETAILS, ...(JSON.parse(stored) as Partial<RenterDetails>) };
  } catch { /* ignore parse errors */ }
  return { ...EMPTY_RENTER_DETAILS };
}

function saveRenterDetails(details: RenterDetails): void {
  try {
    localStorage.setItem(RENTER_DETAILS_KEY, JSON.stringify(details));
  } catch { /* ignore storage errors */ }
}

interface BookingState {
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId: number | null;
  dropoffLocationId: number | null;
  sessionToken: string;
  basket: BasketItem[];
  searchTrigger: number;
  renterDetails: RenterDetails;

  setDates: (pickup: string, dropoff: string) => void;
  setStore: (storeId: string) => void;
  setLocations: (pickupId: number | null, dropoffId: number | null) => void;
  hydrateBookingSession: (input: {
    storeId: string;
    pickupDatetime: string;
    dropoffDatetime: string;
    pickupLocationId: number | null;
    dropoffLocationId: number | null;
    sessionToken: string;
    basket: BasketItem[];
    renterDetails?: Partial<RenterDetails> | null;
  }) => void;
  addToBasket: (item: BasketItem) => void;
  removeFromBasket: (holdId: string) => void;
  updateBasketRate: (holdId: string, dailyRate: number, securityDeposit?: number) => void;
  replaceBasketHold: (oldHoldId: string, newHold: Pick<BasketItem, 'holdId' | 'expiresAt'>) => void;
  clearBasket: () => void;
  resetBookingSession: () => void;
  triggerSearch: () => void;
  setRenterDetails: (details: RenterDetails) => void;
  clearRenterDetails: () => void;
}

function getOrCreateSessionToken(): string {
  const key = 'lolas_booking_session';
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const token = crypto.randomUUID();
  localStorage.setItem(key, token);
  return token;
}

export const useBookingStore = create<BookingState>((set) => ({
  storeId: DEFAULT_STORE_ID,
  pickupDatetime: '',
  dropoffDatetime: '',
  pickupLocationId: null,
  dropoffLocationId: null,
  sessionToken: getOrCreateSessionToken(),
  basket: [],
  searchTrigger: 0,
  renterDetails: loadRenterDetails(),

  setDates: (pickup, dropoff) =>
    set({ pickupDatetime: pickup, dropoffDatetime: dropoff }),

  setStore: (storeId) => set({ storeId }),

  setLocations: (pickupId, dropoffId) =>
    set({ pickupLocationId: pickupId, dropoffLocationId: dropoffId }),

  hydrateBookingSession: (input) => {
    localStorage.setItem('lolas_booking_session', input.sessionToken);
    const renterDetails = { ...EMPTY_RENTER_DETAILS, ...(input.renterDetails ?? {}) };
    saveRenterDetails(renterDetails);
    set({
      storeId: input.storeId,
      pickupDatetime: input.pickupDatetime,
      dropoffDatetime: input.dropoffDatetime,
      pickupLocationId: input.pickupLocationId,
      dropoffLocationId: input.dropoffLocationId,
      sessionToken: input.sessionToken,
      basket: input.basket,
      renterDetails,
    });
  },

  addToBasket: (item) =>
    set((s) => ({ basket: [...s.basket, item] })),

  removeFromBasket: (holdId) =>
    set((s) => ({ basket: s.basket.filter((b) => b.holdId !== holdId) })),

  updateBasketRate: (holdId, dailyRate, securityDeposit) =>
    set((s) => ({
      basket: s.basket.map((b) =>
        b.holdId === holdId
          ? { ...b, dailyRate, ...(securityDeposit !== undefined ? { securityDeposit } : {}) }
          : b,
      ),
    })),

  replaceBasketHold: (oldHoldId, newHold) =>
    set((s) => ({
      basket: s.basket.map((b) =>
        b.holdId === oldHoldId
          ? { ...b, holdId: newHold.holdId, expiresAt: newHold.expiresAt }
          : b,
      ),
    })),

  clearBasket: () => set({ basket: [] }),

  resetBookingSession: () => {
    const newToken = crypto.randomUUID();
    localStorage.setItem('lolas_booking_session', newToken);
    localStorage.removeItem(RENTER_DETAILS_KEY);
    set({
      basket: [],
      pickupDatetime: '',
      dropoffDatetime: '',
      pickupLocationId: null,
      dropoffLocationId: null,
      sessionToken: newToken,
      renterDetails: { ...EMPTY_RENTER_DETAILS },
    });
  },

  triggerSearch: () => set((s) => ({ searchTrigger: s.searchTrigger + 1 })),

  setRenterDetails: (details) => {
    saveRenterDetails(details);
    set({ renterDetails: details });
  },

  clearRenterDetails: () => {
    localStorage.removeItem(RENTER_DETAILS_KEY);
    set({ renterDetails: { ...EMPTY_RENTER_DETAILS } });
  },
}));
