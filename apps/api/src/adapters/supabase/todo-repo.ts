import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from './client.js';
import type {
  Task,
  TaskNotification,
  TaskPriority,
  TaskReportRow,
  TaskStatus,
  TodoComment,
  TodoFilters,
  TodoRepository,
} from '@lolas/domain';

function normalizePriority(p: string | undefined): TaskPriority {
  const x = (p ?? 'Medium').toString();
  const cap = x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  if (['Low', 'Medium', 'High', 'Urgent'].includes(cap)) return cap as TaskPriority;
  const m: Record<string, TaskPriority> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
  };
  return m[x.toLowerCase()] ?? 'Medium';
}

function normalizeStatus(s: string | undefined): TaskStatus {
  const v = s ?? 'Created';
  const allowed: TaskStatus[] = [
    'Created',
    'Acknowledged',
    'In Progress',
    'Pending Verification',
    'Closed',
  ];
  if (allowed.includes(v as TaskStatus)) return v as TaskStatus;
  if (v === 'Open') return 'Created';
  if (v === 'Completed') return 'Closed';
  if (v === 'in_progress') return 'In Progress';
  return 'Created';
}

function rowToTask(
  row: Record<string, unknown>,
  empNames: Record<string, string>,
  catNames: Record<number, string>,
): Task {
  const title =
    (row.title as string | null) ||
    (row.task_description as string | null) ||
    '';
  const dateCreated = row.date_created
    ? new Date(row.date_created as string).toISOString()
    : new Date().toISOString();
  const updatedAt = row.updated_at
    ? new Date(row.updated_at as string).toISOString()
    : dateCreated;
  const catId = row.category_id != null ? Number(row.category_id) : null;
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    title,
    description: (row.description as string | null) ?? null,
    categoryId: catId,
    categoryName: catId != null ? (catNames[catId] ?? null) : null,
    assignedBy: (row.assigned_by as string) ?? '',
    assignedByName: row.assigned_by
      ? (empNames[row.assigned_by as string] ?? null)
      : null,
    assignedTo: (row.assigned_to as string) ?? '',
    assignedToName: row.assigned_to
      ? (empNames[row.assigned_to as string] ?? null)
      : null,
    vehicleId: (row.vehicle_id as string | null) ?? null,
    priority: normalizePriority(row.priority as string),
    status: normalizeStatus(row.status as string),
    dueDate: (row.due_date as string | null) ?? null,
    acknowledgedAt: row.acknowledged_at
      ? new Date(row.acknowledged_at as string).toISOString()
      : null,
    escalationCount: Number(row.escalation_count ?? 0),
    isEscalated: Boolean(row.is_escalated),
    dateCreated,
    dateCompleted: row.date_completed
      ? new Date(row.date_completed as string).toISOString()
      : null,
    updatedAt,
  };
}

async function enrichTaskRows(
  sb: ReturnType<typeof getSupabaseClient>,
  rows: Record<string, unknown>[],
): Promise<Task[]> {
  const empIds = new Set<string>();
  const catIds = new Set<number>();
  for (const r of rows) {
    if (r.assigned_by) empIds.add(r.assigned_by as string);
    if (r.assigned_to) empIds.add(r.assigned_to as string);
    if (r.category_id != null) catIds.add(Number(r.category_id));
  }
  const empList = [...empIds];
  const { data: emps } =
    empList.length > 0
      ? await sb.from('employees').select('id, full_name').in('id', empList)
      : { data: [] as { id: string; full_name: string }[] };
  const catList = [...catIds];
  const { data: cats } =
    catList.length > 0
      ? await sb.from('task_categories').select('id, name').in('id', catList)
      : { data: [] as { id: number; name: string }[] };
  const empNames = Object.fromEntries(
    (emps ?? []).map((e) => [e.id, e.full_name as string]),
  );
  const catNames = Object.fromEntries(
    (cats ?? []).map((c) => [Number(c.id), c.name as string]),
  );
  return rows.map((r) => rowToTask(r, empNames, catNames));
}

function applyTaskFilters(
  query: ReturnType<ReturnType<typeof getSupabaseClient>['from']>['select'],
  filters?: TodoFilters,
) {
  if (!filters) return query;
  let q = query;
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.priority) q = q.eq('priority', filters.priority);
  if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo);
  if (filters.categoryId != null) q = q.eq('category_id', filters.categoryId);
  if (filters.isEscalated === true) q = q.eq('is_escalated', true);
  return q;
}

function taskToPersistRow(
  t: Omit<Task, 'categoryName' | 'assignedByName' | 'assignedToName'>,
): Record<string, unknown> {
  return {
    id: t.id,
    store_id: t.storeId,
    title: t.title,
    description: t.description,
    category_id: t.categoryId,
    assigned_by: t.assignedBy,
    assigned_to: t.assignedTo,
    vehicle_id: t.vehicleId,
    priority: t.priority,
    status: t.status,
    due_date: t.dueDate,
    acknowledged_at: t.acknowledgedAt,
    escalation_count: t.escalationCount,
    is_escalated: t.isEscalated,
    date_created: t.dateCreated,
    date_completed: t.dateCompleted,
    updated_at: t.updatedAt,
    task_description: t.title,
  };
}

