import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { escapeHtml } from '../services/email.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { formatManilaDateTime } from '../utils/manila-date.js';

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const ISSUE_TYPES = ['flat_tyre', 'flat_battery', 'engine_mechanical', 'electrical', 'other'] as const;
const RESOLUTION_TYPES = ['roadside_fix', 'vehicle_swap', 'towed', 'customer_continued', 'other'] as const;

const CreateBreakdownSchema = z.object({
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  vehicleId: z.string().min(1),
  customerId: z.string().nullable().optional(),
  breakdownAt: z.string().min(1),
  location: z.string().nullable().optional(),
  issueType: z.enum(ISSUE_TYPES),
  issueDetail: z.string().nullable().optional(),
  description: z.string().min(1),
  photoUrls: z.array(z.string()).default([]),
  additionalNotes: z.string().nullable().optional(),
  // Optional "already resolved at creation time" fields
  resolved: z.boolean().default(false),
  resolutionType: z.enum(RESOLUTION_TYPES).nullable().optional(),
  resolutionNotes: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
});

const ResolveBreakdownSchema = z.object({
  resolutionType: z.enum(RESOLUTION_TYPES),
  resolutionNotes: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(), // defaults to now() if omitted
});

const BREAKDOWN_SELECT = `
  id, store_id, order_id, vehicle_id, customer_id,
  breakdown_at, location, issue_type, issue_detail, description,
  status, resolution_type, resolution_notes, resolved_at,
  photo_urls, additional_notes,
  reported_by_employee_id, resolved_by_employee_id, created_at,
  fleet!vehicle_id(name, plate_number),
  orders!order_id(booking_token, customers!customer_id(name)),
  reporter:employees!reported_by_employee_id(full_name),
  resolver:employees!resolved_by_employee_id(full_name)
`;

type RawRow = Record<string, unknown>;

function toDto(r: RawRow) {
  const fleet = r.fleet as { name?: string; plate_number?: string } | null;
  const orders = r.orders as { booking_token?: string; customers?: { name?: string } | null } | null;
  const reporter = r.reporter as { full_name?: string } | null;
  const resolver = r.resolver as { full_name?: string } | null;

  const breakdownAt = r.breakdown_at as string;
  const resolvedAt = r.resolved_at as string | null;
  const resolutionMinutes =
    resolvedAt != null
      ? Math.max(0, Math.round((new Date(resolvedAt).getTime() - new Date(breakdownAt).getTime()) / 60000))
      : null;

  return {
    id: r.id as string,
    storeId: r.store_id as string,
    orderId: r.order_id as string,
    vehicleId: r.vehicle_id as string,
    customerId: r.customer_id as string | null,
    breakdownAt,
    location: r.location as string | null,
    issueType: r.issue_type as string,
    issueDetail: r.issue_detail as string | null,
    description: r.description as string,
    status: r.status as string,
    resolutionType: r.resolution_type as string | null,
    resolutionNotes: r.resolution_notes as string | null,
    resolvedAt,
    resolutionMinutes,
    photoUrls: (r.photo_urls as string[]) ?? [],
    additionalNotes: r.additional_notes as string | null,
    reportedByEmployeeId: r.reported_by_employee_id as string | null,
    resolvedByEmployeeId: r.resolved_by_employee_id as string | null,
    createdAt: r.created_at as string,
    fleet: fleet ? { name: fleet.name ?? '—', plateNumber: fleet.plate_number ?? '' } : null,
    orderReference: orders?.booking_token ?? null,
    customerName: orders?.customers?.name ?? null,
    reportedByName: reporter?.full_name ?? null,
    resolvedByName: resolver?.full_name ?? null,
  };
}

const ISSUE_TYPE_LABEL: Record<string, string> = {
  flat_tyre: 'Flat tyre',
  flat_battery: 'Flat / dead battery',
  engine_mechanical: 'Engine / mechanical issue',
  electrical: 'Electrical fault',
  other: 'Other issue',
};

const router = Router();
router.use(authenticate);

router.get('/', requirePermission(Permission.ViewFleet), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { storeId, vehicleId, orderId, status } = req.query as Record<string, string | undefined>;

    let query = sb
      .from('breakdown_reports')
      .select(BREAKDOWN_SELECT)
      .order('breakdown_at', { ascending: false });

    if (storeId) query = query.eq('store_id', storeId);
    if (vehicleId) query = query.eq('vehicle_id', vehicleId);
    if (orderId) query = query.eq('order_id', orderId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, data: (data ?? []).map((r) => toDto(r as RawRow)) });
  } catch (err) { next(err); }
});

router.get('/:id', requirePermission(Permission.ViewFleet), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('breakdown_reports')
      .select(BREAKDOWN_SELECT)
      .eq('id', req.params.id as string)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Breakdown report not found' } });
      return;
    }

    res.json({ success: true, data: toDto(data as RawRow) });
  } catch (err) { next(err); }
});

