import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useTaskNotificationStore, type TaskBanner } from '../stores/task-notification-store.js';

const TYPE_MESSAGES: Record<string, string> = {
  assigned: 'You have a new task assigned',
  rejected: 'A task was rejected — review required',
  escalated: 'A task has been escalated',
  overdue: 'A task is overdue',
  comment: 'New comment on a task',
};

export function useTaskRealtime(employeeId: string | undefined) {
  const qc = useQueryClient();
  const addBanner = useTaskNotificationStore((s) => s.addBanner);

  useEffect(() => {
    if (!supabase || !employeeId) return;

    const channel = supabase
      .channel('task-notifs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_notifications',
          filter: `recipient_id=eq.${employeeId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const notifType = row.notification_type as string;

          const banner: TaskBanner = {
            id: row.id as string,
            type: notifType as TaskBanner['type'],
            taskId: row.task_id as string,
            message: TYPE_MESSAGES[notifType] ?? 'Task notification',
            createdAt: row.created_at as string,
          };
          addBanner(banner);

          qc.invalidateQueries({ queryKey: ['todo', 'unseen'] });
          qc.invalidateQueries({ queryKey: ['todo', 'notifications'] });
          qc.invalidateQueries({ queryKey: ['todo'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeId, qc, addBanner]);
}
