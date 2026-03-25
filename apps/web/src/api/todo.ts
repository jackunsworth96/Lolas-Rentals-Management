import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface TaskRow {
  id: string;
  storeId: string;
  title: string;
  description: string | null;
  categoryId: number | null;
  categoryName: string | null;
  assignedBy: string;
  assignedByName: string | null;
  assignedTo: string;
  assignedToName: string | null;
  vehicleId: string | null;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  status: 'Created' | 'Acknowledged' | 'In Progress' | 'Pending Verification' | 'Closed';
  dueDate: string | null;
  acknowledgedAt: string | null;
  escalationCount: number;
  isEscalated: boolean;
  dateCreated: string;
  dateCompleted: string | null;
  updatedAt: string;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  actorId: string;
  actorName: string | null;
  detail: string | null;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  employeeId: string;
  employeeName: string | null;
  content: string;
  createdAt: string;
}

export interface TaskNotification {
  id: string;
  taskId: string;
  recipientId: string;
  notificationType: 'assigned' | 'rejected' | 'escalated' | 'overdue' | 'comment';
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

export interface TaskFilters {
  status?: string;
  priority?: string;
  assignedTo?: string;
  categoryId?: number;
  isEscalated?: boolean;
}

// ── List / single task ──

export function useTasks(storeId: string, filters: TaskFilters = {}) {
  const params = new URLSearchParams();
  if (storeId) params.set('storeId', storeId);
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.assignedTo) params.set('assignedTo', filters.assignedTo);
  if (filters.categoryId != null) params.set('categoryId', String(filters.categoryId));
  if (filters.isEscalated != null) params.set('isEscalated', String(filters.isEscalated));
  return useQuery<TaskRow[]>({
    queryKey: ['todo', storeId, filters],
    queryFn: () => api.get(`/todo?${params}`),
    enabled: !!storeId,
  });
}

export function useTask(id: string | undefined) {
  return useQuery<TaskRow>({
    queryKey: ['todo', 'detail', id],
    queryFn: () => api.get(`/todo/${id}`),
    enabled: !!id,
  });
}

// ── Create / update ──

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string;
      title: string;
      description?: string | null;
      categoryId?: number | null;
      assignedTo: string;
      vehicleId?: string | null;
      priority?: string;
      dueDate?: string | null;
    }) => api.post<TaskRow>('/todo', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: string;
      title?: string;
      description?: string | null;
      categoryId?: number | null;
      assignedTo?: string;
      vehicleId?: string | null;
      priority?: string;
      dueDate?: string | null;
    }) => api.put<TaskRow>(`/todo/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

// ── Lifecycle transitions ──

export function useAcknowledgeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<TaskRow>(`/todo/${id}/acknowledge`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

export function useStartTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<TaskRow>(`/todo/${id}/start`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

export function useSubmitTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<TaskRow>(`/todo/${id}/submit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

export function useVerifyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<TaskRow>(`/todo/${id}/verify`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

export function useRejectTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<TaskRow>(`/todo/${id}/reject`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

export function useEscalateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<TaskRow>(`/todo/${id}/escalate`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

// ── Comments ──

export function useTaskComments(taskId: string | undefined) {
  return useQuery<TaskComment[]>({
    queryKey: ['todo', taskId, 'comments'],
    queryFn: () => api.get(`/todo/${taskId}/comments`),
    enabled: !!taskId,
  });
}

export function useAddTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, content }: { taskId: string; content: string }) =>
      api.post<TaskComment>(`/todo/${taskId}/comment`, { content }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['todo', vars.taskId, 'comments'] });
      qc.invalidateQueries({ queryKey: ['todo', vars.taskId, 'events'] });
    },
  });
}

// ── Events / audit trail ──

export function useTaskEvents(taskId: string | undefined) {
  return useQuery<TaskEvent[]>({
    queryKey: ['todo', taskId, 'events'],
    queryFn: () => api.get(`/todo/${taskId}/events`),
    enabled: !!taskId,
  });
}

// ── Notifications ──

export function useUnseenTaskCount(employeeId: string) {
  return useQuery<{ count: number }>({
    queryKey: ['todo', 'unseen', employeeId],
    queryFn: () => api.get('/todo/unseen-count'),
    enabled: !!employeeId,
  });
}

export function useTaskNotifications(employeeId: string) {
  return useQuery<TaskNotification[]>({
    queryKey: ['todo', 'notifications', employeeId],
    queryFn: () => api.get('/todo/notifications'),
    enabled: !!employeeId,
  });
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post('/todo/notifications/dismiss', { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/todo/notifications/read-all', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

export function useMarkTaskSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/todo/${id}/seen`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todo'] }),
  });
}

// ── Reporting ──

export interface TaskReportRow {
  employeeId: string;
  employeeName: string;
  totalAssigned: number;
  completedOnTime: number;
  completedLate: number;
  rejectedCount: number;
  avgHoursToComplete: number | null;
}

export function useTaskReport(params: { storeId?: string; from: string; to: string }) {
  const search = new URLSearchParams();
  if (params.storeId) search.set('storeId', params.storeId);
  search.set('from', params.from);
  search.set('to', params.to);
  return useQuery<TaskReportRow[]>({
    queryKey: ['todo', 'report', params],
    queryFn: () => api.get(`/todo/report?${search}`),
    enabled: !!params.from && !!params.to,
  });
}
