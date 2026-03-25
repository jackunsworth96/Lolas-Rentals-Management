import { type TodoRepository, type Task, DomainError } from '@lolas/domain';

export interface SubmitTaskInput {
  taskId: string;
  employeeId: string;
}

export async function submitTask(
  input: SubmitTaskInput,
  deps: { todo: TodoRepository },
): Promise<Task> {
  const task = await deps.todo.findById(input.taskId);
  if (!task) throw new DomainError(`Task ${input.taskId} not found`);

  if (task.assignedTo !== input.employeeId) {
    throw new DomainError('Only the assigned employee can submit this task for verification');
  }

  if (task.status !== 'In Progress') {
    throw new DomainError(
      `Task can only be submitted from In Progress status (current: ${task.status})`,
    );
  }

  const now = new Date().toISOString();
  await deps.todo.updateStatus(task.id, 'Pending Verification');

  await deps.todo.addEvent({
    taskId: task.id,
    eventType: 'submitted',
    actorId: input.employeeId,
    actorName: null,
    detail: null,
    createdAt: now,
  });

  if (task.assignedBy && task.assignedBy !== input.employeeId) {
    await deps.todo.createNotification({
      taskId: task.id,
      recipientId: task.assignedBy,
      notificationType: 'assigned',
    });
  }

  const refreshed = await deps.todo.findById(input.taskId);
  if (!refreshed) throw new DomainError('Task disappeared after update');
  return refreshed;
}
