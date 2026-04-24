import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  LogMaintenanceRequestSchema,
  SaveMaintenanceRequestSchema,
  CompleteMaintenanceRequestSchema,
  MaintenanceQuerySchema,
} from '@lolas/shared';
import type { MaintenanceRecord } from '@lolas/domain';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendEmail, maintenanceLogHtml, escapeHtml, NOTIFICATION_EMAIL, INTERNAL_FROM_EMAIL } from '../services/email.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { formatManilaDateTime } from '../utils/manila-date.js';

function toDto(r: MaintenanceRecord) {
  return {
    id: r.id,
    assetId: r.assetId,
    vehicleName: r.vehicleName ?? null,
    status: r.status,
    downtimeTracked: r.downtimeTracked,
    downtimeStart: r.downtimeStart ?? null,
    downtimeEnd: r.downtimeEnd ?? null,
    totalDowntimeDays: r.totalDowntimeDays ?? null,
    issueDescription: r.issueDescription ?? null,
    workPerformed: r.workPerformed ?? null,
    partsReplaced: r.partsReplaced ?? null,
    partsCost: r.partsCost?.toNumber?.() ?? 0,
    laborCost: r.laborCost?.toNumber?.() ?? 0,
    totalCost: r.totalCost?.toNumber?.() ?? 0,
    paidFrom: r.paidFrom ?? null,
    mechanic: r.mechanic ?? null,
    odometer: r.odometer ?? null,
    nextServiceDue: r.nextServiceDue ?? null,
    nextServiceDueDate: r.nextServiceDueDate ?? null,
    opsNotes: r.opsNotes ?? null,
    employeeId: r.employeeId ?? null,
    storeId: r.storeId,
    createdAt: r.createdAt,
    expenseStatus: r.expenseStatus ?? 'paid',
  };
}

const router = Router();
router.use(authenticate);

router.get('/', requirePermission(Permission.ViewMaintenance), validateQuery(MaintenanceQuerySchema), async (req, res, next) => {
  try {
    const { storeId, status, vehicleId } = req.query as Record<string, string>;
    if (vehicleId) {
      const records = await req.app.locals.deps.maintenanceRepo.findByVehicle(vehicleId);
      res.json({ success: true, data: records.map(toDto) });
      return;
    }
    const records = await req.app.locals.deps.maintenanceRepo.findByStore(storeId, { status });
    res.json({ success: true, data: records.map(toDto) });
  } catch (err) { next(err); }
});

router.get('/:id', requirePermission(Permission.ViewMaintenance), async (req, res, next) => {
  try {
    const record = await req.app.locals.deps.maintenanceRepo.findById(req.params.id as string);
    if (!record) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Maintenance record not found' } }); return; }
    res.json({ success: true, data: toDto(record) });
  } catch (err) { next(err); }
});

