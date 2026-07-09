import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface PartnerAuthUser {
  scope: 'partner';
  partnerUserId: string;
  partnerId: string;
  partnerSlug: string;
  storeId: string;
  username: string;
  name: string;
}

interface PartnerAuthState {
  token: string | null;
  user: PartnerAuthUser | null;
  setPartnerAuth: (token: string, user: PartnerAuthUser) => void;
  logout: () => void;
}

export const usePartnerAuthStore = create<PartnerAuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setPartnerAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'lolas-partner-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
