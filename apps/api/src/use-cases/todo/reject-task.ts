import { type TodoRepository, type Task, DomainError } from '@lolas/domain';

export interface RejectTaskInput {
  taskId: string;
  managerId: string;
  reason: string;
}

export async function rejectTask(
  input: RejectTaskInput,
  deps: { todo: TodoRepository },
): Promise<Task> {
  const task = await deps.todo.findById(input.taskId);
  if (!task) throw new DomainError(`Task ${input.taskId} not found`);

  if (task.status !== 'Pending Verification') {
    throw new DomainError(
      `Task can only be rejected from Pending Verification status (current: ${task.status})`,
    );
  }

  if (!input.reason || input.reason.trim().length === 0) {
    throw new DomainError('Rejection reason is required');
  }

  const now = new Date().toISOString();
  await deps.todo.updateStatus(task.id, 'In Progress');

  await deps.todo.addEvent({
    taskId: task.id,
    eventType: 'rejected',
    actorId: input.managerId,
    actorName: null,
    detail: input.reason.trim(),
    createdAt: now,
  });

  await deps.todo.createNotification({
    taskId: task.id,
    recipientId: task.assignedTo,
    notificationType: 'rejected',
  });

  const refreshed = await deps.todo.findById(input.taskId);
  if (!refreshed) throw new DomainError('Task disappeared after update');
  return refreshed;
}
