import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

function vehicleToDto(v: { id: string; name: string; storeId: string; modelId: string | null; plateNumber: string | null; gpsId: string | null; status: string; currentMileage: number; orcrExpiryDate: string | null; surfRack: boolean; [k: string]: unknown }) {
  return {
    id: v.id,
    name: v.name,
    storeId: v.storeId,
    modelId: v.modelId,
    plateNumber: v.plateNumber,
    gpsId: v.gpsId,
    status: v.status,
    currentMileage: v.currentMileage,
    orcrExpiryDate: v.orcrExpiryDate,
    surfRack: v.surfRack,
  };
}

function vehicleToFullDto(v: ReturnType<typeof vehicleToDto> & Record<string, unknown>) {
  const vv = v as Record<string, unknown>;
  return {
    ...vehicleToDto(v as Parameters<typeof vehicleToDto>[0]),
    owner: vv.owner ?? null,
    rentableStartDate: vv.rentableStartDate ?? null,
    registrationDate: vv.registrationDate ?? null,
    purchasePrice: vv.purchasePrice ?? null,
    purchaseDate: vv.purchaseDate ?? null,
    setUpCosts: vv.setUpCosts ?? 0,
    totalBikeCost: vv.totalBikeCost ?? 0,
    usefulLifeMonths: vv.usefulLifeMonths ?? null,
    salvageValue: vv.salvageValue ?? 0,
    accumulatedDepreciation: vv.accumulatedDepreciation ?? 0,
    bookValue: vv.bookValue ?? 0,
    dateSold: vv.dateSold ?? null,
    soldPrice: vv.soldPrice ?? null,
    profitLoss: vv.profitLoss ?? null,
  };
}

router.get('/', requirePermission(Permission.ViewFleet), validateQuery(z.object({ storeId: z.string().optional() })), async (req, res, next) => {
  try {
    const storeId = req.query.storeId as string | undefined;
    const vehicles = !storeId || storeId === 'all'
      ? await req.app.locals.deps.fleetRepo.findAll()
      : await req.app.locals.deps.fleetRepo.findByStore(storeId);
    const dtos = vehicles.map((v) => vehicleToDto(v));
    res.json({ success: true, data: dtos });
  } catch (err) { next(err); }
});

router.post('/sync', requirePermission(Permission.ViewFleet), async (req, res, next) => {
  try {
    const { syncFleetStatuses } = await import('../jobs/fleet-status-sync.js');
    await syncFleetStatuses();
    res.json({ success: true, data: { ok: true } });
  } catch (err) { next(err); }
});

router.get('/utilization', requirePermission(Permission.ViewFleet), validateQuery(z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.enum(['7d', '30d', '90d']).optional(),
  storeId: z.string().optional(),
})), async (req, res, next) => {
  try {
    const { getFleetUtilization } = await import('../use-cases/fleet/get-utilization.js');
    const { from, to, period, storeId } = req.query as { from?: string; to?: string; period?: string; storeId?: string };
    let fromDate: string;
    let toDate: string;
    const today = new Date().toISOString().slice(0, 10);
    if (from && to) {
      fromDate = from;
      toDate = to;
    } else if (period === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      fromDate = d.toISOString().slice(0, 10);
      toDate = today;
    } else if (period === '90d') {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      fromDate = d.toISOString().slice(0, 10);
      toDate = today;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      fromDate = d.toISOString().slice(0, 10);
      toDate = today;
    }
    const result = await getFleetUtilization(fromDate, toDate, storeId, true);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/', requirePermission(Permission.EditFleet), validateBody(z.object({
  name: z.string().min(1),
  modelId: z.string().nullable().optional(),
  plateNumber: z.string().nullable().optional(),
  storeId: z.string().min(1),
  gpsId: z.string().nullable().optional(),
  surfRack: z.boolean().optional(),
  rentableStartDate: z.string().nullable().optional(),
  registrationDate: z.string().nullable().optional(),
})), async (req, res, next) => {
  try {
    const { createVehicle } = await import('../use-cases/fleet/create-vehicle.js');
    const result = await createVehicle(
      { fleetRepo: req.app.locals.deps.fleetRepo },
      {
        name: req.body.name,
        modelId: req.body.modelId ?? null,
        plateNumber: req.body.plateNumber ?? null,
        storeId: req.body.storeId,
        gpsId: req.body.gpsId ?? null,
        surfRack: req.body.surfRack ?? false,
        rentableStartDate: req.body.rentableStartDate ?? null,
        registrationDate: req.body.registrationDate ?? null,
      },
    );
    res.status(201).json({ success: true, data: vehicleToDto(result) });
  } catch (err) { next(err); }
});

