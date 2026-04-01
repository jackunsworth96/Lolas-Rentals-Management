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
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/:id', requirePermission(Permission.EditMaintenance), validateBody(SaveMaintenanceRequestSchema), async (req, res, next) => {
  try {
    const { saveMaintenance } = await import('../use-cases/maintenance/save-maintenance.js');
    const result = await saveMaintenance(req.params.id as string, req.body, {
      maintenance: req.app.locals.deps.maintenanceRepo,
      fleet: req.app.locals.deps.fleetRepo,
    });
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
