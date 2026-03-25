export type TaskStatus =
  | 'Created'
  | 'Acknowledged'
  | 'In Progress'
  | 'Pending Verification'
  | 'Closed';

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface Task {
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
  priority: TaskPriority;
  status: TaskStatus;
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

export interface TaskNotification {
  id: string;
  taskId: string;
  recipientId: string;
  notificationType: 'assigned' | 'rejected' | 'escalated' | 'overdue' | 'comment';
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

export interface TodoComment {
  id: string;
  taskId: string;
  employeeId: string;
  employeeName: string | null;
  content: string;
  createdAt: string;
}

export interface TodoFilters {
  status?: string;
  priority?: string;
  assignedTo?: string;
  categoryId?: number;
  isEscalated?: boolean;
}

export interface TodoRepository {
  findById(id: string): Promise<Task | null>;
  findForEmployee(employeeId: string, filters?: TodoFilters): Promise<Task[]>;
  findForStore(storeId: string, filters?: TodoFilters): Promise<Task[]>;
  findForStores(storeIds: string[], filters?: TodoFilters): Promise<Task[]>;
  save(task: Omit<Task, 'categoryName' | 'assignedByName' | 'assignedToName'>): Promise<void>;
  updateFields(id: string, fields: Record<string, unknown>): Promise<void>;
  updateStatus(id: string, status: TaskStatus, extras?: Record<string, unknown>): Promise<void>;

  addComment(comment: Omit<TodoComment, 'employeeName'>): Promise<void>;
  getComments(taskId: string): Promise<TodoComment[]>;

  addEvent(event: Omit<TaskEvent, 'id'>): Promise<void>;
  getEvents(taskId: string): Promise<TaskEvent[]>;

  createNotification(n: Omit<TaskNotification, 'id' | 'isRead' | 'isDismissed' | 'createdAt'>): Promise<void>;
  getNotifications(recipientId: string): Promise<TaskNotification[]>;
  getUnreadCount(recipientId: string): Promise<number>;
  dismissNotification(id: string): Promise<void>;
  markAllRead(recipientId: string): Promise<void>;
  markNotificationsReadForTask(taskId: string, recipientId: string): Promise<void>;

  getReport(storeIds: string[], dateFrom: string, dateTo: string): Promise<TaskReportRow[]>;
}

export interface TaskReportRow {
  employeeId: string;
  employeeName: string;
  totalAssigned: number;
  completedOnTime: number;
  completedLate: number;
  rejectedCount: number;
  avgHoursToComplete: number | null;
}
