import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendEmail, postRentalThankYouHtml } from '../services/email.js';
import { formatManilaDate } from '../utils/manila-date.js';

export function startPostRentalEmailJob(): void {
  // Run every hour at :30
  cron.schedule('30 * * * *', async () => {
    console.log('[post-rental-email] Running check...');
    try {
      const sb = getSupabaseClient();
      const now = new Date();

      // Find orders completed 23–25 hours ago using updated_at as proxy for completed_at
      const windowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();

      const { data: orders, error: ordersErr } = await sb
        .from('orders')
        .select('id, booking_token, customer_id, final_total, updated_at, store_id')
        .eq('status', 'completed')
        .gte('updated_at', windowStart)
        .lte('updated_at', windowEnd);

      if (ordersErr) {
        console.error('[post-rental-email] Orders query error:', ordersErr);
        return;
      }

      if (!orders?.length) {
        console.log('[post-rental-email] No completed orders in window');
        return;
      }

      // Filter out orders that already had this email sent
      const { data: alreadySent } = await sb
        .from('post_rental_email_log')
        .select('order_id')
        .in('order_id', orders.map((o) => o.id as string));

      const sentIds = new Set((alreadySent ?? []).map((r) => r.order_id as string));

      for (const order of orders) {
        if (sentIds.has(order.id as string)) continue;

        // Resolve customer
        const { data: customer } = await sb
          .from('customers')
          .select('email, name')
          .eq('id', order.customer_id)
          .maybeSingle();

        if (!(customer as { email?: string } | null)?.email) continue;
        const c = customer as { email: string; name?: string };

        // Resolve order items (pickup/dropoff dates + vehicle model)
        const { data: items } = await sb
          .from('order_items')
          .select('pickup_datetime, dropoff_datetime, vehicle_name')
          .eq('order_id', order.id)
          .order('pickup_datetime', { ascending: true })
          .limit(1)
          .maybeSingle();

        const i = items as {
          pickup_datetime?: string;
          dropoff_datetime?: string;
          vehicle_name?: string;
        } | null;

        // Rental duration
        const pickup = i?.pickup_datetime ? new Date(i.pickup_datetime) : null;
        const dropoff = i?.dropoff_datetime ? new Date(i.dropoff_datetime) : null;
        const rentalDays =
          pickup && dropoff
            ? Math.max(1, Math.round((dropoff.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24)))
            : 1;

        // Paw Card savings during rental window
        const pickupDate = pickup ? formatManilaDate(pickup) : null;
        const dropoffDate = dropoff ? formatManilaDate(dropoff) : null;

        let pawCardSavings = 0;
        let pawCardEstablishments: Array<{ name: string; saved: number }> = [];

        if (pickupDate && dropoffDate) {
          const { data: entries } = await sb
            .from('paw_card_entries')
            .select('establishment, amount_saved')
            .ilike('email', c.email)
            .gte('date_of_visit', pickupDate)
            .lte('date_of_visit', dropoffDate);

          if (entries?.length) {
            pawCardSavings = entries.reduce(
              (sum, e) => sum + (Number((e as { amount_saved?: unknown }).amount_saved) || 0),
              0,
            );
            const estMap = new Map<string, number>();
            for (const e of entries) {
              const name =
                ((e as { establishment?: string }).establishment ?? 'Unknown').trim() || 'Unknown';
              estMap.set(name, (estMap.get(name) ?? 0) + Number((e as { amount_saved?: unknown }).amount_saved));
            }
            pawCardEstablishments = [...estMap.entries()].map(([name, saved]) => ({ name, saved }));
          }
        }

        const formatManila = (iso: string) =>
          new Date(iso).toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            dateStyle: 'medium',
            timeStyle: 'short',
          });

        void sendEmail({
          to: c.email,
          subject: `Thank you for riding with Lola's 🐾 — ${(order.booking_token as string | null) ?? order.id}`,
          html: postRentalThankYouHtml({
            customerName: c.name ?? 'there',
            orderReference: (order.booking_token as string | null) ?? (order.id as string),
            vehicleName: i?.vehicle_name ?? 'Vehicle',
            rentalDays,
            totalPaid: Number(order.final_total) || 0,
            pickupDatetime: i?.pickup_datetime ? formatManila(i.pickup_datetime) : '—',
            dropoffDatetime: i?.dropoff_datetime ? formatManila(i.dropoff_datetime) : '—',
            pawCardSavings,
            pawCardEstablishments,
            whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639XXXXXXXXX',
          }),
        });

        await sb.from('post_rental_email_log').insert({
          order_id: order.id,
          sent_at: now.toISOString(),
        });

        console.log(
          '[post-rental-email] Sent to:',
          c.email,
          'for order:',
          (order.booking_token as string | null) ?? order.id,
        );
      }
    } catch (err) {
      console.error('[post-rental-email] Job error:', err);
    }
  });

  console.log('[post-rental-email] Job scheduled (hourly at :30)');
}
