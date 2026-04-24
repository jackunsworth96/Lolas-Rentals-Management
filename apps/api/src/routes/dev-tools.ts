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

/**
 * POST /api/dev-tools/reset-customer
 *
 * Deletes all orders (and their related financial / operational data)
 * for the customer name supplied in the request body, then resets
 * only those vehicles back to 'available'.  All other orders and
 * real operational data are left untouched.
 *
 * Body: { "customerName": "TEST NAME" }
 *
 * Requires the EditSettings (can_edit_settings) permission — admin-only.
 */
router.post(
  '/reset-customer',
  requirePermission(Permission.EditSettings),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { customerName } = req.body as { customerName?: string };

      if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'customerName is required.' },
        });
        return;
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase.rpc('cleanup_test_customer_orders', {
        p_customer_name: customerName.trim(),
      });

      if (error) {
        res.status(500).json({
          success: false,
          error: { code: 'CLEANUP_FAILED', message: error.message },
        });
        return;
      }

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/dev-tools/reset-by-email
 *
 * Deletes all orders (and related financial / operational data) that belong to:
 *   - customers whose email matches the supplied address (case-insensitive), OR
 *   - customers whose name contains "TEST" (case-insensitive)
 *
 * Also removes orphaned orders_raw rows that match on customer_email or
 * customer_name, and deletes the matching test customer records themselves.
 *
 * Body: { "email": "jackunsworth96@gmail.com" }
 *       (email is optional — omitting it still cleans up TEST-named customers)
 *
 * Requires the EditSettings (can_edit_settings) permission — admin-only.
 */
router.post(
  '/reset-by-email',
  requirePermission(Permission.EditSettings),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body as { email?: string };

      const supabase = getSupabaseClient();

      const { data, error } = await supabase.rpc('cleanup_bookings_by_email_or_test', {
        p_email: email?.trim() ?? null,
      });

      if (error) {
        res.status(500).json({
          success: false,
          error: { code: 'CLEANUP_FAILED', message: error.message },
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
