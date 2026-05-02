import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { logger } from '../../lib/logger.js';

export type TelegramCompleteResult =
  | { ok: true; taskTitle: string; assignedByName: string | null }
  | { ok: false; reason: 'task_not_found' | 'not_assignee' | 'employee_not_found' | 'already_done' | 'db_error' };

/**
 * Moves a task to "Pending Verification" when triggered from Telegram.
 * Validates that the tapping user's Telegram user ID matches the employee
 * who was assigned the task — no one else can complete it.
 *
 * Accepts tasks in any active state (Created / Acknowledged / In Progress)
 * since the assignee may not have interacted with the back office before tapping.
 */
export async function telegramCompleteTask(input: {
  taskId: string;
  telegramUserId: string;
}): Promise<TelegramCompleteResult> {
  const sb = getSupabaseClient();
  const now = new Date().toISOString();

  // Resolve telegram user → employee
  const { data: empRow, error: empErr } = await sb
    .from('employees')
    .select('id, full_name')
    .eq('telegram_user_id', input.telegramUserId)
    .maybeSingle();

  if (empErr) {
    logger.warn({ err: empErr.message }, 'telegramCompleteTask: employee lookup failed');
    return { ok: false, reason: 'db_error' };
  }
  if (!empRow) {
    return { ok: false, reason: 'employee_not_found' };
  }

  const employeeId = empRow.id as string;

  // Fetch the task
  const { data: taskRow, error: taskErr } = await sb
    .from('todo_tasks')
    .select('id, title, status, assigned_to, assigned_by')
    .eq('id', input.taskId)
    .maybeSingle();

  if (taskErr) {
    logger.warn({ err: taskErr.message }, 'telegramCompleteTask: task lookup failed');
    return { ok: false, reason: 'db_error' };
  }
  if (!taskRow) {
    return { ok: false, reason: 'task_not_found' };
  }

  if ((taskRow.assigned_to as string) !== employeeId) {
    return { ok: false, reason: 'not_assignee' };
  }

  const terminalStatuses = ['Pending Verification', 'Closed'];
  if (terminalStatuses.includes(taskRow.status as string)) {
    return { ok: false, reason: 'already_done' };
  }

  // Transition to Pending Verification
  const { error: updateErr } = await sb
    .from('todo_tasks')
    .update({ status: 'Pending Verification', updated_at: now })
    .eq('id', input.taskId);

  if (updateErr) {
    logger.warn({ err: updateErr.message }, 'telegramCompleteTask: status update failed');
    return { ok: false, reason: 'db_error' };
  }

  // Audit event
  const { error: eventErr } = await sb.from('task_events').insert({
    id: randomUUID(),
    task_id: input.taskId,
    event_type: 'submitted',
    actor_id: employeeId,
    actor_name: empRow.full_name as string,
    detail: 'Marked done via Telegram',
    created_at: now,
  });
  if (eventErr) {
    logger.warn({ err: eventErr.message }, 'telegramCompleteTask: event insert failed (non-fatal)');
  }

  // In-app notification to the assignor (if different from assignee)
  const assignedBy = taskRow.assigned_by as string | null;
  if (assignedBy && assignedBy !== employeeId) {
    const { error: notifErr } = await sb.from('task_notifications').insert({
      task_id: input.taskId,
      recipient_id: assignedBy,
      notification_type: 'assigned',
    });
    if (notifErr) {
      logger.warn({ err: notifErr.message }, 'telegramCompleteTask: notification insert failed (non-fatal)');
    }
  }

  // Resolve the assignor's name for the caller to use in messages
  let assignedByName: string | null = null;
  if (assignedBy) {
    const { data: byRow } = await sb
      .from('employees')
      .select('full_name')
      .eq('id', assignedBy)
      .maybeSingle();
    assignedByName = byRow ? (byRow.full_name as string) : null;
  }

  logger.info({ taskId: input.taskId, employeeId }, 'telegramCompleteTask: task moved to Pending Verification');

  return { ok: true, taskTitle: taskRow.title as string, assignedByName };
}
