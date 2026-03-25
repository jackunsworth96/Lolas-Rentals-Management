import { create } from 'zustand';

export interface TaskBanner {
  id: string;
  type: 'assigned' | 'rejected' | 'escalated' | 'overdue' | 'comment';
  taskId: string;
  message: string;
  createdAt: string;
}

interface TaskNotificationState {
  banners: TaskBanner[];
  addBanner: (banner: TaskBanner) => void;
  dismissBanner: (id: string) => void;
  clearAll: () => void;
}

export const useTaskNotificationStore = create<TaskNotificationState>((set) => ({
  banners: [],
  addBanner: (banner) =>
    set((s) => ({ banners: [banner, ...s.banners].slice(0, 10) })),
  dismissBanner: (id) =>
    set((s) => ({ banners: s.banners.filter((b) => b.id !== id) })),
  clearAll: () => set({ banners: [] }),
}));
