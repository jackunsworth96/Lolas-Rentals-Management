import { type TodoRepository, type TaskPriority, DomainError } from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface CreateTaskInput {
  storeId: string;
  title: string;
  description: string | null;
  categoryId: number | null;
  assignedTo: string;
  vehicleId: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  createdBy: string;
}

export async function createTask(
  input: CreateTaskInput,
  deps: { todo: TodoRepository },
): Promise<NonNullable<Awaited<ReturnType<TodoRepository['findById']>>>> {
  if (!input.title || input.title.trim().length === 0) {
    throw new DomainError('Task title is required');
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const task = {
    id,
    storeId: input.storeId,
    title: input.title.trim(),
    description: input.description,
    categoryId: input.categoryId,
    assignedBy: input.createdBy,
    assignedTo: input.assignedTo,
    vehicleId: input.vehicleId,
    priority: input.priority,
    status: 'Created' as const,
    dueDate: input.dueDate,
    acknowledgedAt: null,
    escalationCount: 0,
    isEscalated: false,
    dateCreated: now,
    dateCompleted: null,
    updatedAt: now,
  };

  await deps.todo.save(task);
  await deps.todo.addEvent({
    taskId: id,
    eventType: 'created',
    actorId: input.createdBy,
    actorName: null,
    detail: null,
    createdAt: now,
  });
  await deps.todo.createNotification({
    taskId: id,
    recipientId: input.assignedTo,
    notificationType: 'assigned',
  });

  const created = await deps.todo.findById(id);
  if (!created) throw new DomainError('Failed to load created task');
  return created;
}