export function createTodoRepo(): TodoRepository {
  const sb = getSupabaseClient();

  return {
    async findById(id) {
      const { data, error } = await sb.from('todo_tasks').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`Failed to fetch task: ${error.message}`);
      if (!data) return null;
      const [task] = await enrichTaskRows(sb, [data as Record<string, unknown>]);
      return task ?? null;
    },

    async findForEmployee(employeeId, filters?) {
      const base = sb.from('todo_tasks').select('*').eq('assigned_to', employeeId);
      const filtered = applyTaskFilters(base, filters);
      const { data, error } = await filtered
        .order('is_escalated', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw new Error(`Failed to fetch tasks for employee: ${error.message}`);
      return enrichTaskRows(sb, (data ?? []) as Record<string, unknown>[]);
    },

    async findForStore(storeId, filters?) {
      const base = sb.from('todo_tasks').select('*').eq('store_id', storeId);
      const filtered = applyTaskFilters(base, filters);
      const { data, error } = await filtered
        .order('is_escalated', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw new Error(`Failed to fetch tasks by store: ${error.message}`);
      return enrichTaskRows(sb, (data ?? []) as Record<string, unknown>[]);
    },

    async findForStores(storeIds, filters?) {
      if (storeIds.length === 0) return [];
      const base = sb.from('todo_tasks').select('*').in('store_id', storeIds);
      const filtered = applyTaskFilters(base, filters);
      const { data, error } = await filtered
        .order('is_escalated', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw new Error(`Failed to fetch tasks for stores: ${error.message}`);
      return enrichTaskRows(sb, (data ?? []) as Record<string, unknown>[]);
    },

    async save(task) {
      const row = taskToPersistRow(task);
      const { error } = await sb.from('todo_tasks').upsert(row);
      if (error) throw new Error(`Failed to save task: ${error.message}`);
    },

    async updateFields(id, fields) {
      const patch = { ...fields, updated_at: new Date().toISOString() };
      const { error } = await sb.from('todo_tasks').update(patch).eq('id', id);
      if (error) throw new Error(`Failed to update task fields: ${error.message}`);
    },

    async updateStatus(id, status, extras = {}) {
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
        ...extras,
      };
      const { error } = await sb.from('todo_tasks').update(patch).eq('id', id);
      if (error) throw new Error(`Failed to update task status: ${error.message}`);
    },

    async addComment(comment) {
      const { error } = await sb.from('todo_comments').insert({
        id: comment.id,
        task_id: comment.taskId,
        employee_id: comment.employeeId,
        content: comment.content,
        created_at: comment.createdAt,
      });
      if (error) throw new Error(`Failed to add comment: ${error.message}`);
    },

    async getComments(taskId) {
      const { data, error } = await sb
        .from('todo_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Failed to fetch comments: ${error.message}`);
      const rows = (data ?? []) as Record<string, unknown>[];
      const empIds = [...new Set(rows.map((r) => r.employee_id as string).filter(Boolean))];
      const { data: emps } =
        empIds.length > 0
          ? await sb.from('employees').select('id, full_name').in('id', empIds)
          : { data: [] as { id: string; full_name: string }[] };
      const names = Object.fromEntries(
        (emps ?? []).map((e) => [e.id, e.full_name as string]),
      );
      return rows.map((r) => ({
        id: r.id as string,
        taskId: r.task_id as string,
        employeeId: r.employee_id as string,
        employeeName: names[r.employee_id as string] ?? null,
        content: r.content as string,
        createdAt: new Date(r.created_at as string).toISOString(),
      }));
    },

    async addEvent(event) {
      const id = randomUUID();
      const { error } = await sb.from('task_events').insert({
        id,
        task_id: event.taskId,
        event_type: event.eventType,
        actor_id: event.actorId,
        actor_name: event.actorName,
        detail: event.detail,
        created_at: event.createdAt,
      });
      if (error) throw new Error(`Failed to add task event: ${error.message}`);
    },

    async getEvents(taskId) {
      const { data, error } = await sb
        .from('task_events')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Failed to fetch task events: ${error.message}`);
      const rows = (data ?? []) as Record<string, unknown>[];
      const actorIds = [...new Set(rows.map((r) => r.actor_id as string).filter(Boolean))];
      const { data: emps } =
        actorIds.length > 0
          ? await sb.from('employees').select('id, full_name').in('id', actorIds)
          : { data: [] as { id: string; full_name: string }[] };
      const names = Object.fromEntries(
        (emps ?? []).map((e) => [e.id, e.full_name as string]),
      );
      return rows.map((r) => ({
        id: r.id as string,
        taskId: r.task_id as string,
        eventType: r.event_type as string,
        actorId: r.actor_id as string,
        actorName: (r.actor_name as string | null) ?? names[r.actor_id as string] ?? null,
        detail: (r.detail as string | null) ?? null,
        createdAt: new Date(r.created_at as string).toISOString(),
      }));
    },

    async createNotification(n) {
      const { error } = await sb.from('task_notifications').insert({
        task_id: n.taskId,
        recipient_id: n.recipientId,
        notification_type: n.notificationType,
      });
      if (error) throw new Error(`Failed to create notification: ${error.message}`);
    },

    async getNotifications(recipientId) {
      const { data, error } = await sb
        .from('task_notifications')
        .select('*')
        .eq('recipient_id', recipientId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
      return (data ?? []).map((r) => ({
        id: r.id as string,
        taskId: r.task_id as string,
        recipientId: r.recipient_id as string,
        notificationType: r.notification_type as TaskNotification['notificationType'],
        isRead: Boolean(r.is_read),
        isDismissed: Boolean(r.is_dismissed),
        createdAt: new Date(r.created_at as string).toISOString(),
      }));
    },

    async getUnreadCount(recipientId) {
      const { count, error } = await sb
        .from('task_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', recipientId)
        .eq('is_read', false)
        .eq('is_dismissed', false);
      if (error) throw new Error(`Failed to count unread notifications: ${error.message}`);
      return count ?? 0;
    },

    async dismissNotification(id) {
      const { error } = await sb
        .from('task_notifications')
        .update({ is_dismissed: true })
        .eq('id', id);
      if (error) throw new Error(`Failed to dismiss notification: ${error.message}`);
    },

    async markAllRead(recipientId) {
      const { error } = await sb
        .from('task_notifications')
        .update({ is_read: true })
        .eq('recipient_id', recipientId);
      if (error) throw new Error(`Failed to mark notifications read: ${error.message}`);
    },

    async markNotificationsReadForTask(taskId, recipientId) {
      const { error } = await sb
        .from('task_notifications')
        .update({ is_read: true })
        .eq('task_id', taskId)
        .eq('recipient_id', recipientId);
      if (error) throw new Error(`Failed to mark task notifications read: ${error.message}`);
    },

    async getReport(storeIds, dateFrom, dateTo) {
      if (storeIds.length === 0) return [] as TaskReportRow[];

      const { data: tasks, error } = await sb
        .from('todo_tasks')
        .select('id, assigned_to, status, due_date, date_created, date_completed')
        .in('store_id', storeIds)
        .gte('date_created', dateFrom)
        .lte('date_created', dateTo);
      if (error) throw new Error(`Failed to fetch report tasks: ${error.message}`);
      if (!tasks || tasks.length === 0) return [] as TaskReportRow[];

      const { data: rejections, error: rejErr } = await sb
        .from('task_events')
        .select('task_id')
        .eq('event_type', 'rejected')
        .in('task_id', tasks.map((t) => t.id));
      if (rejErr) throw new Error(`Failed to fetch rejections: ${rejErr.message}`);

      const rejCountByTask = new Map<string, number>();
      for (const r of rejections ?? []) {
        const tid = r.task_id as string;
        rejCountByTask.set(tid, (rejCountByTask.get(tid) ?? 0) + 1);
      }

      const empIds = [...new Set(tasks.map((t) => t.assigned_to as string).filter(Boolean))];
      const { data: emps } = empIds.length > 0
        ? await sb.from('employees').select('id, full_name').in('id', empIds)
        : { data: [] as { id: string; full_name: string }[] };
      const empNames = Object.fromEntries(
        (emps ?? []).map((e) => [e.id, e.full_name as string]),
      );

      const byEmployee = new Map<string, {
        total: number;
        onTime: number;
        late: number;
        rejected: number;
        totalHours: number;
        completedCount: number;
      }>();

      for (const t of tasks) {
        const eid = t.assigned_to as string;
        if (!eid) continue;
        if (!byEmployee.has(eid)) {
          byEmployee.set(eid, { total: 0, onTime: 0, late: 0, rejected: 0, totalHours: 0, completedCount: 0 });
        }
        const agg = byEmployee.get(eid)!;
        agg.total++;
        agg.rejected += rejCountByTask.get(t.id as string) ?? 0;

        if (t.status === 'Closed' && t.date_completed) {
          const completed = new Date(t.date_completed as string);
          const created = new Date(t.date_created as string);
          const hours = (completed.getTime() - created.getTime()) / 3_600_000;
          agg.totalHours += hours;
          agg.completedCount++;

          if (t.due_date) {
            const due = new Date(t.due_date as string);
            due.setHours(23, 59, 59, 999);
            if (completed <= due) agg.onTime++;
            else agg.late++;
          } else {
            agg.onTime++;
          }
        }
      }

      const rows: TaskReportRow[] = [];
      for (const [eid, agg] of byEmployee) {
        rows.push({
          employeeId: eid,
          employeeName: empNames[eid] ?? eid,
          totalAssigned: agg.total,
          completedOnTime: agg.onTime,
          completedLate: agg.late,
          rejectedCount: agg.rejected,
          avgHoursToComplete: agg.completedCount > 0
            ? Math.round((agg.totalHours / agg.completedCount) * 10) / 10
            : null,
        });
      }

      rows.sort((a, b) => b.totalAssigned - a.totalAssigned);
      return rows;
    },
  };
}