router.post('/', requirePermission(Permission.EditMaintenance), validateBody(LogMaintenanceRequestSchema), async (req, res, next) => {
  try {
    const { logMaintenance } = await import('../use-cases/maintenance/log-maintenance.js');
    const result = await logMaintenance(req.body, {
      maintenance: req.app.locals.deps.maintenanceRepo,
      fleet: req.app.locals.deps.fleetRepo,
    });

    // Fire-and-forget tamper-evident maintenance log email + Maintenance channel alert.
    void (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: vehicle } = await sb
          .from('fleet')
          .select('plate_number, engine_number, chassis_number, model_id, store_id')
          .eq('id', result.assetId)
          .maybeSingle();

        const v = vehicle as {
          plate_number?: string;
          engine_number?: string;
          chassis_number?: string;
          model_id?: string | null;
          store_id?: string | null;
        } | null;

        // Resolve model name for the Telegram alert.
        let modelName = '—';
        if (v?.model_id) {
          const { data: mdl } = await sb
            .from('vehicle_models')
            .select('name')
            .eq('id', v.model_id)
            .maybeSingle();
          if (mdl && typeof (mdl as { name?: string }).name === 'string') {
            modelName = (mdl as { name: string }).name;
          }
        }

        const plate = v?.plate_number ?? result.assetId;
        const vehicleName = result.vehicleName ?? plate;
        const loggedBy = req.user?.username ?? 'unknown';
        const rawNotes = result.issueDescription ?? '';
        const truncatedNotes = rawNotes.length > 100 ? `${rawNotes.slice(0, 100)}…` : rawNotes;
        const storeLabel = v?.store_id ?? result.storeId;
        const statusLabel = result.status ?? 'Reported';
        const timestamp = formatManilaDateTime(new Date());

        void sendTelegramAlert(
          `🔩 <b>Maintenance Logged</b>\n` +
            `Vehicle: ${escapeHtml(vehicleName)} (${escapeHtml(modelName)}) — ${escapeHtml(plate)}\n` +
            `Issue: ${escapeHtml(truncatedNotes || '—')}\n` +
            `Status: ${escapeHtml(statusLabel)}\n` +
            `Logged by: ${escapeHtml(loggedBy)}\n` +
            `Store: ${escapeHtml(storeLabel)}\n` +
            `${escapeHtml(timestamp)}`,
          getTelegramChatId('maintenance'),
        );

        void sendEmail({
          to: NOTIFICATION_EMAIL,
          from: INTERNAL_FROM_EMAIL,
          subject: `🔧 Maintenance Logged — ${result.vehicleName ?? result.assetId}`,
          html: maintenanceLogHtml(
            {
              id: result.id,
              vehicleName: result.vehicleName ?? null,
              issueDescription: result.issueDescription ?? null,
              mechanic: result.mechanic ?? null,
              odometer: result.odometer ?? null,
              partsCost: result.partsCost?.toNumber?.() ?? 0,
              laborCost: result.laborCost?.toNumber?.() ?? 0,
              totalCost: result.totalCost?.toNumber?.() ?? 0,
              downtimeStart: result.downtimeStart ?? null,
              storeId: result.storeId,
              createdAt: result.createdAt,
            },
            {
              plateNumber: v?.plate_number ?? 'Not recorded',
              engineNumber: v?.engine_number ?? 'Not recorded',
              chassisNumber: v?.chassis_number ?? 'Not recorded',
            },
          ),
        });
      } catch (emailErr) {
        console.error('[maintenance] Email error:', emailErr);
      }
    })();

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/:id', requirePermission(Permission.EditMaintenance), validateBody(SaveMaintenanceRequestSchema), async (req, res, next) => {
  try {
    const { saveMaintenance } = await import('../use-cases/maintenance/save-maintenance.js');

    // Capture the previous status before saving so we can detect a change.
    const existing = await req.app.locals.deps.maintenanceRepo.findById(req.params.id as string);
    const previousStatus = existing?.status;

    const result = await saveMaintenance(req.params.id as string, req.body, {
      maintenance: req.app.locals.deps.maintenanceRepo,
      fleet: req.app.locals.deps.fleetRepo,
    });

    // Fire-and-forget Telegram alert only when the status actually changed.
    const newStatus = req.body.status as string | undefined;
    if (newStatus && newStatus !== previousStatus) {
      void (async () => {
        try {
          const sb = getSupabaseClient();
          const { data: vehicle } = await sb
            .from('fleet')
            .select('plate_number, model_id, store_id')
            .eq('id', result.assetId)
            .maybeSingle();

          const v = vehicle as {
            plate_number?: string;
            model_id?: string | null;
            store_id?: string | null;
          } | null;

          let modelName = '—';
          if (v?.model_id) {
            const { data: mdl } = await sb
              .from('vehicle_models')
              .select('name')
              .eq('id', v.model_id)
              .maybeSingle();
            if (mdl && typeof (mdl as { name?: string }).name === 'string') {
              modelName = (mdl as { name: string }).name;
            }
          }

          const plate = v?.plate_number ?? result.assetId;
          const vehicleName = result.vehicleName ?? plate;
          const updatedBy = req.user?.username ?? 'unknown';
          const storeLabel = v?.store_id ?? result.storeId;
          const timestamp = formatManilaDateTime(new Date());

          void sendTelegramAlert(
            `🔄 <b>Maintenance Status Updated</b>\n` +
              `Vehicle: ${escapeHtml(vehicleName)} (${escapeHtml(modelName)}) — ${escapeHtml(plate)}\n` +
              `Status: ${escapeHtml(previousStatus ?? '—')} → <b>${escapeHtml(newStatus)}</b>\n` +
              `Updated by: ${escapeHtml(updatedBy)}\n` +
              `Store: ${escapeHtml(storeLabel)}\n` +
              `${escapeHtml(timestamp)}`,
            getTelegramChatId('maintenance'),
          );
        } catch (tgErr) {
          console.error('[maintenance] Telegram status-update error:', tgErr);
        }
      })();
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.delete('/:id', requirePermission(Permission.EditMaintenance), async (req, res, next) => {
  try {
    const record = await req.app.locals.deps.maintenanceRepo.findById(req.params.id as string);
    if (!record) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Maintenance record not found' } }); return; }
    const { deleteMaintenanceExpenseRpc } = await import('../adapters/supabase/maintenance-expense-rpc.js');
    await deleteMaintenanceExpenseRpc(req.params.id as string);
    if (record.status === 'In Progress') {
      const vehicle = await req.app.locals.deps.fleetRepo.findById(record.assetId);
      if (vehicle && vehicle.canAutoUpdateStatus()) {
        await req.app.locals.deps.fleetRepo.updateStatus(vehicle.id, 'Available');
      }
    }
    await req.app.locals.deps.maintenanceRepo.deleteById(req.params.id as string);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/complete', requirePermission(Permission.EditMaintenance), validateBody(CompleteMaintenanceRequestSchema), async (req, res, next) => {
  try {
    const { completeMaintenance } = await import('../use-cases/maintenance/complete-maintenance.js');
    const result = await completeMaintenance(
      { ...req.body, maintenanceId: req.params.id as string },
      {
        maintenance: req.app.locals.deps.maintenanceRepo,
        fleet: req.app.locals.deps.fleetRepo,
      },
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export { router as maintenanceRoutes };
