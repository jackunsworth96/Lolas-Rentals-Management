import { create } from 'zustand';

interface RealtimeState {
  connected: boolean;
  subscriptions: Map<string, unknown>;
  setConnected: (connected: boolean) => void;
  subscribe: (channel: string, callback: (payload: unknown) => void) => void;
  unsubscribe: (channel: string) => void;
  unsubscribeAll: () => void;
}

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  connected: false,
  subscriptions: new Map(),
  setConnected: (connected) => set({ connected }),
  subscribe: (channel, callback) => {
    const subs = new Map(get().subscriptions);
    subs.set(channel, callback);
    set({ subscriptions: subs });
  },
  unsubscribe: (channel) => {
    const subs = new Map(get().subscriptions);
    subs.delete(channel);
    set({ subscriptions: subs });
  },
  unsubscribeAll: () => set({ subscriptions: new Map() }),
}));
