import cron from 'node-cron';

/** Monday picking cycle for next week's rota (Asia/Manila). */
export function startRotaReminderJob(): void {
  const run = (label: string, fn: () => Promise<void>) => () => {
    void fn().catch((err) => console.error(`[rota-reminders] ${label}`, err));
  };
  const load = () => import('../use-cases/hr/rota.js');

  cron.schedule('0 9 * * 1', run('pick reminder', async () => (await load()).sendPickReminders()), { timezone: 'Asia/Manila' });
  cron.schedule('0 20 * * 1', run('approver digest', async () => (await load()).sendApproverDigest()), { timezone: 'Asia/Manila' });
  cron.schedule('0 12 * * 3', run('unpublished nudge', async () => (await load()).sendUnpublishedNudge()), { timezone: 'Asia/Manila' });

  console.log('[rota-reminders] Jobs scheduled (Mon 09:00 picks, Mon 20:00 approver digest, Wed 12:00 unpublished nudge, Asia/Manila)');
}
