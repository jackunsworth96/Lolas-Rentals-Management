import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { hashPin } from '../adapters/auth/password.js';
import { sendEmail, INTERNAL_FROM_EMAIL, escapeHtml } from '../services/email.js';
import { getPartnerCommissionStats, getPartnerCommissionsDue } from '../lib/partner-commission.js';

const router = Router();
const PARTNER_LOGO_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_PARTNER_LOGO_BYTES = 5 * 1024 * 1024;

const partnerLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PARTNER_LOGO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (PARTNER_LOGO_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, GIF, WebP, SVG`));
    }
  },
});

// ── Slug helper ───────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function logoExtForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'png';
}

async function uniqueSlug(storeId: string, base: string): Promise<string> {
  const sb = getSupabaseClient();
  let slug = base;
  let attempt = 0;
  while (true) {
    const { count } = await sb
      .from('accommodation_partners')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('slug', slug);
    if ((count ?? 0) === 0) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS — no authentication, basic rate limiting.
// Mounted before the authenticate middleware so they remain reachable.
// ─────────────────────────────────────────────────────────────────────────────

const enrollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many enrolment submissions. Please try again later.' },
  },
});

const publicLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many lookups. Please slow down.' },
  },
});

// Public store id used for self-enrolment (Lola's Siargao).
// New partners go into the pending queue under this store.
const DEFAULT_ENROL_STORE_ID = 'store-lolas';

const PublicEnrollSchema = z.object({
  propertyName: z.string().min(1).max(200),
  propertyType: z.string().max(80).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  roomCount: z.coerce.number().int().min(0).max(10_000).optional().nullable(),
  contactName: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(50).optional().nullable(),
  telegramUsername: z.string().max(80).optional().nullable(),
  dealChoice: z.enum(['commission', 'discount', 'commission_delivery', 'discount_delivery']),
  preferredRate: z.coerce.number().min(0).max(100_000).optional().nullable(),
  motivations: z.array(z.string().max(120)).max(10).optional().nullable(),
});

router.post('/enroll', enrollLimiter, validateBody(PublicEnrollSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof PublicEnrollSchema>;
    const sb = getSupabaseClient();

    const dealType = body.dealChoice === 'discount' ? 'discount'
      : body.dealChoice === 'commission_delivery' ? 'commission_delivery'
      : body.dealChoice === 'discount_delivery' ? 'discount_delivery'
      : 'commission';
    const hasFreeDelivery = dealType === 'commission_delivery' || dealType === 'discount_delivery';
    const baseSlug = slugify(body.propertyName) || `partner-${Date.now().toString(36)}`;
    const slug = await uniqueSlug(DEFAULT_ENROL_STORE_ID, baseSlug);

    // Preferred rate captures the partner's requested commission % / discount %
    // until staff finalise the deal during approval.
    const numericRate = body.preferredRate != null ? Number(body.preferredRate) : 0;

    const insertPayload = {
      store_id: DEFAULT_ENROL_STORE_ID,
      name: body.propertyName.trim(),
      slug,
      contact_name: body.contactName.trim(),
      contact_email: body.email.trim(),
      contact_whatsapp: body.phone?.trim() || null,
      commission_type: 'percentage' as const,
      commission_value: (dealType === 'commission' || dealType === 'commission_delivery') ? numericRate : 0,
      advance_booking_days: 7,
      commission_includes_extensions: false,
      active: false,
      status: 'pending' as const,
      deal_type: dealType,
      discount_type: (dealType === 'discount' || dealType === 'discount_delivery') ? 'percentage' : null,
      discount_value: (dealType === 'discount' || dealType === 'discount_delivery') ? numericRate : null,
      free_delivery: hasFreeDelivery,
      advance_discount_days: null,
      notes: [
        body.propertyType ? `Type: ${body.propertyType}` : null,
        body.location ? `Location: ${body.location}` : null,
        body.roomCount ? `Rooms: ${body.roomCount}` : null,
        body.telegramUsername ? `Telegram: ${body.telegramUsername}` : null,
        body.motivations?.length ? `Motivations: ${body.motivations.join(', ')}` : null,
        `Submitted via /affiliates`,
      ].filter(Boolean).join('\n'),
      telegram_chat_id: null,
    };

    const { data, error } = await sb
      .from('accommodation_partners')
      .insert(insertPayload)
      .select('id, slug, deal_type, status')
      .single();

    if (error) throw new Error(`Failed to create partner: ${error.message}`);

    // Fire-and-forget Telegram alerts — ops channel for the team, feedback/action-required for owner review.
    const enrollAlertLines = [
      `🤝 <b>New Partner Application</b>`,
      `Property: <b>${body.propertyName}</b>${body.propertyType ? ` (${body.propertyType})` : ''}`,
      `Location: ${body.location ?? '—'}`,
      `Rooms: ${body.roomCount ?? '—'}`,
      `Contact: ${body.contactName} — ${body.email}${body.phone ? ` · ${body.phone}` : ''}`,
      `Choice: <b>${
        dealType === 'commission' ? 'Earn commission'
        : dealType === 'commission_delivery' ? 'Commission + free delivery'
        : dealType === 'discount_delivery' ? 'Discount + free delivery'
        : 'Discount for guests'
      }</b>`,
      `Preferred rate: ${numericRate ? `${numericRate}%` : '—'}`,
      `Telegram: ${body.telegramUsername ?? '—'}`,
      body.motivations?.length ? `Motivations: ${body.motivations.join(' · ')}` : null,
      ``,
      `⚠️ Action required — review in back office → /partners`,
    ].join('\n');

    void sendTelegramAlert(enrollAlertLines, getTelegramChatId('ops'));
    void sendTelegramAlert(enrollAlertLines, getTelegramChatId('feedback'));

    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

const PublicEnrollDetailsSchema = z.object({
  property_type: z.string().max(120).optional().nullable(),
  room_count: z.coerce.number().int().min(0).max(10_000).optional().nullable(),
  star_rating: z.string().max(20).optional().nullable(),
  guest_profile: z.string().max(120).optional().nullable(),
  avg_length_of_stay: z.string().max(80).optional().nullable(),
  monthly_occupancy_pct: z.coerce.number().int().min(0).max(100).optional().nullable(),
  existing_vehicle_provider: z.string().max(200).optional().nullable(),
  estimated_vehicles_per_month: z.coerce.number().int().min(0).max(10_000).optional().nullable(),
  peak_seasons: z.string().max(200).optional().nullable(),
  rental_type_preference: z.string().max(120).optional().nullable(),
  has_concierge: z.boolean().optional().nullable(),
  wants_printed_materials: z.boolean().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  motivations: z.string().max(1000).optional().nullable(),
});

router.post('/enroll/:id/details', enrollLimiter, validateBody(PublicEnrollDetailsSchema), async (req, res, next) => {
  try {
    const partnerId = req.params.id;
    const body = req.body as z.infer<typeof PublicEnrollDetailsSchema>;
    const sb = getSupabaseClient();

    const { data: partner, error: partnerErr } = await sb
      .from('accommodation_partners')
      .select('id, status')
      .eq('id', partnerId)
      .single();

    if (partnerErr || !partner) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Partner not found' } });
      return;
    }

    if ((partner as { status: string }).status !== 'pending') {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_REVIEWED', message: 'This application has already been reviewed.' },
      });
      return;
    }

    const upsertPayload = {
      partner_id: partnerId,
      property_type: body.property_type ?? null,
      room_count: body.room_count ?? null,
      star_rating: body.star_rating ?? null,
      guest_profile: body.guest_profile ?? null,
      avg_length_of_stay: body.avg_length_of_stay ?? null,
      monthly_occupancy_pct: body.monthly_occupancy_pct ?? null,
      existing_vehicle_provider: body.existing_vehicle_provider ?? null,
      estimated_vehicles_per_month: body.estimated_vehicles_per_month ?? null,
      peak_seasons: body.peak_seasons ?? null,
      rental_type_preference: body.rental_type_preference ?? null,
      has_concierge: body.has_concierge ?? null,
      wants_printed_materials: body.wants_printed_materials ?? null,
      notes: body.notes ?? null,
      motivations: body.motivations ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await sb
      .from('partner_enrollment_details')
      .upsert(upsertPayload, { onConflict: 'partner_id' })
      .select()
      .single();

    if (error) throw new Error(`Failed to save details: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/public/:slug', publicLookupLimiter, async (req, res, next) => {
  try {
    const slugParam = req.params.slug;
    const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
    if (!slug || slug.length > 80 || !/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SLUG', message: 'Invalid partner slug' },
      });
      return;
    }
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('accommodation_partners')
      .select('id, name, deal_type, discount_type, discount_value, free_delivery, free_delivery_location_ids, advance_booking_days, advance_discount_days, early_bird_days, early_bird_discount_value, status, active, logo_url, welcome_message, logo_display_width, logo_display_height')
      .or(`slug.eq.${slug},portal_subdomain.eq.${slug}`)
      .eq('status', 'active')
      .eq('active', true)
      .maybeSingle();

    if (error) throw new Error(`Lookup failed: ${error.message}`);
    if (!data) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Partner not found' },
      });
      return;
    }

    const row = data as {
      id: string;
      name: string;
      deal_type: 'commission' | 'discount' | 'free_delivery' | 'combined' | 'commission_delivery' | 'discount_delivery';
      discount_type: 'percentage' | 'fixed' | null;
      discount_value: number | null;
      free_delivery: boolean;
      free_delivery_location_ids: number[] | null;
      advance_booking_days: number | null;
      advance_discount_days: number | null;
      early_bird_days: number | null;
      early_bird_discount_value: number | null;
      logo_url: string | null;
      welcome_message: string | null;
      logo_display_width: number | null;
      logo_display_height: number | null;
    };

    // Fetch per-vehicle overrides — only guest-facing fields are exposed publicly
    const { data: vtRows } = await sb
      .from('partner_vehicle_terms')
      .select('vehicle_model_id, deal_type, discount_type, discount_value, free_delivery, advance_discount_days, early_bird_days, early_bird_discount_value')
      .eq('partner_id', row.id);

    type VtRow = {
      vehicle_model_id: string;
      deal_type: string;
      discount_type: string | null;
      discount_value: number | null;
      free_delivery: boolean;
      advance_discount_days: number | null;
      early_bird_days: number | null;
      early_bird_discount_value: number | null;
    };

    const vehicleTerms = (vtRows ?? []).map((vt: VtRow) => ({
      vehicleModelId: vt.vehicle_model_id,
      dealType: vt.deal_type,
      discountType: vt.discount_type ?? null,
      discountValue: vt.discount_value != null ? Number(vt.discount_value) : null,
      freeDelivery: vt.free_delivery,
      advanceDiscountDays: vt.advance_discount_days,
      earlyBirdDays: vt.early_bird_days,
      earlyBirdDiscountValue: vt.early_bird_discount_value != null ? Number(vt.early_bird_discount_value) : null,
    }));

    res.json({
      success: true,
      data: {
        name: row.name,
        dealType: row.deal_type,
        discountType: row.discount_type,
        discountValue: row.discount_value != null ? Number(row.discount_value) : null,
        freeDelivery: row.free_delivery,
        advanceBookingDays: row.advance_booking_days,
        advanceDiscountDays: row.advance_discount_days,
        earlyBirdDays: row.early_bird_days,
        earlyBirdDiscountValue: row.early_bird_discount_value != null ? Number(row.early_bird_discount_value) : null,
        freeDeliveryLocationIds: row.free_delivery_location_ids ?? null,
        logoUrl: row.logo_url ?? null,
        welcomeMessage: row.welcome_message ?? null,
        logoDisplayWidth: row.logo_display_width ?? null,
        logoDisplayHeight: row.logo_display_height ?? null,
        vehicleTerms,
      },
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED ENDPOINTS — staff back-office.
// ─────────────────────────────────────────────────────────────────────────────

router.use(authenticate);

const edit = requirePermission(Permission.EditSettings);

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
  status: z.enum(['active', 'pending', 'rejected']).optional(),
  deal_type: z.enum(['commission', 'discount', 'free_delivery', 'combined', 'commission_delivery', 'discount_delivery']).optional(),
  discount_type: z.enum(['percentage', 'fixed']).nullable().optional(),
  discount_value: z.number().min(0).nullable().optional(),
  free_delivery: z.boolean().optional(),
  advance_discount_days: z.number().int().min(0).max(365).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  telegram_chat_id: z.string().max(100).nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  welcome_message: z.string().max(500).nullable().optional(),
  logo_display_width: z.number().int().min(20).max(400).nullable().optional(),
  logo_display_height: z.number().int().min(16).max(200).nullable().optional(),
  early_bird_days: z.number().int().min(1).max(365).nullable().optional(),
  early_bird_discount_value: z.number().min(0).nullable().optional(),
  free_delivery_location_ids: z.array(z.number().int().positive()).nullable().optional(),
  portal_enabled: z.boolean().optional(),
  portal_subdomain: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).nullable().optional(),
  store_id: z.string().min(1),
});

