import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendTelegramAlert } from '../lib/telegram.js';

const router = Router();
router.use(authenticate);

const edit = requirePermission(Permission.EditSettings);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Calculate commission amount for a single booking row.
 * Uses rental_value_raw as the percentage base (excludes add-ons, fees, charity, card surcharge).
 * Falls back to web_quote_raw for legacy rows that pre-date migration 130.
 */
function calcCommission(
  row: { rental_value_raw: number | null; web_quote_raw: number | null; status: string },
  partner: { commission_type: string; commission_value: number },
): number {
  if (row.status === 'cancelled') return 0;
  if (partner.commission_type === 'fixed') return partner.commission_value;
  const base = row.rental_value_raw ?? row.web_quote_raw ?? 0;
  return Math.round(base * partner.commission_value / 100 * 100) / 100;
}

const PartnerBodySchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only').optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_whatsapp: z.string().max(50).nullable().optional(),
  commission_type: z.enum(['fixed', 'percentage']).optional(),
  commission_value: z.number().min(0).optional(),
  advance_booking_days: z.number().int().min(0).max(365).optional(),
  commission_includes_extensions: z.boolean().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  telegram_chat_id: z.string().max(100).nullable().optional(),
  store_id: z.string().min(1),
});

// ── GET / — list all partners for a store ────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId?: string };
    const sb = getSupabaseClient();

    let query = sb
      .from('accommodation_partners')
      .select('*')
      .order('name', { ascending: true });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch partners: ${error.message}`);

    res.json({ success: true, data: data ?? [] });
  } catch (err) { next(err); }
});

// ── POST / — create partner ───────────────────────────────────────────────────
router.post('/', edit, validateBody(PartnerBodySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof PartnerBodySchema>;
    const sb = getSupabaseClient();

    const rawSlug = body.slug ?? slugify(body.name);

    let slug = rawSlug;
    let attempt = 0;
    while (true) {
      const { count } = await sb
        .from('accommodation_partners')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', body.store_id)
        .eq('slug', slug);

      if ((count ?? 0) === 0) break;
      attempt++;
      slug = `${rawSlug}-${attempt}`;
    }

    const { data, error } = await sb
      .from('accommodation_partners')
      .insert({
        store_id: body.store_id,
        name: body.name,
        slug,
        contact_name: body.contact_name ?? null,
        contact_email: body.contact_email ?? null,
        contact_whatsapp: body.contact_whatsapp ?? null,
        commission_type: body.commission_type ?? 'fixed',
        commission_value: body.commission_value ?? 0,
        advance_booking_days: body.advance_booking_days ?? 7,
        commission_includes_extensions: body.commission_includes_extensions ?? false,
        active: body.active ?? true,
        notes: body.notes ?? null,
        telegram_chat_id: body.telegram_chat_id?.trim() || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create partner: ${error.message}`);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── PUT /:id — update partner ─────────────────────────────────────────────────
