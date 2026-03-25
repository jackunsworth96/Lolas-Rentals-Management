import { type TodoRepository, type TodoComment, DomainError } from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface AddCommentInput {
  taskId: string;
  employeeId: string;
  content: string;
}

export async function addComment(
  input: AddCommentInput,
  deps: { todo: TodoRepository },
): Promise<TodoComment> {
  if (!input.content || input.content.trim().length === 0) {
    throw new DomainError('Comment content is required');
  }

  const task = await deps.todo.findById(input.taskId);
  if (!task) throw new DomainError(`Task ${input.taskId} not found`);

  const now = new Date().toISOString();
  const comment: Omit<TodoComment, 'employeeName'> = {
    id: randomUUID(),
    taskId: input.taskId,
    employeeId: input.employeeId,
    content: input.content.trim(),
    createdAt: now,
  };

  await deps.todo.addComment(comment);

  await deps.todo.addEvent({
    taskId: input.taskId,
    eventType: 'commented',
    actorId: input.employeeId,
    actorName: null,
    detail: input.content.trim().slice(0, 200),
    createdAt: now,
  });

  const isStaff = input.employeeId === task.assignedTo;
  const recipientId = isStaff ? task.assignedBy : task.assignedTo;
  if (recipientId && recipientId !== input.employeeId) {
    await deps.todo.createNotification({
      taskId: input.taskId,
      recipientId,
      notificationType: 'comment',
    });
  }

  const list = await deps.todo.getComments(input.taskId);
  const saved = list.find((c) => c.id === comment.id);
  return saved ?? { ...comment, employeeName: null };
}
