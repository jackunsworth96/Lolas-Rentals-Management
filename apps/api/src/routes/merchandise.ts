import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  Permission,
  MerchandiseQuerySchema,
  CreateMerchandiseItemSchema,
  UpdateMerchandiseItemSchema,
  AdjustStockSchema,
} from '@lolas/shared';

const router = Router();
router.use(authenticate);

const perm = requirePermission(Permission.ViewMiscSales);

router.get('/', perm, validateQuery(MerchandiseQuerySchema), async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId: string };
    const repo = req.app.locals.deps.merchandiseRepo;
    const items = await repo.findByStore(storeId);
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

router.get('/:sku', perm, async (req, res, next) => {
  try {
    const repo = req.app.locals.deps.merchandiseRepo;
    const item = await repo.findBySku(req.params.sku);
    if (!item) return res.status(404).json({ success: false, error: { message: 'Item not found' } });
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

router.post('/', perm, validateBody(CreateMerchandiseItemSchema), async (req, res, next) => {
  try {
    const repo = req.app.locals.deps.merchandiseRepo;
    const body = req.body as {
      sku: string;
      itemName: string;
      sizeVariant?: string | null;
      costPrice: number;
      salePrice: number;
      startingStock: number;
      currentStock: number;
      lowStockThreshold: number;
      storeId: string;
      isActive: boolean;
    };
    await repo.save({
      ...body,
      sizeVariant: body.sizeVariant ?? null,
      soldCount: 0,
    });
    const saved = await repo.findBySku(body.sku);
    res.status(201).json({ success: true, data: saved });
  } catch (err) { next(err); }
});

router.put('/:sku', perm, validateBody(UpdateMerchandiseItemSchema), async (req, res, next) => {
  try {
    const repo = req.app.locals.deps.merchandiseRepo;
    const existing = await repo.findBySku(req.params.sku);
    if (!existing) return res.status(404).json({ success: false, error: { message: 'Item not found' } });

    const body = req.body as Partial<{
      itemName: string;
      sizeVariant: string | null;
      costPrice: number;
      salePrice: number;
      lowStockThreshold: number;
      isActive: boolean;
    }>;

    await repo.save({
      sku: existing.sku,
      itemName: body.itemName ?? existing.itemName,
      sizeVariant: body.sizeVariant !== undefined ? body.sizeVariant : existing.sizeVariant,
      costPrice: body.costPrice ?? existing.costPrice,
      salePrice: body.salePrice ?? existing.salePrice,
      startingStock: existing.startingStock,
      soldCount: existing.soldCount,
      currentStock: existing.currentStock,
      lowStockThreshold: body.lowStockThreshold ?? existing.lowStockThreshold,
      storeId: existing.storeId,
      isActive: body.isActive ?? existing.isActive,
    });

    const updated = await repo.findBySku(req.params.sku);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post('/:sku/adjust-stock', perm, validateBody(AdjustStockSchema), async (req, res, next) => {
  try {
    const repo = req.app.locals.deps.merchandiseRepo;
    const { delta, reason: _reason } = req.body as { delta: number; reason: string };
    const updated = await repo.updateStock(req.params.sku, delta);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.delete('/:sku', perm, async (req, res, next) => {
  try {
    const repo = req.app.locals.deps.merchandiseRepo;
    await repo.delete(req.params.sku);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
});

export { router as merchandiseRoutes };
