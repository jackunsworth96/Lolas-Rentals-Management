import { type TodoRepository } from '@lolas/domain';

export interface MarkSeenInput {
  taskId: string;
  userId: string;
}

export interface MarkSeenResult {
  taskId: string;
  unseenCount: number;
}

export async function markSeen(
  input: MarkSeenInput,
  deps: { todo: TodoRepository },
): Promise<MarkSeenResult> {
  await deps.todo.markNotificationsReadForTask(input.taskId, input.userId);
  const unseenCount = await deps.todo.getUnreadCount(input.userId);

  return {
    taskId: input.taskId,
    unseenCount,
  };
}
