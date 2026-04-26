import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendEmail, escapeHtml, INTERNAL_FROM_EMAIL } from '../services/email.js';

const router = Router();
router.use(authenticate);

function toCustomerDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    email: row.email ?? null,
    mobile: row.mobile ?? null,
    totalSpent: Number(row.total_spent ?? 0),
    notes: row.notes ?? null,
    blacklisted: row.blacklisted ?? false,
  };
}

const ListQuerySchema = z.object({
  storeId: z.string().min(1),
  q: z.string().optional(),
});

const PatchBodySchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  mobile: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  blacklisted: z.boolean().optional(),
});

// GET /customers?storeId=&q=
router.get('/', validateQuery(ListQuerySchema), async (req, res, next) => {
  try {
    const { storeId, q = '' } = req.query as { storeId: string; q?: string };
    const customers = await req.app.locals.deps.customerRepo.search(storeId, q);
    res.json({ success: true, data: customers });
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const sb = getSupabaseClient();

    const customer = await req.app.locals.deps.customerRepo.findById(id);
    if (!customer) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
      return;
    }

    // Order history — last 20, most recent first
    const { data: orderRows, error: ordersErr } = await sb
      .from('orders')
      .select('id, store_id, order_date, status, final_total, balance_due, order_items(vehicle_name)')
      .eq('customer_id', id)
      .order('order_date', { ascending: false })
      .limit(20);

    if (ordersErr) throw new Error(`orders query failed: ${ordersErr.message}`);

    const orders = (orderRows ?? []).map((o) => {
      const items = Array.isArray(o.order_items) ? o.order_items : [];
      const vehicleNames = items
        .map((i: { vehicle_name?: string | null }) => i.vehicle_name ?? '')
        .filter(Boolean)
        .join(', ');
      return {
        id: o.id,
        storeId: o.store_id,
        orderDate: o.order_date,
        status: o.status,
        finalTotal: Number(o.final_total ?? 0),
        balanceDue: Number(o.balance_due ?? 0),
        vehicleNames: vehicleNames || '—',
      };
    });

    // Compute real totals across ALL orders (not just the 20 returned above).
    const { data: statsRows, error: statsErr } = await sb
      .from('orders')
      .select('final_total, status')
      .eq('customer_id', id);

    if (statsErr) throw new Error(`orders stats query failed: ${statsErr.message}`);

    const allOrders = statsRows ?? [];
    const totalBookings = allOrders.length;
    const totalSpent = allOrders
      .filter((o) => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + Number(o.final_total ?? 0), 0);

    // Paw Card savings
    let pawCardSavings = 0;
    let pawCardEntryCount = 0;
    if (customer.email) {
      const escaped = customer.email.replace(/[%_\\]/g, '\\$&');
      const { data: entries } = await sb
        .from('paw_card_entries')
        .select('amount_saved')
        .ilike('email', escaped);
      const list = entries ?? [];
      pawCardEntryCount = list.length;
      pawCardSavings = list.reduce(
        (sum, r) => sum + Number((r as { amount_saved?: unknown }).amount_saved ?? 0),
        0,
      );
    }

    res.json({
      success: true,
      data: {
        customer: { ...customer, totalSpent, totalBookings },
        orders,
        pawCard: {
          totalSaved: pawCardSavings,
          entryCount: pawCardEntryCount,
          hasPawCard: pawCardEntryCount > 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /customers/:id
router.patch('/:id', validateBody(PatchBodySchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const customerRepo = req.app.locals.deps.customerRepo;

    const existing = await customerRepo.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
      return;
    }

    const body = req.body as z.infer<typeof PatchBodySchema>;
    const updated = {
      ...existing,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.mobile !== undefined && { mobile: body.mobile }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.blacklisted !== undefined && { blacklisted: body.blacklisted }),
    };

    await customerRepo.save(updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /customers/lookup-or-create — finds a customer by email or creates one.
// Used by the pre-booking check-in flow so staff can capture waivers and
// inspections before a booking exists.
const LookupOrCreateBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  mobile: z.string().optional(),
  storeId: z.string().min(1),
});

router.post('/lookup-or-create', validateBody(LookupOrCreateBodySchema), async (req, res, next) => {
  try {
    const { email, name, mobile, storeId } = req.body as z.infer<typeof LookupOrCreateBodySchema>;
    const sb = getSupabaseClient();
    const normalizedEmail = email.toLowerCase().trim();

    const { data: existing, error: findErr } = await sb
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (findErr) throw new Error(findErr.message);

    if (existing) {
      res.json({ success: true, data: { customer: toCustomerDto(existing as Record<string, unknown>), isNew: false } });
      return;
    }

    const { data: created, error: insErr } = await sb
      .from('customers')
      .insert({
        id: crypto.randomUUID(),
        store_id: storeId,
        name: name.trim(),
        email: normalizedEmail,
        mobile: mobile?.trim() ?? null,
        total_spent: 0,
        blacklisted: false,
      })
      .select('*')
      .single();

    if (insErr) throw new Error(insErr.message);
    res.status(201).json({ success: true, data: { customer: toCustomerDto(created as Record<string, unknown>), isNew: true } });
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id/documents — full document timeline: all waivers and inspections
// for this customer, covering both new (customer_id) and legacy (via order) linking.
router.get('/:id/documents', async (req, res, next) => {
  try {
    const { id } = req.params;
    const sb = getSupabaseClient();

    // Load all order IDs and booking tokens for this customer so we can pull
    // legacy records that were linked to an order but not yet to customer_id.
    const { data: orderRefs, error: orderRefsErr } = await sb
      .from('orders')
      .select('id, booking_token')
      .eq('customer_id', id);

    if (orderRefsErr) throw new Error(orderRefsErr.message);

    const orderIds = (orderRefs ?? []).map((o) => (o as { id: string }).id).filter(Boolean);
    const bookingTokens = (orderRefs ?? [])
      .map((o) => (o as { booking_token?: string | null }).booking_token)
      .filter((t): t is string => !!t);

    // Waivers: direct customer_id link first, then legacy via order_reference.
    const [waiversByCustomerRes, waiversByOrderRes] = await Promise.all([
      sb
        .from('waivers')
        .select(
          'id, order_reference, customer_id, driver_name, driver_email, driver_mobile, agreed_at, licence_front_url, licence_back_url, driver_signature_url, passenger_signatures, status, created_at',
        )
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
      bookingTokens.length > 0
        ? sb
            .from('waivers')
            .select(
              'id, order_reference, customer_id, driver_name, driver_email, driver_mobile, agreed_at, licence_front_url, licence_back_url, driver_signature_url, passenger_signatures, status, created_at',
            )
            .in('order_reference', bookingTokens)
            .is('customer_id', null)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);

    if (waiversByCustomerRes.error) throw new Error(waiversByCustomerRes.error.message);
    if (waiversByOrderRes.error) throw new Error((waiversByOrderRes.error as { message: string }).message);

    const allWaivers = [
      ...(waiversByCustomerRes.data ?? []),
      ...(waiversByOrderRes.data ?? []),
    ] as Record<string, unknown>[];

    // Inspections: direct customer_id link first, then legacy via order_id.
    const [inspByCustomerRes, inspByOrderRes] = await Promise.all([
      sb
        .from('inspections')
        .select(
          'id, order_id, order_reference, customer_id, vehicle_name, km_reading, damage_notes, helmet_numbers, customer_signature_url, status, created_at, inspection_results(item_name, result, qty, notes, log_maintenance)',
        )
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
      orderIds.length > 0
        ? sb
            .from('inspections')
            .select(
              'id, order_id, order_reference, customer_id, vehicle_name, km_reading, damage_notes, helmet_numbers, customer_signature_url, status, created_at, inspection_results(item_name, result, qty, notes, log_maintenance)',
            )
            .in('order_id', orderIds)
            .is('customer_id', null)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);

    if (inspByCustomerRes.error) throw new Error(inspByCustomerRes.error.message);
    if (inspByOrderRes.error) throw new Error((inspByOrderRes.error as { message: string }).message);

    const allInspections = [
      ...(inspByCustomerRes.data ?? []),
      ...(inspByOrderRes.data ?? []),
    ] as Record<string, unknown>[];

    const waiverDtos = allWaivers.map((w) => ({
      id: w.id,
      type: 'waiver' as const,
      orderReference: w.order_reference ?? null,
      driverName: w.driver_name,
      driverEmail: w.driver_email ?? null,
      driverMobile: w.driver_mobile ?? null,
      agreedAt: w.agreed_at ?? null,
      licenceFrontUrl: w.licence_front_url ?? null,
      licenceBackUrl: w.licence_back_url ?? null,
      driverSignatureUrl: w.driver_signature_url ?? null,
      passengerSignatures: (w.passenger_signatures as string[] | null) ?? [],
      status: w.status,
      createdAt: w.created_at,
    }));

    const inspectionDtos = allInspections.map((i) => ({
      id: i.id,
      type: 'inspection' as const,
      orderReference: i.order_reference ?? null,
      orderId: i.order_id ?? null,
      vehicleName: i.vehicle_name ?? null,
      kmReading: i.km_reading ?? null,
      damageNotes: i.damage_notes ?? null,
      helmetNumbers: i.helmet_numbers ?? null,
      customerSignatureUrl: i.customer_signature_url ?? null,
      status: i.status,
      createdAt: i.created_at,
      results: ((i.inspection_results as Record<string, unknown>[] | null) ?? []).map((r) => ({
        itemName: r.item_name,
        result: r.result,
        qty: r.qty ?? null,
        notes: r.notes ?? null,
        logMaintenance: r.log_maintenance ?? false,
      })),
    }));

    // Merge and sort newest-first by createdAt.
    const allDocs = [...waiverDtos, ...inspectionDtos].sort((a, b) =>
      new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime(),
    );

    res.json({ success: true, data: allDocs });
  } catch (err) {
    next(err);
  }
});

// POST /customers/:id/documents/email — email a document summary to the customer.
const EmailDocBodySchema = z.object({
  type: z.enum(['waiver', 'inspection']),
  documentId: z.string().uuid(),
  recipientEmail: z.string().email().optional(),
});

router.post('/:id/documents/email', validateBody(EmailDocBodySchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, documentId, recipientEmail } = req.body as z.infer<typeof EmailDocBodySchema>;
    const sb = getSupabaseClient();

    // Resolve the recipient: explicit override, else customer's email on file.
    let toEmail = recipientEmail ?? null;
    if (!toEmail) {
      const { data: cust } = await sb
        .from('customers')
        .select('name, email')
        .eq('id', id)
        .maybeSingle();
      toEmail = (cust as { email?: string | null } | null)?.email ?? null;
    }

    if (!toEmail) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_RECIPIENT', message: 'No email address found for this customer. Provide recipientEmail in the request body.' },
      });
      return;
    }

    const sentAt = new Date().toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    if (type === 'waiver') {
      const { data: w, error: wErr } = await sb
        .from('waivers')
        .select('id, order_reference, driver_name, driver_email, driver_mobile, agreed_at, licence_front_url, licence_back_url, driver_signature_url, passenger_signatures, status')
        .eq('id', documentId)
        .maybeSingle();

      if (wErr) throw new Error(wErr.message);
      if (!w) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Waiver not found' } });
        return;
      }

      const waiver = w as Record<string, unknown>;
      const ref = (waiver.order_reference as string | null) ?? 'Pre-booking';
      const agreedDate = waiver.agreed_at
        ? new Date(waiver.agreed_at as string).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
        : '—';

      const sigBlock = waiver.driver_signature_url
        ? `<tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px;width:160px">Signature</td><td style="padding:12px 0;border-bottom:1px solid #eee"><img src="${escapeHtml(waiver.driver_signature_url as string)}" alt="Signature" style="max-width:280px;border:1px solid #ddd;border-radius:8px" /></td></tr>`
        : '';

      const licenceBlock = [
        waiver.licence_front_url ? `<a href="${escapeHtml(waiver.licence_front_url as string)}" style="display:inline-block;margin-right:8px;color:#0d9488;font-size:13px">Licence Front ↗</a>` : '',
        waiver.licence_back_url ? `<a href="${escapeHtml(waiver.licence_back_url as string)}" style="color:#0d9488;font-size:13px">Licence Back ↗</a>` : '',
      ].filter(Boolean).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
  <div style="background:#0d9488;padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:20px">Rental Waiver Record</h1>
    <p style="color:#ccfbf1;margin:6px 0 0;font-size:13px">Reference: ${escapeHtml(ref)}</p>
  </div>
  <div style="padding:32px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px;width:160px">Driver</td><td style="padding:12px 0;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(waiver.driver_name as string)}</td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px">Email</td><td style="padding:12px 0;border-bottom:1px solid #eee">${escapeHtml((waiver.driver_email as string | null) ?? '—')}</td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px">Mobile</td><td style="padding:12px 0;border-bottom:1px solid #eee">${escapeHtml((waiver.driver_mobile as string | null) ?? '—')}</td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px">Agreed At</td><td style="padding:12px 0;border-bottom:1px solid #eee">${escapeHtml(agreedDate)}</td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px">Status</td><td style="padding:12px 0;border-bottom:1px solid #eee"><span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600">${escapeHtml(waiver.status as string)}</span></td></tr>
      ${sigBlock}
      ${licenceBlock ? `<tr><td style="padding:12px 0;color:#666;font-size:13px">Licence Images</td><td style="padding:12px 0">${licenceBlock}</td></tr>` : ''}
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Sent from Lola's Rentals back office on ${escapeHtml(sentAt)}</p>
  </div>
</div>
</body></html>`;

      await sendEmail({
        to: toEmail,
        from: INTERNAL_FROM_EMAIL,
        subject: `Rental Waiver — ${ref} | Lola's Rentals`,
        html,
      });
    } else {
      const { data: insp, error: iErr } = await sb
        .from('inspections')
        .select('id, order_reference, vehicle_name, km_reading, damage_notes, helmet_numbers, customer_signature_url, status, created_at, inspection_results(item_name, result, qty, notes)')
        .eq('id', documentId)
        .maybeSingle();

      if (iErr) throw new Error(iErr.message);
      if (!insp) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Inspection not found' } });
        return;
      }

      const inspection = insp as Record<string, unknown>;
      const ref = (inspection.order_reference as string | null) ?? 'Pre-booking';
      const inspDate = new Date(inspection.created_at as string).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      const results = ((inspection.inspection_results as Record<string, unknown>[]) ?? []);
      const resultRows = results
        .map((r) => {
          const badge = r.result === 'accepted'
            ? '<span style="color:#065f46;font-weight:600">Accepted</span>'
            : r.result === 'issue_noted'
            ? '<span style="color:#92400e;font-weight:600">Issue Noted</span>'
            : '<span style="color:#6b7280;font-weight:600">' + escapeHtml(r.result as string) + '</span>';
          const notes = r.notes ? ` — <em>${escapeHtml(r.notes as string)}</em>` : '';
          return `<tr><td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;font-size:13px">${escapeHtml(r.item_name as string)}</td><td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;font-size:13px">${badge}${notes}</td></tr>`;
        })
        .join('');

      const sigBlock = inspection.customer_signature_url
        ? `<tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px;width:160px">Signature</td><td style="padding:12px 0;border-bottom:1px solid #eee"><img src="${escapeHtml(inspection.customer_signature_url as string)}" alt="Signature" style="max-width:280px;border:1px solid #ddd;border-radius:8px" /></td></tr>`
        : '';

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
  <div style="background:#0d9488;padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:20px">Vehicle Inspection Record</h1>
    <p style="color:#ccfbf1;margin:6px 0 0;font-size:13px">Reference: ${escapeHtml(ref)}</p>
  </div>
  <div style="padding:32px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px;width:160px">Vehicle</td><td style="padding:12px 0;border-bottom:1px solid #eee;font-weight:600">${escapeHtml((inspection.vehicle_name as string | null) ?? '—')}</td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px">KM Reading</td><td style="padding:12px 0;border-bottom:1px solid #eee">${escapeHtml((inspection.km_reading as string | null) ?? '—')}</td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px">Helmet Numbers</td><td style="padding:12px 0;border-bottom:1px solid #eee">${escapeHtml((inspection.helmet_numbers as string | null) ?? '—')}</td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px">Damage Notes</td><td style="padding:12px 0;border-bottom:1px solid #eee">${escapeHtml((inspection.damage_notes as string | null) ?? 'None noted')}</td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px">Inspected At</td><td style="padding:12px 0;border-bottom:1px solid #eee">${escapeHtml(inspDate)}</td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;font-size:13px">Status</td><td style="padding:12px 0;border-bottom:1px solid #eee"><span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600">${escapeHtml(inspection.status as string)}</span></td></tr>
      ${sigBlock}
    </table>
    ${results.length > 0 ? `
    <h3 style="margin:24px 0 12px;font-size:15px;color:#111">Checklist Results</h3>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#f9fafb"><th style="text-align:left;padding:8px 4px;font-size:12px;color:#6b7280">Item</th><th style="text-align:left;padding:8px 4px;font-size:12px;color:#6b7280">Result</th></tr>
      ${resultRows}
    </table>` : ''}
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Sent from Lola's Rentals back office on ${escapeHtml(sentAt)}</p>
  </div>
</div>
</body></html>`;

      await sendEmail({
        to: toEmail,
        from: INTERNAL_FROM_EMAIL,
        subject: `Vehicle Inspection Report — ${ref} | Lola's Rentals`,
        html,
      });
    }

    res.json({ success: true, data: { sent: true, to: toEmail } });
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id/pending-checkin — returns waivers and inspections captured
// for this customer before a booking was linked (order_reference / order_id is null).
router.get('/:id/pending-checkin', async (req, res, next) => {
  try {
    const { id } = req.params;
    const sb = getSupabaseClient();

    const [{ data: waivers, error: wErr }, { data: inspections, error: iErr }] = await Promise.all([
      sb
        .from('waivers')
        .select('id, driver_name, driver_email, status, created_at')
        .eq('customer_id', id)
        .is('order_reference', null)
        .order('created_at', { ascending: false }),
      sb
        .from('inspections')
        .select('id, vehicle_name, order_reference, status, created_at')
        .eq('customer_id', id)
        .is('order_id', null)
        .order('created_at', { ascending: false }),
    ]);

    if (wErr) throw new Error(wErr.message);
    if (iErr) throw new Error(iErr.message);

    res.json({ success: true, data: { waivers: waivers ?? [], inspections: inspections ?? [] } });
  } catch (err) {
    next(err);
  }
});

export { router as customerRoutes };
