import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { logMaintenance } from '../use-cases/maintenance/log-maintenance.js';
import { sendEmail, inspectionLogHtml } from '../services/email.js';

const router = Router();

const ITEM_TYPES = [
  'accepted_issue',
  'accepted_issue_qty',
  'accepted_issue_na',
  'accepted_issue_declined',
] as const;

const CreateInspectionBodySchema = z.object({
  orderId: z.string().min(1),
  orderReference: z.string().min(1),
  storeId: z.string().min(1),
  vehicleId: z.string().optional(),
  vehicleName: z.string().optional(),
  kmReading: z.string().optional(),
  damageNotes: z.string().optional(),
  helmetNumbers: z.string().optional(),
  customerSignatureUrl: z.string().optional(),
  results: z.array(
    z.object({
      inspectionItemId: z.string().uuid().optional(),
      itemName: z.string().min(1),
      result: z.enum(['accepted', 'issue_noted', 'na', 'declined']),
      qty: z.number().int().optional(),
      notes: z.string().optional(),
      logMaintenance: z.boolean().default(false),
    }),
  ),
});

const CreateInspectionItemBodySchema = z.object({
  name: z.string().min(1),
  itemType: z.enum(ITEM_TYPES),
  sortOrder: z.number().int(),
  storeId: z.string().min(1).optional().nullable(),
  vehicleType: z.enum(['all', 'scooter', 'tuktuk']).default('all'),
});

const UpdateInspectionItemBodySchema = z.object({
  name: z.string().min(1).optional(),
  itemType: z.enum(ITEM_TYPES).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  vehicleType: z.enum(['all', 'scooter', 'tuktuk']).optional(),
});

