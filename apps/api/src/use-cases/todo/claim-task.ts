import { type TodoRepository, type Task, DomainError } from '@lolas/domain';

export interface ClaimTaskInput {
  taskId: string;
  employeeId: string;
  storeId: string;
}

export async function claimTask(
  input: ClaimTaskInput,
  deps: { todo: TodoRepository },
): Promise<Task> {
  const task = await deps.todo.findById(input.taskId);

  if (!task) {
    throw new DomainError(`Task ${input.taskId} not found`);
  }

  if (task.assignedTo !== input.employeeId) {
    throw new DomainError('Only the assigned employee can acknowledge this task');
  }

  if (task.status !== 'Created') {
    throw new DomainError(
      `Task can only be acknowledged from Created status (current: ${task.status})`,
    );
  }

  const now = new Date().toISOString();
  await deps.todo.updateStatus(task.id, 'Acknowledged', {
    acknowledged_at: now,
  });

  await deps.todo.addEvent({
    taskId: task.id,
    eventType: 'acknowledged',
    actorId: input.employeeId,
    actorName: null,
    detail: null,
    createdAt: now,
  });

  await deps.todo.markNotificationsReadForTask(task.id, input.employeeId);

  const refreshed = await deps.todo.findById(input.taskId);
  if (!refreshed) throw new DomainError('Task disappeared after save');
  return refreshed;
}