// ── GET / — list all partners for a store ────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { storeId, status } = req.query as { storeId?: string; status?: string };
    const sb = getSupabaseClient();

    let query = sb
      .from('accommodation_partners')
      .select('*')
      .order('name', { ascending: true });

    if (storeId) query = query.eq('store_id', storeId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch partners: ${error.message}`);

    res.json({ success: true, data: data ?? [] });
  } catch (err) { next(err); }
});

// ── GET /commissions-due — consolidated monthly payout ledger ───────────────
router.get('/commissions-due', async (req, res, next) => {
  try {
    const { storeId, month } = req.query as { storeId?: string; month?: string };
    const reportMonth = month ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportMonth)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_MONTH', message: 'Month must use YYYY-MM format.' },
      });
      return;
    }

    const data = await getPartnerCommissionsDue(storeId, reportMonth);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /upload-logo — upload partner logo to Supabase Storage ──────────────
router.post('/upload-logo', edit, (req, res, next) => {
  partnerLogoUpload.single('file')(req, res, async (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'File too large. Maximum size is 5 MB.'
          : (err as Error).message || 'Upload failed';
      res.status(400).json({ success: false, error: { code: 'UPLOAD_ERROR', message } });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: { code: 'UPLOAD_ERROR', message: 'No file provided' } });
      return;
    }

    try {
      const sb = getSupabaseClient();
      const ext = logoExtForMime(req.file.mimetype);
      const objectPath = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadErr } = await sb.storage
        .from('partner-logos')
        .upload(objectPath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      const { data } = sb.storage.from('partner-logos').getPublicUrl(objectPath);
      res.json({ success: true, data: { url: data.publicUrl } });
    } catch (uploadError) {
      next(uploadError);
    }
  });
});

// ── GET /:id/enrollment-details — Step 2 details for a partner ───────────────
router.get('/:id/enrollment-details', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('partner_enrollment_details')
      .select('*')
      .eq('partner_id', req.params.id)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch enrolment details: ${error.message}`);
    res.json({ success: true, data: data ?? null });
  } catch (err) { next(err); }
});

