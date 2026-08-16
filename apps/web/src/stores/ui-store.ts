import { create } from 'zustand';
import { DEFAULT_STORE_ID } from '@lolas/shared';

const STORE_ID_KEY = 'lolas_selected_store_id';
const ARCHIVE_MODE_KEY = 'lolas_archive_mode';
const ARCHIVE_NAME_KEY = 'lolas_archived_store_name';

function getStoredStoreId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(STORE_ID_KEY);
  } catch {
    return null;
  }
}

function getStoredArchiveState(): { archiveMode: boolean; archivedStoreName: string | null } {
  if (typeof window === 'undefined') return { archiveMode: false, archivedStoreName: null };
  try {
    return {
      archiveMode: sessionStorage.getItem(ARCHIVE_MODE_KEY) === 'true',
      archivedStoreName: sessionStorage.getItem(ARCHIVE_NAME_KEY),
    };
  } catch {
    return { archiveMode: false, archivedStoreName: null };
  }
}

const storedArchive = getStoredArchiveState();
const initialStoreId = storedArchive.archiveMode
  ? (getStoredStoreId() ?? DEFAULT_STORE_ID)
  : DEFAULT_STORE_ID;

interface UIState {
  selectedStoreId: string | null;
  archiveMode: boolean;
  archivedStoreName: string | null;
  sidebarOpen: boolean;
  activeFilters: Record<string, string>;
  setSelectedStore: (storeId: string) => void;
  enterArchiveMode: (storeId: string, storeName: string) => void;
  exitArchiveMode: () => void;
  toggleSidebar: () => void;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedStoreId: initialStoreId,
  archiveMode: storedArchive.archiveMode,
  archivedStoreName: storedArchive.archivedStoreName,
  sidebarOpen: true,
  activeFilters: {},
  setSelectedStore: (storeId) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORE_ID_KEY, storeId);
        sessionStorage.removeItem(ARCHIVE_MODE_KEY);
        sessionStorage.removeItem(ARCHIVE_NAME_KEY);
      }
    } catch {
      /* ignore */
    }
    set({ selectedStoreId: storeId || null, archiveMode: false, archivedStoreName: null });
  },
  enterArchiveMode: (storeId, storeName) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORE_ID_KEY, storeId);
        sessionStorage.setItem(ARCHIVE_MODE_KEY, 'true');
        sessionStorage.setItem(ARCHIVE_NAME_KEY, storeName);
      }
    } catch {
      /* ignore */
    }
    set({ selectedStoreId: storeId, archiveMode: true, archivedStoreName: storeName });
  },
  exitArchiveMode: () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORE_ID_KEY, DEFAULT_STORE_ID);
        sessionStorage.removeItem(ARCHIVE_MODE_KEY);
        sessionStorage.removeItem(ARCHIVE_NAME_KEY);
      }
    } catch {
      /* ignore */
    }
    set({ selectedStoreId: DEFAULT_STORE_ID, archiveMode: false, archivedStoreName: null });
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setFilter: (key, value) => set((s) => ({ activeFilters: { ...s.activeFilters, [key]: value } })),
  clearFilters: () => set({ activeFilters: {} }),
}));
