import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validate.js';
import { listRepairCosts } from '../use-cases/repairs/list-repair-costs.js';

const router = Router();

const CostsQuerySchema = z.object({
  vehicleType: z.enum(['honda_beat', 'tuk_tuk']),
});

router.get('/costs', validateQuery(CostsQuerySchema), async (req, res, next) => {
  try {
    const { vehicleType } = req.query as { vehicleType: 'honda_beat' | 'tuk_tuk' };
    const items = await listRepairCosts({ repairsPort: req.app.locals.deps.repairsPort }, vehicleType);
    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
});

export { router as publicRepairsRoutes };