// ── POST / — create partner ───────────────────────────────────────────────────
router.post('/', edit, validateBody(PartnerBodySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof PartnerBodySchema>;
    const sb = getSupabaseClient();

    const baseSlug = body.slug ?? slugify(body.name);
    const slug = await uniqueSlug(body.store_id, baseSlug);

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
        status: body.status ?? 'active',
        deal_type: body.deal_type ?? 'commission',
        discount_type: body.discount_type ?? null,
        discount_value: body.discount_value ?? null,
        free_delivery: body.free_delivery ?? false,
        advance_discount_days: body.advance_discount_days ?? null,
        notes: body.notes ?? null,
        telegram_chat_id: body.telegram_chat_id?.trim() || null,
        logo_url: body.logo_url?.trim() || null,
        welcome_message: body.welcome_message?.trim() || null,
        logo_display_width: body.logo_display_width ?? null,
        logo_display_height: body.logo_display_height ?? null,
        early_bird_days: body.early_bird_days ?? null,
        early_bird_discount_value: body.early_bird_discount_value ?? null,
        free_delivery_location_ids: body.free_delivery_location_ids ?? null,
        portal_enabled: body.portal_enabled ?? false,
        portal_subdomain: body.portal_subdomain?.trim() || slug,
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
    if (body.status !== undefined) updates.status = body.status;
    if (body.deal_type !== undefined) updates.deal_type = body.deal_type;
    if (body.discount_type !== undefined) updates.discount_type = body.discount_type;
    if (body.discount_value !== undefined) updates.discount_value = body.discount_value;
    if (body.free_delivery !== undefined) updates.free_delivery = body.free_delivery;
    if (body.advance_discount_days !== undefined) updates.advance_discount_days = body.advance_discount_days;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.telegram_chat_id !== undefined) updates.telegram_chat_id = body.telegram_chat_id?.trim() || null;
    if (body.logo_url !== undefined) updates.logo_url = body.logo_url?.trim() || null;
    if (body.welcome_message !== undefined) updates.welcome_message = body.welcome_message?.trim() || null;
    if (body.logo_display_width !== undefined) updates.logo_display_width = body.logo_display_width ?? null;
    if (body.logo_display_height !== undefined) updates.logo_display_height = body.logo_display_height ?? null;
    if (body.early_bird_days !== undefined) updates.early_bird_days = body.early_bird_days ?? null;
    if (body.early_bird_discount_value !== undefined) updates.early_bird_discount_value = body.early_bird_discount_value ?? null;
    if (body.free_delivery_location_ids !== undefined) updates.free_delivery_location_ids = body.free_delivery_location_ids ?? null;
    if (body.portal_enabled !== undefined) updates.portal_enabled = body.portal_enabled;
    if (body.portal_subdomain !== undefined) updates.portal_subdomain = body.portal_subdomain?.trim() || null;

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

// ── POST /:id/approve — approve a pending partner with final terms ───────────
const ApproveBodySchema = PartnerBodySchema.partial().omit({ store_id: true });

router.post('/:id/approve', edit, validateBody(ApproveBodySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof ApproveBodySchema>;
    const sb = getSupabaseClient();

    const { data: existing, error: fetchErr } = await sb
      .from('accommodation_partners')
      .select('id, name, slug, store_id, status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Partner not found' } });
      return;
    }

    const partner = existing as { id: string; name: string; slug: string; store_id: string; status: string };

    // Auto-generate a unique slug if the body did not supply one and the existing slug is missing/duplicated.
    let slug = body.slug ?? partner.slug;
    if (!slug) {
      slug = await uniqueSlug(partner.store_id, slugify(body.name ?? partner.name));
    }

    const updates: Record<string, unknown> = {
      status: 'active',
      active: true,
      slug,
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined) updates.name = body.name;
    if (body.contact_name !== undefined) updates.contact_name = body.contact_name;
    if (body.contact_email !== undefined) updates.contact_email = body.contact_email;
    if (body.contact_whatsapp !== undefined) updates.contact_whatsapp = body.contact_whatsapp;
    if (body.commission_type !== undefined) updates.commission_type = body.commission_type;
    if (body.commission_value !== undefined) updates.commission_value = body.commission_value;
    if (body.advance_booking_days !== undefined) updates.advance_booking_days = body.advance_booking_days;
    if (body.commission_includes_extensions !== undefined) updates.commission_includes_extensions = body.commission_includes_extensions;
    if (body.deal_type !== undefined) updates.deal_type = body.deal_type;
    if (body.discount_type !== undefined) updates.discount_type = body.discount_type;
    if (body.discount_value !== undefined) updates.discount_value = body.discount_value;
    if (body.free_delivery !== undefined) updates.free_delivery = body.free_delivery;
    if (body.advance_discount_days !== undefined) updates.advance_discount_days = body.advance_discount_days;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.telegram_chat_id !== undefined) updates.telegram_chat_id = body.telegram_chat_id?.trim() || null;
    if (body.logo_url !== undefined) updates.logo_url = body.logo_url?.trim() || null;
    if (body.welcome_message !== undefined) updates.welcome_message = body.welcome_message?.trim() || null;
    if (body.logo_display_width !== undefined) updates.logo_display_width = body.logo_display_width ?? null;
    if (body.logo_display_height !== undefined) updates.logo_display_height = body.logo_display_height ?? null;
    if (body.early_bird_days !== undefined) updates.early_bird_days = body.early_bird_days ?? null;
    if (body.early_bird_discount_value !== undefined) updates.early_bird_discount_value = body.early_bird_discount_value ?? null;
    if (body.free_delivery_location_ids !== undefined) updates.free_delivery_location_ids = body.free_delivery_location_ids ?? null;
    if (body.portal_enabled !== undefined) updates.portal_enabled = body.portal_enabled;
    if (body.portal_subdomain !== undefined) updates.portal_subdomain = body.portal_subdomain?.trim() || null;

    const { data, error } = await sb
      .from('accommodation_partners')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to approve partner: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /:id/reject — mark a pending partner rejected ───────────────────────
const RejectBodySchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

router.post('/:id/reject', edit, validateBody(RejectBodySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof RejectBodySchema>;
    const sb = getSupabaseClient();

    const { data: current } = await sb
      .from('accommodation_partners')
      .select('notes')
      .eq('id', req.params.id)
      .single();

    const existingNotes = (current as { notes: string | null } | null)?.notes ?? '';
    const rejectionLine = body.reason
      ? `\n\n[Rejected ${new Date().toISOString().slice(0, 10)}] ${body.reason}`
      : `\n\n[Rejected ${new Date().toISOString().slice(0, 10)}]`;

    const { error } = await sb
      .from('accommodation_partners')
      .update({
        status: 'rejected',
        active: false,
        notes: `${existingNotes}${rejectionLine}`.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);

    if (error) throw new Error(`Failed to reject partner: ${error.message}`);
    res.json({ success: true });
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
    const data = await getPartnerCommissionStats(req.params.id, month);
    res.json({ success: true, data });
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
      commission_includes_extensions: boolean; telegram_chat_id: string | null; contact_email: string | null;
    };

    if (!p.telegram_chat_id && !p.contact_email) {
      res.status(422).json({
        success: false,
        error: { code: 'NO_REPORT_DESTINATION', message: 'No Telegram chat ID or contact email configured for this partner.' },
      });
      return;
    }

    const reportMonth = month ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
    const [y, m] = reportMonth.split('-').map(Number);

    const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-PH', {
      month: 'long', year: 'numeric',
    });

    const stats = await getPartnerCommissionStats(p.id, reportMonth);
    const { totalBookings, commissionableBookings, totalCommission } = stats;

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

    if (p.telegram_chat_id) {
      await sendTelegramAlert(lines.join('\n'), p.telegram_chat_id);
    } else if (p.contact_email) {
      await sendEmail({
        to: p.contact_email,
        from: INTERNAL_FROM_EMAIL,
        subject: `Lola's Rentals Partner Report — ${monthLabel}`,
        html: [
          `<h2>Lola's Rentals Partner Report</h2>`,
          `<p><strong>Partner:</strong> ${escapeHtml(p.name)}</p>`,
          `<p><strong>Month:</strong> ${escapeHtml(monthLabel)}</p>`,
          `<p>Total attributed bookings: <strong>${totalBookings}</strong></p>`,
          `<p>Commissionable bookings: <strong>${commissionableBookings}</strong></p>`,
          `<p>Total due: <strong>₱${totalCommission.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</strong></p>`,
          `<p>Commission applies to bookings made at least ${p.advance_booking_days} day${p.advance_booking_days !== 1 ? 's' : ''} before pickup.</p>`,
        ].join('\n'),
      });
    }

    res.json({ success: true, data: { totalBookings, commissionableBookings, totalCommission } });
  } catch (err) { next(err); }
});

