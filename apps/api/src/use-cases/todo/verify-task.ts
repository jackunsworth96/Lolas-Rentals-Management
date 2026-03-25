import { type TodoRepository, type Task, DomainError } from '@lolas/domain';

export interface VerifyTaskInput {
  taskId: string;
  managerId: string;
}

export async function verifyTask(
  input: VerifyTaskInput,
  deps: { todo: TodoRepository },
): Promise<Task> {
  const task = await deps.todo.findById(input.taskId);
  if (!task) throw new DomainError(`Task ${input.taskId} not found`);

  if (task.status !== 'Pending Verification') {
    throw new DomainError(
      `Task can only be verified from Pending Verification status (current: ${task.status})`,
    );
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
    detail: null,
    createdAt: now,
  });

  const refreshed = await deps.todo.findById(input.taskId);
  if (!refreshed) throw new DomainError('Task disappeared after update');
  return refreshed;
}
