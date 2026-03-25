import { type TodoRepository, type Task, DomainError } from '@lolas/domain';

export interface EscalateTaskInput {
  taskId: string;
  managerId: string;
  reason: string;
}

export async function escalateTask(
  input: EscalateTaskInput,
  deps: { todo: TodoRepository },
): Promise<Task> {
  const task = await deps.todo.findById(input.taskId);
  if (!task) throw new DomainError(`Task ${input.taskId} not found`);

  if (task.status === 'Closed') {
    throw new DomainError('Cannot escalate a closed task');
  }

  if (!input.reason || input.reason.trim().length === 0) {
    throw new DomainError('Escalation reason is required');
  }

  const now = new Date().toISOString();
  await deps.todo.updateStatus(task.id, task.status, {
    is_escalated: true,
    escalation_count: task.escalationCount + 1,
  });

  await deps.todo.addEvent({
    taskId: task.id,
    eventType: 'escalated',
    actorId: input.managerId,
    actorName: null,
    detail: input.reason.trim(),
    createdAt: now,
  });

  await deps.todo.createNotification({
    taskId: task.id,
    recipientId: task.assignedTo,
    notificationType: 'escalated',
  });

  const refreshed = await deps.todo.findById(input.taskId);
  if (!refreshed) throw new DomainError('Task disappeared after update');
  return refreshed;
}
