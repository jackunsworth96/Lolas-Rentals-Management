import { type TodoRepository, type Task, DomainError } from '@lolas/domain';

export interface StartTaskInput {
  taskId: string;
  employeeId: string;
}

export async function startTask(
  input: StartTaskInput,
  deps: { todo: TodoRepository },
): Promise<Task> {
  const task = await deps.todo.findById(input.taskId);
  if (!task) throw new DomainError(`Task ${input.taskId} not found`);

  if (task.assignedTo !== input.employeeId) {
    throw new DomainError('Only the assigned employee can start this task');
  }

  if (task.status !== 'Acknowledged') {
    throw new DomainError(
      `Task can only be started from Acknowledged status (current: ${task.status})`,
    );
  }

  const now = new Date().toISOString();
  await deps.todo.updateStatus(task.id, 'In Progress');

  await deps.todo.addEvent({
    taskId: task.id,
    eventType: 'started',
    actorId: input.employeeId,
    actorName: null,
    detail: null,
    createdAt: now,
  });

  const refreshed = await deps.todo.findById(input.taskId);
  if (!refreshed) throw new DomainError('Task disappeared after update');
  return refreshed;
}