router.post('/', requirePermission(Permission.EditFleet), async (req, res, next) => {
  try {
    const parsed = CreateBreakdownSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    const body = parsed.data;

    if (body.issueType === 'other' && !body.issueDetail?.trim()) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'issueDetail is required when issueType is "other"' } });
      return;
    }
    if (body.resolved && !body.resolutionType) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'resolutionType is required when marking as already resolved' } });
      return;
    }

    const sb = getSupabaseClient();
    const resolvedAt = body.resolved ? (body.resolvedAt ?? new Date().toISOString()) : null;

    const { data: report, error: insertErr } = await sb
      .from('breakdown_reports')
      .insert({
        store_id: body.storeId,
        order_id: body.orderId,
        vehicle_id: body.vehicleId,
        customer_id: body.customerId ?? null,
        breakdown_at: body.breakdownAt,
        location: body.location ?? null,
        issue_type: body.issueType,
        issue_detail: body.issueDetail ?? null,
        description: body.description,
        status: body.resolved ? 'resolved' : 'open',
        resolution_type: body.resolved ? body.resolutionType : null,
        resolution_notes: body.resolved ? (body.resolutionNotes ?? null) : null,
        resolved_at: resolvedAt,
        photo_urls: body.photoUrls,
        additional_notes: body.additionalNotes ?? null,
        reported_by_employee_id: req.user?.employeeId ?? null,
        resolved_by_employee_id: body.resolved ? (req.user?.employeeId ?? null) : null,
      })
      .select()
      .single();

    if (insertErr || !report) throw insertErr ?? new Error('Insert failed');

    const r = report as Record<string, unknown>;

    // Fire-and-forget: Telegram alert to the fleet channel so ops can respond quickly.
    void (async () => {
      try {
        const createdAt = formatManilaDateTime(new Date(r.created_at as string));

        const { data: vehicle } = await sb
          .from('fleet')
          .select('name, plate_number')
          .eq('id', body.vehicleId)
          .maybeSingle();
        const v = vehicle as { name?: string; plate_number?: string } | null;
        const vehicleName = v?.name ?? body.vehicleId;
        const plateNumber = v?.plate_number ?? 'Not recorded';

        const { data: order } = await sb
          .from('orders')
          .select('booking_token, customer_id, customers!customer_id(name)')
          .eq('id', body.orderId)
          .maybeSingle();
        const orderInfo = order as { booking_token?: string; customers?: { name?: string } | null } | null;
        const orderReference = orderInfo?.booking_token ?? body.orderId;
        const customerName = orderInfo?.customers?.name ?? '—';

        let reportedByName: string | null = null;
        if (req.user?.employeeId) {
          const { data: emp } = await sb
            .from('employees')
            .select('full_name')
            .eq('id', req.user.employeeId)
            .maybeSingle();
          if (emp && typeof (emp as { full_name?: string }).full_name === 'string') {
            reportedByName = (emp as { full_name: string }).full_name;
          }
        }

        const breakdownAtFormatted = new Date(body.breakdownAt).toLocaleString('en-PH', {
          timeZone: 'Asia/Manila',
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        void sendTelegramAlert(
          `🛠️ <b>Breakdown Reported</b>\n` +
          `Issue: ${escapeHtml(ISSUE_TYPE_LABEL[body.issueType] ?? body.issueType)}${body.issueDetail ? ` — ${escapeHtml(body.issueDetail)}` : ''}\n` +
          `Vehicle: ${escapeHtml(vehicleName)} — ${escapeHtml(plateNumber)}\n` +
          `Order: ${escapeHtml(orderReference)}\n` +
          `Customer: ${escapeHtml(customerName)}\n` +
          `Status: ${body.resolved ? '✅ Already resolved' : '🔴 Open — needs response'}\n` +
          `Reported by: ${escapeHtml(reportedByName ?? req.user?.username ?? 'unknown')}\n` +
          `${escapeHtml(breakdownAtFormatted)} (logged ${escapeHtml(createdAt)})`,
          getTelegramChatId('fleet'),
        );
      } catch (err) {
        console.error('[breakdowns] Post-creation Telegram alert failed:', err);
      }
    })();

    res.status(201).json({ success: true, data: toDto(r) });
  } catch (err) { next(err); }
});

router.patch('/:id/resolve', requirePermission(Permission.EditFleet), async (req, res, next) => {
  try {
    const parsed = ResolveBreakdownSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    const body = parsed.data;
    const sb = getSupabaseClient();

    const { data: updated, error } = await sb
      .from('breakdown_reports')
      .update({
        status: 'resolved',
        resolution_type: body.resolutionType,
        resolution_notes: body.resolutionNotes ?? null,
        resolved_at: body.resolvedAt ?? new Date().toISOString(),
        resolved_by_employee_id: req.user?.employeeId ?? null,
      })
      .eq('id', req.params.id as string)
      .select()
      .single();

    if (error || !updated) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Breakdown report not found' } });
      return;
    }

    res.json({ success: true, data: toDto(updated as RawRow) });
  } catch (err) { next(err); }
});

// Photo upload — stores to Supabase Storage 'breakdown-photos' bucket, returns signed URL
router.post('/upload-photo', requirePermission(Permission.EditFleet), (req, res, next) => {
  photoUpload.single('file')(req, res, async (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'File too large. Maximum size is 10 MB.'
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
      const ts = Date.now();
      const ext = req.file.mimetype.split('/')[1] ?? 'jpg';
      const objectPath = `uploads/${ts}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadErr } = await sb.storage
        .from('breakdown-photos')
        .upload(objectPath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      const { data: signed, error: signErr } = await sb.storage
        .from('breakdown-photos')
        .createSignedUrl(objectPath, 60 * 60 * 24 * 365); // 1-year URL

      if (signErr || !signed?.signedUrl) {
        throw new Error(signErr?.message ?? 'Could not create signed URL');
      }

      res.json({ success: true, data: { url: signed.signedUrl } });
    } catch (uploadError) {
      next(uploadError);
    }
  });
});

export { router as breakdownRoutes };
