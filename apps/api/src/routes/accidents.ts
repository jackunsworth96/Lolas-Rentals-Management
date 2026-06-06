import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import {
  sendEmail,
  accidentReportHtml,
  buildAccidentHash,
  NOTIFICATION_EMAIL,
  INTERNAL_FROM_EMAIL,
  escapeHtml,
} from '../services/email.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { formatManilaDateTime } from '../utils/manila-date.js';

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const CreateAccidentSchema = z.object({
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  vehicleId: z.string().min(1),
  customerId: z.string().nullable().optional(),
  accidentAt: z.string().min(1),
  location: z.string().nullable().optional(),
  description: z.string().min(1),
  damageDescription: z.string().nullable().optional(),
  customerInjured: z.boolean().default(false),
  injuryDescription: z.string().nullable().optional(),
  medicalAttention: z.boolean().default(false),
  emergencyServicesCalled: z.boolean().default(false),
  policeReportFiled: z.boolean().default(false),
  policeReportNumber: z.string().nullable().optional(),
  helmetsWorn: z.string().nullable().optional(),
  thirdPartyNotes: z.string().nullable().optional(),
  peaceOfMindActive: z.boolean().nullable().optional(),
  photoUrls: z.array(z.string()).default([]),
  customerSignatureUrl: z.string().nullable().optional(),
  additionalNotes: z.string().nullable().optional(),
});

const router = Router();
router.use(authenticate);