function toInspectionItemDto(row: Record<string, unknown>) {
  const vt = row.vehicle_type;
  const vehicleType =
    vt === 'scooter' || vt === 'tuktuk' || vt === 'all' ? vt : 'all';
  return {
    id: row.id,
    storeId: row.store_id ?? null,
    name: row.name,
    itemType: row.item_type,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    vehicleType,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInspectionDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    orderId: row.order_id ?? null,
    orderReference: row.order_reference,
    storeId: row.store_id,
    vehicleId: row.vehicle_id ?? null,
    vehicleName: row.vehicle_name ?? null,
    employeeId: row.employee_id ?? null,
    kmReading: row.km_reading ?? null,
    damageNotes: row.damage_notes ?? null,
    helmetNumbers: row.helmet_numbers ?? null,
    customerSignatureUrl: row.customer_signature_url ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseOdometer(kmReading: string | undefined): number | null {
  if (kmReading == null || kmReading.trim() === '') return null;
  const n = Number.parseFloat(kmReading.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

router.get(
  '/items/all',
  requirePermission(Permission.EditSettings),
  async (req, res, next) => {
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from('inspection_items')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      res.json({ success: true, data: (data ?? []).map(toInspectionItemDto) });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/items', requirePermission(Permission.ViewOrders), async (req, res, next) => {
  try {
    const primaryStore = req.user?.storeIds?.[0];
    if (!primaryStore) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'No store assigned to user' },
      });
      return;
    }
    const vehicleType = req.query.vehicleType as string | undefined;
    const sb = getSupabaseClient();
    let query = sb
      .from('inspection_items')
      .select('*')
      .eq('is_active', true)
      .or(`store_id.is.null,store_id.eq.${primaryStore}`)
      .order('sort_order', { ascending: true });

    if (vehicleType === 'tuktuk') {
      query = query.in('vehicle_type', ['all', 'tuktuk']);
    } else {
      query = query.in('vehicle_type', ['all', 'scooter']);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json({ success: true, data: (data ?? []).map(toInspectionItemDto) });
  } catch (err) {
    next(err);
  }
});

router.get('/order/:orderId', requirePermission(Permission.ViewOrders), async (req, res, next) => {
  try {
    const orderId = req.params.orderId as string;
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('inspections')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    res.json({
      success: true,
      data: {
        exists: !!data,
        inspection: data ? toInspectionDto(data as Record<string, unknown>) : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission(Permission.EditOrders),
  validateBody(CreateInspectionBodySchema),
  async (req, res, next) => {
    const body = req.body as z.infer<typeof CreateInspectionBodySchema>;
    const userStoreIds = req.user?.storeIds ?? [];
    if (!userStoreIds.includes(body.storeId)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Store not allowed for this user' },
      });
      return;
    }

    const sb = getSupabaseClient();
    const maintenanceRepo = req.app.locals.deps.maintenanceRepo;
    const fleetRepo = req.app.locals.deps.fleetRepo;

    let inspectionId: string | null = null;
    const createdMaintenanceIds: string[] = [];

    try {
      const { data: existing, error: exErr } = await sb
        .from('inspections')
        .select('id')
        .eq('order_id', body.orderId)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (existing) {
        res.status(409).json({
          success: false,
          error: { code: 'CONFLICT', message: 'Inspection already exists for this order' },
        });
        return;
      }

      const inspectionRow = {
        order_id: body.orderId,
        order_reference: body.orderReference,
        store_id: body.storeId,
        vehicle_id: body.vehicleId ?? null,
        vehicle_name: body.vehicleName ?? null,
        employee_id: req.user?.employeeId ?? null,
        km_reading: body.kmReading ?? null,
        damage_notes: body.damageNotes ?? null,
        helmet_numbers: body.helmetNumbers ?? null,
        customer_signature_url: body.customerSignatureUrl ?? null,
        status: 'completed',
      };

      const { data: inspection, error: insErr } = await sb
        .from('inspections')
        .insert(inspectionRow)
        .select('id')
        .single();
      if (insErr) throw new Error(insErr.message);
      inspectionId = inspection!.id as string;

      const resultRows = body.results.map((r) => ({
        inspection_id: inspectionId,
        inspection_item_id: r.inspectionItemId ?? null,
        item_name: r.itemName,
        result: r.result,
        qty: r.qty ?? null,
        notes: r.notes ?? null,
        log_maintenance: r.logMaintenance,
      }));

      if (resultRows.length > 0) {
        const { error: resErr } = await sb.from('inspection_results').insert(resultRows);
        if (resErr) throw new Error(resErr.message);
      }

      const kmNum = parseInt(body.kmReading ?? '', 10);
      if (body.vehicleId && !Number.isNaN(kmNum) && kmNum > 0) {
        const { error: fleetOdoErr } = await sb
          .from('fleet')
          .update({
            current_mileage: kmNum,
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.vehicleId);
        if (fleetOdoErr) throw new Error(fleetOdoErr.message);
      }

      const odometer = parseOdometer(body.kmReading);
      for (const r of body.results) {
        if (!r.logMaintenance || !body.vehicleId) continue;
        const record = await logMaintenance(
          {
            assetId: body.vehicleId,
            issueDescription: `${r.itemName}: ${r.result}${r.notes ? ` — ${r.notes}` : ''}`,
            mechanic: null,
            odometer,
            employeeId: req.user?.employeeId ?? null,
            storeId: body.storeId,
            downtimeStart: null,
            notes: `Auto-logged from inspection ${body.orderReference}`,
            partsCost: 0,
            laborCost: 0,
          },
          { maintenance: maintenanceRepo, fleet: fleetRepo },
        );
        createdMaintenanceIds.push(record.id);
      }

      res.status(201).json({ success: true, data: { inspectionId } });

      const INSPECTION_LOG_EMAIL =
        process.env.MAINTENANCE_LOG_EMAIL ?? process.env.NOTIFICATION_EMAIL;

      if (INSPECTION_LOG_EMAIL) {
        void (async () => {
          try {
            const loggedAt = new Date().toLocaleString('en-PH', {
              timeZone: 'Asia/Manila',
              dateStyle: 'medium',
              timeStyle: 'short',
            });

            let plateNumber = 'Not recorded';
            let engineNumber = 'Not recorded';
            let chassisNumber = 'Not recorded';

            if (body.vehicleId) {
              const { data: vehicle } = await sb
                .from('fleet')
                .select('plate_number, engine_number, chassis_number')
                .eq('id', body.vehicleId)
                .single();
              if (vehicle) {
                plateNumber = (vehicle as Record<string, unknown>).plate_number as string ?? 'Not recorded';
                engineNumber = (vehicle as Record<string, unknown>).engine_number as string ?? 'Not recorded';
                chassisNumber = (vehicle as Record<string, unknown>).chassis_number as string ?? 'Not recorded';
              }
            }

            const hashContent = [
              inspectionId,
              body.orderReference,
              body.vehicleName ?? '',
              plateNumber,
              loggedAt,
              String(body.results.length),
            ].join('|');

            const contentHash = crypto
              .createHash('sha256')
              .update(hashContent)
              .digest('hex')
              .toUpperCase()
              .slice(0, 32);

            await sendEmail({
              to: INSPECTION_LOG_EMAIL,
              subject: `🔍 Inspection — ${body.vehicleName ?? 'Vehicle'} — ${body.orderReference} — ${loggedAt}`,
              html: inspectionLogHtml({
                inspectionId,
                orderReference: body.orderReference,
                vehicleName: body.vehicleName ?? 'Unknown',
                plateNumber,
                engineNumber,
                chassisNumber,
                kmReading: body.kmReading ?? undefined,
                damageNotes: body.damageNotes ?? undefined,
                helmetNumbers: body.helmetNumbers ?? undefined,
                hasCustomerSignature: !!(body.customerSignatureUrl),
                storeId: body.storeId,
                loggedAt,
                results: body.results.map((r) => ({
                  itemName: r.itemName,
                  result: r.result,
                  qty: r.qty ?? undefined,
                  notes: r.notes ?? undefined,
                })),
                contentHash,
              }),
            });

            console.log('[inspection-log] Email sent for:', body.orderReference);
          } catch (err) {
            console.error('[inspection-log] Email failed:', err);
          }
        })();
      }
    } catch (err) {
      if (inspectionId) {
        await sb.from('inspections').delete().eq('id', inspectionId);
      }
      for (const id of createdMaintenanceIds) {
        try {
          await maintenanceRepo.deleteById(id);
        } catch {
          /* best-effort rollback */
        }
      }
      next(err);
    }
  },
);

router.post(
  '/items',
  requirePermission(Permission.EditSettings),
  validateBody(CreateInspectionItemBodySchema),
  async (req, res, next) => {
    try {
      const b = req.body as z.infer<typeof CreateInspectionItemBodySchema>;
      const sb = getSupabaseClient();
      const row = {
        name: b.name,
        item_type: b.itemType,
        sort_order: b.sortOrder,
        store_id: b.storeId ?? null,
        is_active: true,
        vehicle_type: b.vehicleType,
      };
      const { data, error } = await sb.from('inspection_items').insert(row).select('*').single();
      if (error) throw new Error(error.message);
      res.status(201).json({ success: true, data: toInspectionItemDto(data as Record<string, unknown>) });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/items/:id',
  requirePermission(Permission.EditSettings),
  validateBody(UpdateInspectionItemBodySchema),
  async (req, res, next) => {
    try {
      const b = req.body as z.infer<typeof UpdateInspectionItemBodySchema>;
      const patch: Record<string, unknown> = {};
      if (b.name !== undefined) patch.name = b.name;
      if (b.itemType !== undefined) patch.item_type = b.itemType;
      if (b.sortOrder !== undefined) patch.sort_order = b.sortOrder;
      if (b.isActive !== undefined) patch.is_active = b.isActive;
      if (b.vehicleType !== undefined) patch.vehicle_type = b.vehicleType;
      if (Object.keys(patch).length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No fields to update' },
        });
        return;
      }
      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from('inspection_items')
        .update(patch)
        .eq('id', req.params.id)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Inspection item not found' },
        });
        return;
      }
      res.json({ success: true, data: toInspectionItemDto(data as Record<string, unknown>) });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
