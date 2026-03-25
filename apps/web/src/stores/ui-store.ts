import { create } from 'zustand';

const STORE_ID_KEY = 'lolas_selected_store_id';

function getStoredStoreId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(STORE_ID_KEY);
  } catch {
    return null;
  }
}

interface UIState {
  selectedStoreId: string | null;
  sidebarOpen: boolean;
  activeFilters: Record<string, string>;
  setSelectedStore: (storeId: string) => void;
  toggleSidebar: () => void;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedStoreId: getStoredStoreId(),
  sidebarOpen: true,
  activeFilters: {},
  setSelectedStore: (storeId) => {
    try {
      if (typeof window !== 'undefined') sessionStorage.setItem(STORE_ID_KEY, storeId);
    } catch {
      /* ignore */
    }
    set({ selectedStoreId: storeId || null });
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setFilter: (key, value) => set((s) => ({ activeFilters: { ...s.activeFilters, [key]: value } })),
  clearFilters: () => set({ activeFilters: {} }),
}));
