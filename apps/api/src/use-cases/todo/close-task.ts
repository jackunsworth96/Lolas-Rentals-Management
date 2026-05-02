import { type TodoRepository, type Task, DomainError } from '@lolas/domain';

export interface CloseTaskInput {
  taskId: string;
  managerId: string;
}

/**
 * Force-closes a task on behalf of a manager (e.g. during end-of-day cash up).
 * Unlike submitTask, this does not require the actor to be the assigned employee,
 * and it moves the task directly to Closed without a Pending Verification step.
 */
export async function closeTask(
  input: CloseTaskInput,
  deps: { todo: TodoRepository },
): Promise<Task> {
  const task = await deps.todo.findById(input.taskId);
  if (!task) throw new DomainError(`Task ${input.taskId} not found`);

  if (task.status === 'Closed') {
    throw new DomainError('Task is already closed');
  }

  const now = new Date().toISOString();
  await deps.todo.updateStatus(task.id, 'Closed', {
    date_completed: now,
    is_escalated: false,
  });

  await deps.todo.addEvent({
    taskId: task.id,
    eventType: 'verified',
    actorId: input.managerId,
    actorName: null,
    detail: 'Closed during end-of-day cash up',
    createdAt: now,
  });

  const refreshed = await deps.todo.findById(input.taskId);
  if (!refreshed) throw new DomainError('Task disappeared after update');
  return refreshed;
}