router.get('/:id', requirePermission(Permission.ViewFleet), async (req, res, next) => {
  try {
    const vehicle = await req.app.locals.deps.fleetRepo.findById(req.params.id);
    if (!vehicle) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } }); return; }
    const dto = vehicleToFullDto({
      ...vehicleToDto(vehicle),
      owner: vehicle.owner,
      rentableStartDate: vehicle.rentableStartDate,
      registrationDate: vehicle.registrationDate,
      purchasePrice: vehicle.purchasePrice,
      purchaseDate: vehicle.purchaseDate,
      setUpCosts: vehicle.setUpCosts,
      totalBikeCost: vehicle.totalBikeCost,
      usefulLifeMonths: vehicle.usefulLifeMonths,
      salvageValue: vehicle.salvageValue,
      accumulatedDepreciation: vehicle.accumulatedDepreciation,
      bookValue: vehicle.bookValue,
      dateSold: vehicle.dateSold,
      soldPrice: vehicle.soldPrice,
      profitLoss: vehicle.profitLoss,
    });
    res.json({ success: true, data: dto });
  } catch (err) { next(err); }
});

router.put('/:id', requirePermission(Permission.EditFleet), validateBody(z.object({
  name: z.string().optional(), plateNumber: z.string().nullable().optional(),
  gpsId: z.string().nullable().optional(), status: z.string().optional(),
  currentMileage: z.number().optional(), orcrExpiryDate: z.string().nullable().optional(),
  surfRack: z.boolean().optional(), owner: z.string().nullable().optional(),
  storeId: z.string().optional(), modelId: z.string().nullable().optional(),
})), async (req, res, next) => {
  try {
    const { updateVehicle } = await import('../use-cases/fleet/update-vehicle.js');
    const result = await updateVehicle({ fleetRepo: req.app.locals.deps.fleetRepo }, { vehicleId: req.params.id, ...req.body });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/purchase', requirePermission(Permission.EditFleet), validateBody(z.object({
  vehicleId: z.string(), purchasePrice: z.number().positive(), purchaseDate: z.string(),
  setUpCosts: z.number().nonnegative(), usefulLifeMonths: z.number().int().positive(),
  salvageValue: z.number().nonnegative(), fixedAssetAccountId: z.string(), cashAccountId: z.string(),
})), async (req, res, next) => {
  try {
    const { recordPurchase } = await import('../use-cases/fleet/record-purchase.js');
    const result = await recordPurchase(req.app.locals.deps, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/sale', requirePermission(Permission.EditFleet), validateBody(z.object({
  vehicleId: z.string(), saleDate: z.string(), salePrice: z.number().nonnegative(),
  cashAccountId: z.string(), fixedAssetAccountId: z.string(), accDepreciationAccountId: z.string(), gainLossAccountId: z.string(),
})), async (req, res, next) => {
  try {
    const { recordSale } = await import('../use-cases/fleet/record-sale.js');
    const result = await recordSale(req.app.locals.deps, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/depreciation', requirePermission(Permission.EditFleet), validateBody(z.object({
  vehicleIds: z.array(z.string()).min(1), depreciationAccountId: z.string(), accumulatedAccountId: z.string(),
})), async (req, res, next) => {
  try {
    const { batchDepreciation } = await import('../use-cases/fleet/batch-depreciation.js');
    const result = await batchDepreciation(req.app.locals.deps, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export { router as fleetRoutes };