router.get('/', requirePermission(Permission.ViewFleet), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { storeId, vehicleId, orderId, status } = req.query as Record<string, string | undefined>;

    let query = sb
      .from('accident_reports')
      .select(`
        id, store_id, order_id, vehicle_id, customer_id,
        accident_at, location, description, damage_description,
        customer_injured, injury_description, medical_attention,
        emergency_services_called, police_report_filed, police_report_number,
        helmets_worn, third_party_notes, peace_of_mind_active,
        photo_urls, customer_signature_url, additional_notes,
        reported_by_employee_id, status, tamper_hash, hash_emailed_at, created_at,
        fleet!vehicle_id(name, plate_number),
        orders!order_id(booking_token, customers!customer_id(name)),
        employees!reported_by_employee_id(full_name)
      `)
      .order('created_at', { ascending: false });

    if (storeId) query = query.eq('store_id', storeId);
    if (vehicleId) query = query.eq('vehicle_id', vehicleId);
    if (orderId) query = query.eq('order_id', orderId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', requirePermission(Permission.ViewFleet), async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('accident_reports')
      .select(`
        id, store_id, order_id, vehicle_id, customer_id,
        accident_at, location, description, damage_description,
        customer_injured, injury_description, medical_attention,
        emergency_services_called, police_report_filed, police_report_number,
        helmets_worn, third_party_notes, peace_of_mind_active,
        photo_urls, customer_signature_url, additional_notes,
        reported_by_employee_id, status, tamper_hash, hash_emailed_at, created_at,
        fleet!vehicle_id(name, plate_number),
        orders!order_id(booking_token, customers!customer_id(name)),
        employees!reported_by_employee_id(full_name)
      `)
      .eq('id', req.params.id as string)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Accident report not found' } });
      return;
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', requirePermission(Permission.EditFleet), async (req, res, next) => {
  try {
    const parsed = CreateAccidentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
      return;
    }
    const body = parsed.data;
    const sb = getSupabaseClient();

    const { data: report, error: insertErr } = await sb
      .from('accident_reports')
      .insert({
        store_id: body.storeId,
        order_id: body.orderId,
        vehicle_id: body.vehicleId,
        customer_id: body.customerId ?? null,
        accident_at: body.accidentAt,
        location: body.location ?? null,
        description: body.description,
        damage_description: body.damageDescription ?? null,
        customer_injured: body.customerInjured,
        injury_description: body.injuryDescription ?? null,
        medical_attention: body.medicalAttention,
        emergency_services_called: body.emergencyServicesCalled,
        police_report_filed: body.policeReportFiled,
        police_report_number: body.policeReportNumber ?? null,
        helmets_worn: body.helmetsWorn ?? null,
        third_party_notes: body.thirdPartyNotes ?? null,
        peace_of_mind_active: body.peaceOfMindActive ?? null,
        photo_urls: body.photoUrls,
        customer_signature_url: body.customerSignatureUrl ?? null,
        additional_notes: body.additionalNotes ?? null,
        reported_by_employee_id: req.user?.employeeId ?? null,
        status: 'open',
      })
      .select()
      .single();

    if (insertErr || !report) throw insertErr ?? new Error('Insert failed');

    const r = report as Record<string, unknown>;

    // Fire-and-forget: compute hash, update record, send email + Telegram alert
    void (async () => {
      try {
        const createdAt = formatManilaDateTime(new Date(r.created_at as string));

        // Resolve vehicle details
        const { data: vehicle } = await sb
          .from('fleet')
          .select('name, plate_number, engine_number, chassis_number')
          .eq('id', body.vehicleId)
          .maybeSingle();
        const v = vehicle as { name?: string; plate_number?: string; engine_number?: string; chassis_number?: string } | null;
        const vehicleName = v?.name ?? body.vehicleId;
        const plateNumber = v?.plate_number ?? 'Not recorded';
        const engineNumber = v?.engine_number ?? 'Not recorded';
        const chassisNumber = v?.chassis_number ?? 'Not recorded';

        // Resolve order reference
        const { data: order } = await sb
          .from('orders')
          .select('booking_token')
          .eq('id', body.orderId)
          .maybeSingle();
        const orderReference = (order as { booking_token?: string } | null)?.booking_token ?? body.orderId;

        // Resolve customer name through the order's customer_id
        let customerName = '—';
        const { data: orderWithCustomer } = await sb
          .from('orders')
          .select('customer_id, customers!customer_id(name)')
          .eq('id', body.orderId)
          .maybeSingle();
        if (orderWithCustomer) {
          const oc = orderWithCustomer as { customers?: { name?: string } | null };
          customerName = oc.customers?.name ?? '—';
        }

        // Resolve reporter name
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

        const accidentAtFormatted = new Date(body.accidentAt).toLocaleString('en-PH', {
          timeZone: 'Asia/Manila',
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        const contentHash = buildAccidentHash({
          id: r.id as string,
          orderReference,
          vehicleName,
          plateNumber,
          accidentAt: body.accidentAt,
          createdAt,
        });

        // Write hash back to the row
        await sb
          .from('accident_reports')
          .update({ tamper_hash: contentHash, hash_emailed_at: new Date().toISOString() })
          .eq('id', r.id as string);

        // Send tamper-evident email
        void sendEmail({
          to: NOTIFICATION_EMAIL,
          from: INTERNAL_FROM_EMAIL,
          subject: `🚨 Accident Report — ${vehicleName} (${plateNumber}) — ${orderReference}`,
          html: accidentReportHtml({
            id: r.id as string,
            orderReference,
            vehicleName,
            plateNumber,
            engineNumber,
            chassisNumber,
            customerName,
            accidentAt: accidentAtFormatted,
            location: body.location ?? null,
            description: body.description,
            damageDescription: body.damageDescription ?? null,
            customerInjured: body.customerInjured,
            injuryDescription: body.injuryDescription ?? null,
            medicalAttention: body.medicalAttention,
            emergencyServicesCalled: body.emergencyServicesCalled,
            policeReportFiled: body.policeReportFiled,
            policeReportNumber: body.policeReportNumber ?? null,
            helmetsWorn: body.helmetsWorn ?? null,
            thirdPartyNotes: body.thirdPartyNotes ?? null,
            peaceOfMindActive: body.peaceOfMindActive ?? null,
            hasCustomerSignature: !!(body.customerSignatureUrl),
            photoCount: body.photoUrls.length,
            reportedByName,
            storeId: body.storeId,
            createdAt,
            contentHash,
          }),
        });

        // Send Telegram alert to fleet channel
        const injuryLine = body.customerInjured ? '⚠️ Customer injured' : 'No injuries reported';
        void sendTelegramAlert(
          `🚨 <b>Accident Report Filed</b>\n` +
          `Vehicle: ${escapeHtml(vehicleName)} — ${escapeHtml(plateNumber)}\n` +
          `Order: ${escapeHtml(orderReference)}\n` +
          `Customer: ${escapeHtml(customerName)}\n` +
          `${injuryLine}\n` +
          `Police report: ${body.policeReportFiled ? '✅ Filed' : 'Not filed'}\n` +
          `Reported by: ${escapeHtml(reportedByName ?? req.user?.username ?? 'unknown')}\n` +
          `${escapeHtml(createdAt)}`,
          getTelegramChatId('fleet'),
        );
      } catch (err) {
        console.error('[accidents] Post-creation tasks failed:', err);
      }
    })();

    res.status(201).json({ success: true, data: r });
  } catch (err) { next(err); }
});

// Only allow status transitions (open → closed). No field edits after creation.
router.patch('/:id/status', requirePermission(Permission.EditFleet), async (req, res, next) => {
  try {
    const { status } = req.body as { status?: unknown };
    if (status !== 'closed' && status !== 'open') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Status must be "open" or "closed"' } });
      return;
    }

    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('accident_reports')
      .update({ status })
      .eq('id', req.params.id as string)
      .select('id, status')
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Accident report not found' } });
      return;
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// Photo upload — stores to Supabase Storage 'accident-photos' bucket, returns signed URL
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
        .from('accident-photos')
        .upload(objectPath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      const { data: signed, error: signErr } = await sb.storage
        .from('accident-photos')
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

export { router as accidentRoutes };
