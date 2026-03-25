import { type TodoRepository, type Task, DomainError } from '@lolas/domain';

export interface UpdateTaskInput {
  taskId: string;
  actorId: string;
  title?: string;
  description?: string | null;
  categoryId?: number | null;
  assignedTo?: string;
  vehicleId?: string | null;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  dueDate?: string | null;
}

export async function updateTask(
  input: UpdateTaskInput,
  deps: { todo: TodoRepository },
): Promise<Task> {
  const task = await deps.todo.findById(input.taskId);
  if (!task) throw new DomainError(`Task ${input.taskId} not found`);

  if (task.status === 'Closed') {
    throw new DomainError('Cannot update a closed task');
  }

  const now = new Date().toISOString();
  const changes: Record<string, unknown> = {};
  const details: string[] = [];

  if (input.title !== undefined && input.title !== task.title) {
    changes.title = input.title;
    changes.task_description = input.title;
    details.push('title changed');
  }
  if (input.description !== undefined) {
    changes.description = input.description;
  }
  if (input.categoryId !== undefined) {
    changes.category_id = input.categoryId;
  }
  if (input.vehicleId !== undefined) {
    changes.vehicle_id = input.vehicleId;
  }
  if (input.priority !== undefined && input.priority !== task.priority) {
    changes.priority = input.priority;
    details.push(`priority → ${input.priority}`);
  }
  if (input.dueDate !== undefined && input.dueDate !== task.dueDate) {
    changes.due_date = input.dueDate;
    details.push(`due date → ${input.dueDate ?? 'none'}`);
  }

  const reassigning = input.assignedTo !== undefined && input.assignedTo !== task.assignedTo;
  if (reassigning) {
    changes.assigned_to = input.assignedTo;
    details.push('reassigned');
  }

  if (Object.keys(changes).length > 0) {
    await deps.todo.updateFields(task.id, changes);
  }

  if (details.length > 0) {
    await deps.todo.addEvent({
      taskId: task.id,
      eventType: reassigning ? 'reassigned' : 'updated',
      actorId: input.actorId,
      actorName: null,
      detail: details.join('; '),
      createdAt: now,
    });
  }

  if (reassigning && input.assignedTo) {
    await deps.todo.createNotification({
      taskId: task.id,
      recipientId: input.assignedTo,
      notificationType: 'assigned',
    });
  }

  const refreshed = await deps.todo.findById(input.taskId);
  if (!refreshed) throw new DomainError('Task disappeared after update');
  return refreshed;
}