router.put('/:id', edit, validateBody(PartnerBodySchema.partial().extend({ store_id: z.string().optional() })), async (req, res, next) => {
  try {
    const body = req.body as Partial<z.infer<typeof PartnerBodySchema>>;
    const sb = getSupabaseClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.contact_name !== undefined) updates.contact_name = body.contact_name;
    if (body.contact_email !== undefined) updates.contact_email = body.contact_email;
    if (body.contact_whatsapp !== undefined) updates.contact_whatsapp = body.contact_whatsapp;
    if (body.commission_type !== undefined) updates.commission_type = body.commission_type;
    if (body.commission_value !== undefined) updates.commission_value = body.commission_value;
    if (body.advance_booking_days !== undefined) updates.advance_booking_days = body.advance_booking_days;
    if (body.commission_includes_extensions !== undefined) updates.commission_includes_extensions = body.commission_includes_extensions;
    if (body.active !== undefined) updates.active = body.active;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.telegram_chat_id !== undefined) updates.telegram_chat_id = body.telegram_chat_id?.trim() || null;

    const { data, error } = await sb
      .from('accommodation_partners')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update partner: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── DELETE /:id — soft-delete (set active = false) ───────────────────────────
router.delete('/:id', edit, async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('accommodation_partners')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw new Error(`Failed to deactivate partner: ${error.message}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /:id/stats — attribution stats for a single partner ──────────────────
router.get('/:id/stats', async (req, res, next) => {
  try {
    const { month } = req.query as { month?: string };
    const sb = getSupabaseClient();

    const { data: partner, error: partnerErr } = await sb
      .from('accommodation_partners')
      .select('id, slug, store_id, advance_booking_days, commission_type, commission_value, commission_includes_extensions')
      .eq('id', req.params.id)
      .single();

    if (partnerErr || !partner) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Partner not found' } });
      return;
    }

    const p = partner as {
      id: string; slug: string; store_id: string;
      advance_booking_days: number; commission_type: string; commission_value: number;
      commission_includes_extensions: boolean;
    };

    let rawQuery = sb
      .from('orders_raw')
      .select('id, order_reference, customer_name, pickup_datetime, dropoff_datetime, rental_value_raw, web_quote_raw, status, created_at')
      .eq('store_id', p.store_id)
      .eq('partner_ref', p.slug)
      .order('created_at', { ascending: false });

    if (month) {
      const [y, m] = month.split('-').map(Number);
      if (y && m) {
        const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
        const to = new Date(Date.UTC(y, m, 1)).toISOString();
        rawQuery = rawQuery.gte('created_at', from).lt('created_at', to);
      }
    }

    const { data: rawRows, error: rawErr } = await rawQuery;
    if (rawErr) throw new Error(`Failed to fetch attribution data: ${rawErr.message}`);

    const rows = (rawRows ?? []) as Array<{
      id: string;
      order_reference: string | null;
      customer_name: string | null;
      pickup_datetime: string | null;
      dropoff_datetime: string | null;
      rental_value_raw: number | null;
      web_quote_raw: number | null;
      status: string;
      created_at: string;
    }>;

    const bookings = rows.map((row) => {
      const advanceDays = row.pickup_datetime
        ? (new Date(row.pickup_datetime).getTime() - new Date(row.created_at).getTime()) / 86_400_000
        : null;

      const commissionable =
        row.status !== 'cancelled' &&
        advanceDays !== null &&
        advanceDays >= p.advance_booking_days;

      const commissionAmount = commissionable ? calcCommission(row, p) : 0;

      const commissionBase = p.commission_type === 'fixed'
        ? null
        : (row.rental_value_raw ?? row.web_quote_raw ?? 0);

      return {
        id: row.id,
        orderReference: row.order_reference,
        customerName: row.customer_name,
        pickupDatetime: row.pickup_datetime,
        dropoffDatetime: row.dropoff_datetime,
        rentalValue: row.rental_value_raw ?? 0,
        bookingValue: row.web_quote_raw ?? 0,
        commissionBase,
        status: row.status,
        bookedAt: row.created_at,
        advanceDays: advanceDays !== null ? Math.floor(advanceDays) : null,
        commissionable,
        commissionAmount,
      };
    });

    const totalBookings = bookings.length;
    const commissionableBookings = bookings.filter((b) => b.commissionable).length;
    const totalCommission = bookings.reduce((sum, b) => sum + b.commissionAmount, 0);

    res.json({
      success: true,
      data: {
        totalBookings,
        commissionableBookings,
        totalCommission: Math.round(totalCommission * 100) / 100,
        bookings,
      },
    });
  } catch (err) { next(err); }
});

// ── POST /:id/send-monthly-report — send Telegram report to partner ───────────
router.post('/:id/send-monthly-report', edit, async (req, res, next) => {
  try {
    const { month } = req.body as { month?: string };
    const sb = getSupabaseClient();

    const { data: partner, error: partnerErr } = await sb
      .from('accommodation_partners')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (partnerErr || !partner) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Partner not found' } });
      return;
    }

    const p = partner as {
      id: string; name: string; slug: string; store_id: string;
      advance_booking_days: number; commission_type: string; commission_value: number;
      commission_includes_extensions: boolean; telegram_chat_id: string | null;
    };

    if (!p.telegram_chat_id) {
      res.status(422).json({
        success: false,
        error: { code: 'NO_TELEGRAM', message: 'No Telegram chat ID configured for this partner.' },
      });
      return;
    }

    const reportMonth = month ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
    const [y, m] = reportMonth.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const to = new Date(Date.UTC(y, m, 1)).toISOString();

    const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-PH', {
      month: 'long', year: 'numeric',
    });

    const { data: rawRows, error: rawErr } = await sb
      .from('orders_raw')
      .select('id, pickup_datetime, rental_value_raw, web_quote_raw, status, created_at')
      .eq('store_id', p.store_id)
      .eq('partner_ref', p.slug)
      .gte('created_at', from)
      .lt('created_at', to);

    if (rawErr) throw new Error(rawErr.message);

    type RawRow = {
      id: string; pickup_datetime: string | null;
      rental_value_raw: number | null; web_quote_raw: number | null;
      status: string; created_at: string;
    };
    const rows = (rawRows ?? []) as RawRow[];

    let totalBookings = 0;
    let commissionableBookings = 0;
    let totalCommission = 0;

    for (const row of rows) {
      totalBookings++;
      const advanceDays = row.pickup_datetime
        ? (new Date(row.pickup_datetime).getTime() - new Date(row.created_at).getTime()) / 86_400_000
        : null;

      if (row.status !== 'cancelled' && advanceDays !== null && advanceDays >= p.advance_booking_days) {
        commissionableBookings++;
        totalCommission += calcCommission(row, p);
      }
    }

    totalCommission = Math.round(totalCommission * 100) / 100;

    const commissionDisplay = p.commission_type === 'fixed'
      ? `₱${p.commission_value.toLocaleString('en-PH')} per booking`
      : `${p.commission_value}% of rental value`;

    const lines = [
      `🏨 <b>Lola's Rentals — Partner Report</b>`,
      `Partner: <b>${p.name}</b>`,
      `Month: <b>${monthLabel}</b>`,
      ``,
      `📊 <b>Summary</b>`,
      `Total attributed bookings: <b>${totalBookings}</b>`,
      `Commissionable (≥ ${p.advance_booking_days} days advance): <b>${commissionableBookings}</b>`,
      ``,
      `💰 <b>Commission</b>`,
      `Rate: ${commissionDisplay}`,
      `<b>Total due: ₱${totalCommission.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</b>`,
      ``,
      `Commission applies to bookings made at least ${p.advance_booking_days} day${p.advance_booking_days !== 1 ? 's' : ''} before pickup. Same-day/walk-in referrals are acknowledged but not commissionable.`,
      ``,
      `Thank you for partnering with Lola's Rentals! 🛵`,
    ];

    await sendTelegramAlert(lines.join('\n'), p.telegram_chat_id);

    res.json({ success: true, data: { totalBookings, commissionableBookings, totalCommission } });
  } catch (err) { next(err); }
});

export { router as partnerRoutes };
