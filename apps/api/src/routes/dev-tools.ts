import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

/**
 * POST /api/dev-tools/reset
 *
 * Wipes all test booking data and resets fleet statuses by calling
 * the reset_test_data() RPC. Requires the EditSettings (can_edit_settings)
 * permission — admin-only.
 *
 * Returns a JSON summary of rows deleted per table.
 */
router.post(
  '/reset',
  requirePermission(Permission.EditSettings),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase.rpc('reset_test_data');

      if (error) {
        res.status(500).json({
          success: false,
          error: { code: 'RESET_FAILED', message: error.message },
        });
        return;
      }

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

export const devToolsRoutes = router;
