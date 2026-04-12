import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendEmail, waiverReminderHtml } from '../services/email.js';

export function startWaiverReminderJob(): void {
  // Run every hour at :00
  cron.schedule('0 * * * *', async () => {
    console.log('[waiver-reminder] Running check...');
    try {
      const sb = getSupabaseClient();
      const now = new Date();

      // Window: pickups between 23 and 25 hours from now
      const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

      // Find orders with a pickup in the 23-25hr window
      const { data: orderItems, error: itemsErr } = await sb
        .from('order_items')
        .select('order_id, pickup_datetime')
        .gte('pickup_datetime', windowStart)
        .lte('pickup_datetime', windowEnd);

      if (itemsErr) {
        console.error('[waiver-reminder] order_items query error:', itemsErr);
        return;
      }

      if (!orderItems?.length) {
        console.log('[waiver-reminder] No upcoming order items found');
        return;
      }

      const orderIds = [...new Set(orderItems.map((i) => i.order_id as string))];

      // Load matching orders that are active
      const { data: orders, error: ordersErr } = await sb
        .from('orders')
        .select('id, booking_token, customer_id, status')
        .in('id', orderIds)
        .in('status', ['active', 'confirmed']);

      if (ordersErr) {
        console.error('[waiver-reminder] orders query error:', ordersErr);
        return;
      }

      if (!orders?.length) {
        console.log('[waiver-reminder] No active/confirmed orders in window');
        return;
      }

      const tokens = orders
        .map((o) => o.booking_token as string | null)
        .filter((t): t is string => typeof t === 'string' && t.length > 0);

      // Find which tokens already have a signed waiver
      const { data: signedWaivers } = await sb
        .from('waivers')
        .select('order_reference')
        .in('order_reference', tokens)
        .eq('status', 'signed');

      const signedRefs = new Set((signedWaivers ?? []).map((w) => w.order_reference as string));

      // Find which orders already had a reminder sent today (Manila date)
      const manilaToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const dayStart = `${manilaToday}T00:00:00+08:00`;

      const { data: sentReminders } = await sb
        .from('waiver_reminder_log')
        .select('order_id')
        .in('order_id', orderIds)
        .gte('sent_at', dayStart);

      const alreadySent = new Set((sentReminders ?? []).map((r) => r.order_id as string));

      for (const order of orders) {
        const token = order.booking_token as string | null;
        if (!token || signedRefs.has(token)) continue;
        if (alreadySent.has(order.id as string)) continue;

        // Look up the customer
        const { data: customer } = await sb
          .from('customers')
          .select('email, name')
          .eq('id', order.customer_id)
          .maybeSingle();

        if (!(customer as { email?: string } | null)?.email) continue;

        const c = customer as { email: string; name?: string };

        // Resolve pickup datetime from the earliest order_item
        const pickupItem = orderItems
          .filter((i) => i.order_id === order.id)
          .sort((a, b) =>
            (a.pickup_datetime as string) < (b.pickup_datetime as string) ? -1 : 1,
          )[0];

        const pickupDatetime = pickupItem
          ? new Date(pickupItem.pickup_datetime as string).toLocaleString('en-PH', {
              timeZone: 'Asia/Manila',
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : 'Tomorrow';

        const waiverUrl = `${process.env.WEB_URL ?? 'https://lolasrentals.com'}/waiver/${token}`;
        const whatsappNumber = process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX';

        void sendEmail({
          to: c.email,
          subject: `Action Required — Sign Your Waiver | Lola's Rentals`,
          html: waiverReminderHtml({
            customerName: c.name ?? 'there',
            orderReference: token,
            pickupDatetime,
            waiverUrl,
            whatsappNumber,
          }),
        });

        // Log so we don't re-send within the same day
        await sb.from('waiver_reminder_log').insert({
          order_id: order.id,
          sent_at: now.toISOString(),
        });

        console.log('[waiver-reminder] Sent reminder for:', token);
      }
    } catch (err) {
      console.error('[waiver-reminder] Job error:', err);
    }
  });

  console.log('[waiver-reminder] Job scheduled (hourly)');
}
