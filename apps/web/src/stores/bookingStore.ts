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

interface BookingState {
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId: number | null;
  dropoffLocationId: number | null;
  sessionToken: string;
  basket: BasketItem[];
  searchTrigger: number;

  setDates: (pickup: string, dropoff: string) => void;
  setStore: (storeId: string) => void;
  setLocations: (pickupId: number | null, dropoffId: number | null) => void;
  addToBasket: (item: BasketItem) => void;
  removeFromBasket: (holdId: string) => void;
  clearBasket: () => void;
  triggerSearch: () => void;
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

  setDates: (pickup, dropoff) =>
    set({ pickupDatetime: pickup, dropoffDatetime: dropoff }),

  setStore: (storeId) => set({ storeId }),

  setLocations: (pickupId, dropoffId) =>
    set({ pickupLocationId: pickupId, dropoffLocationId: dropoffId }),

  addToBasket: (item) =>
    set((s) => ({ basket: [...s.basket, item] })),

  removeFromBasket: (holdId) =>
    set((s) => ({ basket: s.basket.filter((b) => b.holdId !== holdId) })),

  clearBasket: () => set({ basket: [] }),

  triggerSearch: () => set((s) => ({ searchTrigger: s.searchTrigger + 1 })),
}));
