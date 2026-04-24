import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

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
      .select('id, order_date, status, final_total, balance_due, order_items(vehicle_name)')
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
        orderDate: o.order_date,
        status: o.status,
        finalTotal: Number(o.final_total ?? 0),
        balanceDue: Number(o.balance_due ?? 0),
        vehicleNames: vehicleNames || '—',
      };
    });

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
        customer,
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

export { router as customerRoutes };
