import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { Permission } from '@lolas/shared';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const edit = requirePermission(Permission.EditSettings);

// ── Stores ──
router.get('/stores', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getStores() }); } catch (e) { next(e); }
});
router.post('/stores', edit, validateBody(z.object({
  id: z.string().min(1), name: z.string().min(1), location: z.string().nullable().optional(),
  isActive: z.boolean().optional(), publicBookingEnabled: z.boolean().optional(),
  defaultFloatAmount: z.number().nonnegative().optional(),
  bookingToken: z.string().optional(),
})), async (req, res, next) => {
  try {
    if (!req.body.bookingToken) req.body.bookingToken = randomBytes(16).toString('hex');
    await req.app.locals.deps.configRepo.saveStore(req.body);
    res.json({ success: true });
  } catch (e) { next(e); }
});
router.put('/stores/:id', edit, validateBody(z.object({
  name: z.string().min(1), location: z.string().nullable().optional(),
  isActive: z.boolean().optional(), publicBookingEnabled: z.boolean().optional(),
  defaultFloatAmount: z.number().nonnegative().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveStore({ id: req.params.id, ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.post('/stores/:id/regenerate-token', edit, async (req, res, next) => {
  try {
    const newToken = randomBytes(16).toString('hex');
    await req.app.locals.deps.configRepo.saveStore({ id: req.params.id, bookingToken: newToken });
    res.json({ success: true, data: { bookingToken: newToken } });
  } catch (e) { next(e); }
});
router.delete('/stores/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteStore(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Addons ──
router.get('/addons', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getAddons(req.query.storeId as string) }); } catch (e) { next(e); }
});
router.post('/addons', edit, validateBody(z.object({
  name: z.string().min(1), pricePerDay: z.number().nonnegative(), priceOneTime: z.number().nonnegative(),
  addonType: z.enum(['per_day', 'one_time']), storeId: z.string().nullable().optional(),
  mutualExclusivityGroup: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveAddon(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/addons/:id', edit, validateBody(z.object({
  name: z.string().min(1), pricePerDay: z.number().nonnegative(), priceOneTime: z.number().nonnegative(),
  addonType: z.enum(['per_day', 'one_time']), storeId: z.string().nullable().optional(),
  mutualExclusivityGroup: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveAddon({ id: Number(req.params.id), ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/addons/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteAddon(Number(req.params.id)); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Locations ──
router.get('/locations', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getLocations(req.query.storeId as string) }); } catch (e) { next(e); }
});
router.post('/locations', edit, validateBody(z.object({
  name: z.string().min(1), deliveryCost: z.number().nonnegative(), collectionCost: z.number().nonnegative(),
  locationType: z.string().nullable().optional(), storeId: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveLocation(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/locations/:id', edit, validateBody(z.object({
  name: z.string().min(1), deliveryCost: z.number().nonnegative(), collectionCost: z.number().nonnegative(),
  locationType: z.string().nullable().optional(), storeId: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveLocation({ id: Number(req.params.id), ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/locations/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteLocation(Number(req.params.id)); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Payment Methods ──
router.get('/payment-methods', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getPaymentMethods() }); } catch (e) { next(e); }
});
router.post('/payment-methods', edit, validateBody(z.object({
  id: z.string().min(1), name: z.string().min(1), isDepositEligible: z.boolean().optional(), isActive: z.boolean().optional(), surchargePercent: z.number().min(0).max(100).optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.savePaymentMethod(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/payment-methods/:id', edit, validateBody(z.object({
  name: z.string().min(1), isDepositEligible: z.boolean().optional(), isActive: z.boolean().optional(), surchargePercent: z.number().min(0).max(100).optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.savePaymentMethod({ id: req.params.id, ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/payment-methods/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deletePaymentMethod(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Vehicle Models ──
router.get('/vehicle-models', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getVehicleModels() }); } catch (e) { next(e); }
});
router.post('/vehicle-models', edit, validateBody(z.object({
  id: z.string().min(1), name: z.string().min(1), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveVehicleModel(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/vehicle-models/:id', edit, validateBody(z.object({
  name: z.string().min(1), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveVehicleModel({ id: req.params.id, ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/vehicle-models/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteVehicleModel(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Model Pricing ──
router.get('/store-pricing', async (req, res, next) => {
  try {
    const { storeId } = req.query as { storeId: string };
    res.json({ success: true, data: await req.app.locals.deps.configRepo.getStorePricing(storeId) });
  } catch (e) { next(e); }
});
router.get('/model-pricing', async (req, res, next) => {
  try {
    const { modelId, storeId } = req.query as { modelId: string; storeId: string };
    res.json({ success: true, data: await req.app.locals.deps.configRepo.getModelPricing(modelId, storeId) });
  } catch (e) { next(e); }
});
router.post('/model-pricing', edit, validateBody(z.object({
  modelId: z.string(), storeId: z.string(), minDays: z.number().int(), maxDays: z.number().int(), dailyRate: z.number().nonnegative(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveModelPricing(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/model-pricing/:id', edit, validateBody(z.object({
  modelId: z.string(), storeId: z.string(), minDays: z.number().int(), maxDays: z.number().int(), dailyRate: z.number().nonnegative(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveModelPricing({ id: Number(req.params.id), ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/model-pricing/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteModelPricing(Number(req.params.id)); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Fleet Statuses ──
router.get('/fleet-statuses', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getFleetStatuses() }); } catch (e) { next(e); }
});
router.post('/fleet-statuses', edit, validateBody(z.object({
  id: z.string().min(1), name: z.string().min(1), isRentable: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveFleetStatus(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/fleet-statuses/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteFleetStatus(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Expense Categories ──
router.get('/expense-categories', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getExpenseCategories() }); } catch (e) { next(e); }
});
router.post('/expense-categories', edit, validateBody(z.object({
  name: z.string().min(1), mainCategory: z.string().nullable().optional(), accountId: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveExpenseCategory(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/expense-categories/:id', edit, validateBody(z.object({
  name: z.string().min(1), mainCategory: z.string().nullable().optional(), accountId: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveExpenseCategory({ id: Number(req.params.id), ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/expense-categories/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteExpenseCategory(Number(req.params.id)); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Task Categories ──
router.get('/task-categories', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getTaskCategories() }); } catch (e) { next(e); }
});
router.post('/task-categories', edit, validateBody(z.object({
  name: z.string().min(1), colour: z.string().min(1).default('#6B7280'), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveTaskCategory(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/task-categories/:id', edit, validateBody(z.object({
  name: z.string().min(1), colour: z.string().min(1).optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveTaskCategory({ id: Number(req.params.id), ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/task-categories/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteTaskCategory(Number(req.params.id)); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Transfer Routes ──
router.get('/transfer-routes', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getTransferRoutes(req.query.storeId as string) }); } catch (e) { next(e); }
});
router.post('/transfer-routes', edit, validateBody(z.object({
  route: z.string().min(1), vanType: z.string().nullable().optional(), price: z.number().nonnegative(),
  storeId: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveTransferRoute(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/transfer-routes/:id', edit, validateBody(z.object({
  route: z.string().min(1), vanType: z.string().nullable().optional(), price: z.number().nonnegative(),
  storeId: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveTransferRoute({ id: Number(req.params.id), ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/transfer-routes/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteTransferRoute(Number(req.params.id)); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Day Types ──
router.get('/day-types', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getDayTypes() }); } catch (e) { next(e); }
});
router.post('/day-types', edit, validateBody(z.object({
  id: z.string().min(1), name: z.string().min(1),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveDayType(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/day-types/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteDayType(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Chart of Accounts ──
router.get('/chart-of-accounts', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getChartOfAccounts() }); } catch (e) { next(e); }
});
router.post('/chart-of-accounts', edit, validateBody(z.object({
  id: z.string().min(1), name: z.string().min(1), accountType: z.string().min(1),
  storeId: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveAccount(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/chart-of-accounts/:id', edit, validateBody(z.object({
  name: z.string().min(1), accountType: z.string().min(1),
  storeId: z.string().nullable().optional(), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveAccount({ id: req.params.id, ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/chart-of-accounts/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteAccount(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Paw Card Establishments ──
router.get('/paw-card-establishments', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getPawCardEstablishments() }); } catch (e) { next(e); }
});
router.post('/paw-card-establishments', edit, validateBody(z.object({
  name: z.string().min(1), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveEstablishment(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/paw-card-establishments/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteEstablishment(Number(req.params.id)); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Maintenance Work Types (Parts) ──
router.get('/maintenance-work-types', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getMaintenanceWorkTypes() }); } catch (e) { next(e); }
});
router.post('/maintenance-work-types', edit, validateBody(z.object({
  name: z.string().min(1), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveWorkType(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/maintenance-work-types/:id', edit, validateBody(z.object({
  name: z.string().min(1), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveWorkType({ id: Number(req.params.id), ...req.body }); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/maintenance-work-types/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteWorkType(Number(req.params.id)); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Leave Config ──
router.get('/leave-config', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getLeaveConfig() }); } catch (e) { next(e); }
});
router.put('/leave-config', edit, validateBody(z.object({
  storeId: z.string(), resetMonth: z.number().int().min(1).max(12), resetDay: z.number().int().min(1).max(31),
  defaultHolidayAllowance: z.number().int().nonnegative(), defaultSickAllowance: z.number().int().nonnegative(),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveLeaveConfig(req.body); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Roles ──
router.get('/roles', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getRoles() }); } catch (e) { next(e); }
});
router.get('/roles/:id/permissions', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getRolePermissions(req.params.id) }); } catch (e) { next(e); }
});
router.post('/roles', edit, validateBody(z.object({
  id: z.string().min(1), name: z.string().min(1),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveRole(req.body); res.json({ success: true }); } catch (e) { next(e); }
});
router.delete('/roles/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteRole(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
});
router.put('/roles/:id/permissions', edit, validateBody(z.object({
  permissions: z.array(z.string()),
})), async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.saveRolePermissions(req.params.id, req.body.permissions); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Employees (lightweight list for user-creation dropdown) ──
router.get('/employees', async (req, res, next) => {
  try {
    const stores = await req.app.locals.deps.configRepo.getStores();
    const results = await Promise.all(
      stores.map((s: { id: string }) => req.app.locals.deps.employeeRepo.findByStore(s.id)),
    );
    const employees = results.flat().map((e: { id: string; fullName: string; storeId: string | null }) => ({
      id: e.id, fullName: e.fullName, storeId: e.storeId,
    }));
    res.json({ success: true, data: employees });
  } catch (e) { next(e); }
});

// ── Users ──
router.get('/users', async (req, res, next) => {
  try { res.json({ success: true, data: await req.app.locals.deps.configRepo.getUsers() }); } catch (e) { next(e); }
});
router.post('/users', edit, validateBody(z.object({
  username: z.string().min(1), pin: z.string().min(1), employeeId: z.string().min(1), roleId: z.string().min(1), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const { saveUser } = await import('../use-cases/settings/save-user.js');
    const result = await saveUser({ configRepo: req.app.locals.deps.configRepo }, { ...req.body, isActive: req.body.isActive ?? true });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});
router.put('/users/:id', edit, validateBody(z.object({
  username: z.string().min(1), pin: z.string().optional(), employeeId: z.string().min(1), roleId: z.string().min(1), isActive: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const { saveUser } = await import('../use-cases/settings/save-user.js');
    const result = await saveUser({ configRepo: req.app.locals.deps.configRepo }, { id: req.params.id, ...req.body, isActive: req.body.isActive ?? true });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});
router.delete('/users/:id', edit, async (req, res, next) => {
  try { await req.app.locals.deps.configRepo.deleteUser(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
});

// ── Payment Routing Rules ──
router.get('/payment-routing', async (req, res, next) => {
  try {
    const routingRepo = req.app.locals.deps.paymentRoutingRepo;
    const rules = await routingRepo.findAll();

    const sb = (await import('../adapters/supabase/client.js')).getSupabaseClient();
    const { data: storesData } = await sb
      .from('stores')
      .select('id, card_fee_account_id, default_cash_account_id');

    const storeDefaults: Record<string, { cardFeeAccountId: string | null; defaultCashAccountId: string | null }> = {};
    for (const s of (storesData ?? []) as { id: string; card_fee_account_id: string | null; default_cash_account_id: string | null }[]) {
      storeDefaults[s.id] = {
        cardFeeAccountId: s.card_fee_account_id,
        defaultCashAccountId: s.default_cash_account_id,
      };
    }

    res.json({ success: true, data: { rules, storeDefaults } });
  } catch (e) { next(e); }
});

router.put('/payment-routing', edit, validateBody(z.object({
  rules: z.array(z.object({
    storeId: z.string().min(1),
    paymentMethodId: z.string().min(1),
    receivedIntoAccountId: z.string().nullable().optional(),
    cardSettlementAccountId: z.string().nullable().optional(),
  })),
  storeDefaults: z.object({
    storeId: z.string().min(1),
    cardFeeAccountId: z.string().nullable().optional(),
    defaultCashAccountId: z.string().nullable().optional(),
  }).optional(),
})), async (req, res, next) => {
  try {
    const routingRepo = req.app.locals.deps.paymentRoutingRepo;
    const { rules, storeDefaults } = req.body as {
      rules: Array<{
        storeId: string;
        paymentMethodId: string;
        receivedIntoAccountId?: string | null;
        cardSettlementAccountId?: string | null;
      }>;
      storeDefaults?: {
        storeId: string;
        cardFeeAccountId?: string | null;
        defaultCashAccountId?: string | null;
      };
    };

    await routingRepo.bulkUpsert(rules.map((r) => ({
      storeId: r.storeId,
      paymentMethodId: r.paymentMethodId,
      receivedIntoAccountId: r.receivedIntoAccountId ?? null,
      cardSettlementAccountId: r.cardSettlementAccountId ?? null,
    })));

    if (storeDefaults) {
      const sb = (await import('../adapters/supabase/client.js')).getSupabaseClient();
      const { error } = await sb
        .from('stores')
        .update({
          card_fee_account_id: storeDefaults.cardFeeAccountId ?? null,
          default_cash_account_id: storeDefaults.defaultCashAccountId ?? null,
        })
        .eq('id', storeDefaults.storeId);
      if (error) throw new Error(`Failed to update store defaults: ${error.message}`);
    }

    res.json({ success: true });
  } catch (e) { next(e); }
});

export { router as configRoutes };