// ── Partner portal users ─────────────────────────────────────────────────────

const PartnerUserBodySchema = z.object({
  name: z.string().min(1).max(200),
  username: z.string().min(1).max(120),
  pin: z.coerce.string().min(4).max(120).optional(),
  is_active: z.boolean().optional(),
});

router.get('/:id/portal-users', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('partner_users')
      .select('id, partner_id, name, username, is_active, last_login_at, created_at, updated_at')
      .eq('partner_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch partner users: ${error.message}`);
    res.json({ success: true, data: data ?? [] });
  } catch (err) { next(err); }
});

router.post('/:id/portal-users', edit, validateBody(PartnerUserBodySchema.extend({ pin: z.coerce.string().min(4).max(120) })), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof PartnerUserBodySchema> & { pin: string };
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('partner_users')
      .insert({
        partner_id: req.params.id,
        name: body.name.trim(),
        username: body.username.trim(),
        pin_hash: await hashPin(body.pin),
        is_active: body.is_active ?? true,
      })
      .select('id, partner_id, name, username, is_active, last_login_at, created_at, updated_at')
      .single();
    if (error) throw new Error(`Failed to create partner user: ${error.message}`);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.put('/:id/portal-users/:userId', edit, validateBody(PartnerUserBodySchema.partial()), async (req, res, next) => {
  try {
    const body = req.body as Partial<z.infer<typeof PartnerUserBodySchema>>;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.username !== undefined) updates.username = body.username.trim();
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.pin !== undefined && body.pin.trim()) updates.pin_hash = await hashPin(body.pin);

    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('partner_users')
      .update(updates)
      .eq('id', req.params.userId)
      .eq('partner_id', req.params.id)
      .select('id, partner_id, name, username, is_active, last_login_at, created_at, updated_at')
      .single();
    if (error) throw new Error(`Failed to update partner user: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /vehicle-models — list all active vehicle models (for override dropdowns) ──
router.get('/vehicle-models', async (_req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('vehicle_models')
      .select('id, name, type')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw new Error(`Failed to fetch vehicle models: ${error.message}`);
    res.json({ success: true, data: data ?? [] });
  } catch (err) { next(err); }
});

// ── Vehicle term override schema ──────────────────────────────────────────────

const VehicleTermBodySchema = z.object({
  vehicle_model_id: z.string().min(1).max(80),
  deal_type: z.enum(['commission', 'discount', 'free_delivery', 'combined', 'commission_delivery', 'discount_delivery']),
  commission_type: z.enum(['fixed', 'percentage']).nullable().optional(),
  commission_value: z.number().min(0).nullable().optional(),
  advance_booking_days: z.number().int().min(0).max(365).nullable().optional(),
  commission_includes_extensions: z.boolean().optional(),
  discount_type: z.enum(['percentage', 'fixed']).nullable().optional(),
  discount_value: z.number().min(0).nullable().optional(),
  advance_discount_days: z.number().int().min(0).max(365).nullable().optional(),
  early_bird_days: z.number().int().min(1).max(365).nullable().optional(),
  early_bird_discount_value: z.number().min(0).nullable().optional(),
  free_delivery: z.boolean().optional(),
});

// ── GET /:id/vehicle-terms — list overrides for a partner ────────────────────
router.get('/:id/vehicle-terms', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('partner_vehicle_terms')
      .select('*')
      .eq('partner_id', req.params.id)
      .order('vehicle_model_id', { ascending: true });

    if (error) throw new Error(`Failed to fetch vehicle terms: ${error.message}`);
    res.json({ success: true, data: data ?? [] });
  } catch (err) { next(err); }
});

// ── POST /:id/vehicle-terms — create an override ──────────────────────────────
router.post('/:id/vehicle-terms', edit, validateBody(VehicleTermBodySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof VehicleTermBodySchema>;
    const sb = getSupabaseClient();

    const { data, error } = await sb
      .from('partner_vehicle_terms')
      .insert({
        partner_id: req.params.id,
        vehicle_model_id: body.vehicle_model_id,
        deal_type: body.deal_type,
        commission_type: body.commission_type ?? null,
        commission_value: body.commission_value ?? null,
        advance_booking_days: body.advance_booking_days ?? null,
        commission_includes_extensions: body.commission_includes_extensions ?? false,
        discount_type: body.discount_type ?? null,
        discount_value: body.discount_value ?? null,
        advance_discount_days: body.advance_discount_days ?? null,
        early_bird_days: body.early_bird_days ?? null,
        early_bird_discount_value: body.early_bird_discount_value ?? null,
        free_delivery: body.free_delivery ?? false,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create vehicle term: ${error.message}`);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── PUT /:id/vehicle-terms/:vtId — update an override ────────────────────────
router.put('/:id/vehicle-terms/:vtId', edit, validateBody(VehicleTermBodySchema.partial()), async (req, res, next) => {
  try {
    const body = req.body as Partial<z.infer<typeof VehicleTermBodySchema>>;
    const sb = getSupabaseClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.deal_type !== undefined) updates.deal_type = body.deal_type;
    if (body.commission_type !== undefined) updates.commission_type = body.commission_type;
    if (body.commission_value !== undefined) updates.commission_value = body.commission_value;
    if (body.advance_booking_days !== undefined) updates.advance_booking_days = body.advance_booking_days;
    if (body.commission_includes_extensions !== undefined) updates.commission_includes_extensions = body.commission_includes_extensions;
    if (body.discount_type !== undefined) updates.discount_type = body.discount_type;
    if (body.discount_value !== undefined) updates.discount_value = body.discount_value;
    if (body.advance_discount_days !== undefined) updates.advance_discount_days = body.advance_discount_days;
    if (body.early_bird_days !== undefined) updates.early_bird_days = body.early_bird_days;
    if (body.early_bird_discount_value !== undefined) updates.early_bird_discount_value = body.early_bird_discount_value;
    if (body.free_delivery !== undefined) updates.free_delivery = body.free_delivery;

    const { data, error } = await sb
      .from('partner_vehicle_terms')
      .update(updates)
      .eq('id', req.params.vtId)
      .eq('partner_id', req.params.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update vehicle term: ${error.message}`);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── DELETE /:id/vehicle-terms/:vtId — remove an override ─────────────────────
router.delete('/:id/vehicle-terms/:vtId', edit, async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('partner_vehicle_terms')
      .delete()
      .eq('id', req.params.vtId)
      .eq('partner_id', req.params.id);

    if (error) throw new Error(`Failed to delete vehicle term: ${error.message}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export { router as partnerRoutes };
