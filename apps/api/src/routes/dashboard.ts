import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const router = Router();
router.use(authenticate);

function parseCountryFromMobile(mobile: string | null): { country: string; continent: string } {
  if (!mobile) return { country: 'Unknown', continent: 'Unknown' };
  const cleaned = mobile.replace(/\s/g, '');
  if (!cleaned.startsWith('+')) return { country: 'Unknown', continent: 'Unknown' };
  const num = cleaned.slice(1);

  const lookup: Array<[string, string, string]> = [
    ['1', 'USA / Canada', 'Americas'],
    ['27', 'South Africa', 'Africa'],
    ['31', 'Netherlands', 'Europe'],
    ['32', 'Belgium', 'Europe'],
    ['33', 'France', 'Europe'],
    ['34', 'Spain', 'Europe'],
    ['39', 'Italy', 'Europe'],
    ['40', 'Romania', 'Europe'],
    ['41', 'Switzerland', 'Europe'],
    ['43', 'Austria', 'Europe'],
    ['44', 'United Kingdom', 'Europe'],
    ['45', 'Denmark', 'Europe'],
    ['46', 'Sweden', 'Europe'],
    ['47', 'Norway', 'Europe'],
    ['48', 'Poland', 'Europe'],
    ['49', 'Germany', 'Europe'],
    ['51', 'Peru', 'Americas'],
    ['52', 'Mexico', 'Americas'],
    ['54', 'Argentina', 'Americas'],
    ['55', 'Brazil', 'Americas'],
    ['56', 'Chile', 'Americas'],
    ['57', 'Colombia', 'Americas'],
    ['60', 'Malaysia', 'Asia'],
    ['61', 'Australia', 'Oceania'],
    ['62', 'Indonesia', 'Asia'],
    ['63', 'Philippines', 'Asia'],
    ['64', 'New Zealand', 'Oceania'],
    ['65', 'Singapore', 'Asia'],
    ['66', 'Thailand', 'Asia'],
    ['81', 'Japan', 'Asia'],
    ['82', 'South Korea', 'Asia'],
    ['84', 'Vietnam', 'Asia'],
    ['86', 'China', 'Asia'],
    ['90', 'Turkey', 'Europe'],
    ['91', 'India', 'Asia'],
    ['92', 'Pakistan', 'Asia'],
    ['94', 'Sri Lanka', 'Asia'],
    ['95', 'Myanmar', 'Asia'],
    ['234', 'Nigeria', 'Africa'],
    ['254', 'Kenya', 'Africa'],
    ['353', 'Ireland', 'Europe'],
    ['354', 'Iceland', 'Europe'],
    ['358', 'Finland', 'Europe'],
    ['370', 'Lithuania', 'Europe'],
    ['371', 'Latvia', 'Europe'],
    ['372', 'Estonia', 'Europe'],
    ['380', 'Ukraine', 'Europe'],
    ['385', 'Croatia', 'Europe'],
    ['386', 'Slovenia', 'Europe'],
    ['420', 'Czech Republic', 'Europe'],
    ['421', 'Slovakia', 'Europe'],
    ['670', 'Timor-Leste', 'Asia'],
    ['673', 'Brunei', 'Asia'],
    ['852', 'Hong Kong', 'Asia'],
    ['853', 'Macau', 'Asia'],
    ['855', 'Cambodia', 'Asia'],
    ['856', 'Laos', 'Asia'],
    ['886', 'Taiwan', 'Asia'],
    ['972', 'Israel', 'Asia'],
  ];

  const sorted = [...lookup].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, country, continent] of sorted) {
    if (num.startsWith(prefix)) return { country, continent };
  }
  return { country: 'Unknown', continent: 'Unknown' };
}

interface NinePmVehicle {
  orderId: string;
  vehicleModel: string;
  returnTime: string;
}

interface MaintenanceVehicle {
  id: string;
  name: string;
  status: string;
  daysDown: number;
}

interface AddonRevenueRow {
  addonName: string;
  total: number;
}

interface CashBalanceRow {
  accountId: string;
  accountName: string;
  balance: number;
}

interface RevenueTrendRow {
  date: string;
  revenue: number;
}

interface ExpensesByCategoryRow {
  category: string;
  total: number;
}

interface StoreMetrics {
  activeRentals: number;
  availableVehicles: number;
  ninepmReturns: { count: number; vehicles: NinePmVehicle[] };
  depositsWithheld: number;
  fleetUtilisation: number;
  maintenanceVehicles: MaintenanceVehicle[];
  maintenancePartsCost: number | null;
  maintenanceLabourCost: number | null;
  customerBreakdown: {
    byCountry: Array<{ country: string; count: number }>;
    byContinent: Array<{ continent: string; count: number }>;
  } | null;
  expensesByCategory: ExpensesByCategoryRow[] | null;
  expensesByCategoryLastMonth: ExpensesByCategoryRow[] | null;
  todayRevenue: number | null;
  miscSalesRevenue: number | null;
  addonRevenue: AddonRevenueRow[] | null;
  cashBalances: CashBalanceRow[] | null;
  revenueTrend: RevenueTrendRow[] | null;
  revenueThisMonth: RevenueTrendRow[] | null;
}

function emptyMetrics(financial: boolean): StoreMetrics {
  return {
    activeRentals: 0,
    availableVehicles: 0,
    ninepmReturns: { count: 0, vehicles: [] },
    depositsWithheld: 0,
    fleetUtilisation: 0,
    maintenanceVehicles: [],
    maintenancePartsCost: financial ? 0 : null,
    maintenanceLabourCost: financial ? 0 : null,
    customerBreakdown: null,
    expensesByCategory: financial ? [] : null,
    expensesByCategoryLastMonth: financial ? [] : null,
    todayRevenue: financial ? 0 : null,
    miscSalesRevenue: financial ? 0 : null,
    addonRevenue: financial ? [] : null,
    cashBalances: [],
    revenueTrend: financial ? [] : null,
    revenueThisMonth: financial ? [] : null,
  };
}

router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const storeIdParam = req.query.storeId as string | undefined;
    const userPerms = req.user?.permissions ?? [];
    const canViewFinancial = userPerms.includes(Permission.ViewDashboard);

    const manilaDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const firstDayOfMonth = manilaDate.slice(0, 7) + '-01';
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const now = new Date(manilaDate);
    const firstDayLastMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString().slice(0, 10);
    const lastDayLastMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
    ).toISOString().slice(0, 10);

    const storeFilter = storeIdParam && storeIdParam !== 'all' ? storeIdParam : undefined;

    const operationalQueries = [
      sb
        .from('orders')
        .select('id, store_id, security_deposit, status')
        .eq('status', 'active')
        .then((r) => ({ key: 'activeOrders' as const, ...r })),

      sb
        .from('order_items')
        .select('vehicle_id, orders!inner(store_id, status)')
        .eq('orders.status', 'confirmed')
        .gt('pickup_datetime', new Date().toISOString())
        .gt('dropoff_datetime', new Date().toISOString())
        .then((r) => ({ key: 'upcomingBookings' as const, ...r })),

      sb
        .from('fleet')
        .select('id, name, store_id, status, updated_at')
        .then((r) => ({ key: 'fleet' as const, ...r })),

      sb
        .from('fleet_statuses')
        .select('id, name, is_rentable')
        .then((r) => ({ key: 'fleetStatuses' as const, ...r })),

      sb
        .from('order_items')
        .select('id, order_id, vehicle_id, dropoff_datetime, vehicle_name, orders!inner(store_id, status)')
        .eq('orders.status', 'active')
        .then((r) => ({ key: 'ninepmCandidates' as const, ...r })),

      sb
        .from('fleet')
        .select('id, model_id, vehicle_models!model_id(name)')
        .then((r) => ({ key: 'fleetModels' as const, ...r })),

      sb
        .from('maintenance')
        .select('id, asset_id, status, created_at, fleet!asset_id(name, store_id)')
        .eq('status', 'In Progress')
        .then((r) => ({ key: 'maintenanceRecords' as const, ...r })),

      sb
        .from('journal_entries')
        .select('account_id, store_id, debit, credit, chart_of_accounts!account_id(name, account_type)')
        .then((r) => ({ key: 'cashBalances' as const, ...r })),
    ];

    const financialQueries = canViewFinancial
      ? [
          sb
            .from('payments')
            .select('id, amount, store_id, payment_type, created_at')
            .gte('created_at', `${manilaDate}T00:00:00+08:00`)
            .lt('created_at', `${manilaDate}T23:59:59.999+08:00`)
            .not('payment_type', 'in', '("deposit","refund")')
            .then((r) => ({ key: 'todayPayments' as const, ...r })),

          sb
            .from('misc_sales')
            .select('id, amount, store_id, created_at')
            .gte('created_at', `${manilaDate}T00:00:00+08:00`)
            .lt('created_at', `${manilaDate}T23:59:59.999+08:00`)
            .then((r) => ({ key: 'miscSales' as const, ...r })),

          sb
            .from('order_addons')
            .select('addon_name, total_amount, store_id, orders!order_id(status, created_at)')
            .gte('added_at', `${manilaDate}T00:00:00+08:00`)
            .lt('added_at', `${manilaDate}T23:59:59.999+08:00`)
            .then((r) => ({ key: 'addonRevenue' as const, ...r })),

          sb
            .from('payments')
            .select('amount, store_id, payment_type, created_at')
            .gte('created_at', `${thirtyDaysAgo}T00:00:00+08:00`)
            .not('payment_type', 'in', '("deposit","refund")')
            .then((r) => ({ key: 'revenueTrend' as const, ...r })),

          sb
            .from('payments')
            .select('amount, store_id, payment_type, created_at')
            .gte('created_at', `${firstDayOfMonth}T00:00:00+08:00`)
            .not('payment_type', 'in', '("deposit","refund")')
            .then((r) => ({ key: 'revenueThisMonth' as const, ...r })),

          sb
            .from('journal_entries')
            .select('debit, store_id')
            .eq('reference_type', 'maintenance_parts')
            .gte('date', firstDayOfMonth)
            .lte('date', manilaDate)
            .then((r) => ({ key: 'maintenancePartsEntries' as const, ...r })),

          sb
            .from('journal_entries')
            .select('debit, store_id')
            .eq('reference_type', 'maintenance_labour')
            .gte('date', firstDayOfMonth)
            .lte('date', manilaDate)
            .then((r) => ({ key: 'maintenanceLabourEntries' as const, ...r })),

          sb
            .from('expenses')
            .select('category, amount, store_id')
            .gte('date', firstDayOfMonth)
            .lte('date', manilaDate)
            .then((r) => ({ key: 'expensesMonth' as const, ...r })),

          sb
            .from('expenses')
            .select('category, amount, store_id')
            .gte('date', firstDayLastMonth)
            .lte('date', lastDayLastMonth)
            .then((r) => ({ key: 'expensesLastMonth' as const, ...r })),

          sb
            .from('customers')
            .select('mobile, store_id')
            .then((r) => ({ key: 'customers' as const, ...r })),
        ]
      : [];

    const allResults = await Promise.all([
      ...operationalQueries,
      ...financialQueries.filter(Boolean),
    ]);

    const dataMap = new Map<string, Record<string, unknown>[]>();
    for (const result of allResults) {
      if (result && typeof result === 'object' && 'key' in result) {
        const r = result as { key: string; data: Record<string, unknown>[] | null; error: { message: string } | null };
        if (r.error) {
          console.error(`Dashboard query ${r.key} failed: ${r.error.message}`);
        }
        dataMap.set(r.key, (r.data ?? []) as Record<string, unknown>[]);
      }
    }

    const activeOrders = dataMap.get('activeOrders') ?? [];
    const upcomingBookings = dataMap.get('upcomingBookings') ?? [];
    const fleet = dataMap.get('fleet') ?? [];
    const fleetStatuses = dataMap.get('fleetStatuses') ?? [];
    const ninepmCandidates = dataMap.get('ninepmCandidates') ?? [];
    const maintenanceRecords = dataMap.get('maintenanceRecords') ?? [];

    const rentableStatusIds = new Set(
      fleetStatuses
        .filter((s) => s.is_rentable === true)
        .map((s) => s.id as string),
    );

    const rentableStatusNames = new Set(
      fleetStatuses
        .filter((s) => s.is_rentable === true)
        .map((s) => s.name as string),
    );

    const fleetModels = dataMap.get('fleetModels') ?? [];
    const fleetModelMap = new Map<string, string>();
    for (const fm of fleetModels) {
      const modelData = fm.vehicle_models as { name: string } | null;
      if (modelData) fleetModelMap.set(fm.id as string, modelData.name);
    }

    const activeVehicleIds = new Set(
      activeOrders.length > 0
        ? ninepmCandidates.map((i) => i.vehicle_id as string).filter(Boolean)
        : [],
    );

    const upcomingVehicleIds = new Set(
      upcomingBookings.map((i) => i.vehicle_id as string).filter(Boolean),
    );

    const nowMs = Date.now();

    function buildNinepmVehicles(items: Record<string, unknown>[], sid?: string): NinePmVehicle[] {
      const result: NinePmVehicle[] = [];
      for (const item of items) {
        const orderData = item.orders as { store_id: string; status: string } | null;
        if (!orderData || orderData.status !== 'active') continue;
        if (sid && orderData.store_id !== sid) continue;

        const dropoff = item.dropoff_datetime as string | null;
        if (!dropoff) continue;

        const dropDate = new Date(dropoff);
        const manilaStr = dropDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        if (manilaStr !== manilaDate) continue;

        const manilaHour = Number(dropDate.toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }));
        if (manilaHour < 21) continue;

        const vehicleId = item.vehicle_id as string | null;
        const vehicleModel = (vehicleId ? fleetModelMap.get(vehicleId) : null) ?? (item.vehicle_name as string) ?? '—';

        const returnTime = dropDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });

        result.push({
          orderId: item.order_id as string,
          vehicleModel,
          returnTime,
        });
      }
      return result;
    }

    function buildMaintenanceVehicles(records: Record<string, unknown>[], sid?: string): MaintenanceVehicle[] {
      const result: MaintenanceVehicle[] = [];
      for (const r of records) {
        const fleetData = r.fleet as { name: string; store_id: string } | null;
        if (!fleetData) continue;
        if (sid && fleetData.store_id !== sid) continue;

        const createdAt = r.created_at as string | null;
        const daysDown = createdAt
          ? Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)))
          : 0;

        result.push({
          id: r.asset_id as string,
          name: fleetData.name,
          status: r.status as string,
          daysDown,
        });
      }
      return result;
    }

    function aggregateByCategory(
      rows: Array<Record<string, unknown>>,
      sid?: string,
    ): ExpensesByCategoryRow[] {
      const map = new Map<string, number>();
      for (const row of rows) {
        if (sid && row.store_id !== sid) continue;
        const category = String(row.category ?? 'Uncategorised');
        map.set(category, (map.get(category) ?? 0) + Number(row.amount ?? 0));
      }
      return Array.from(map.entries())
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total);
    }

    function buildStoreMetrics(sid?: string): StoreMetrics {
      const storeActiveOrders = sid
        ? activeOrders.filter((o) => o.store_id === sid)
        : activeOrders;

      const storeFleet = sid
        ? fleet.filter((v) => v.store_id === sid)
        : fleet;

      const rentableFleet = storeFleet.filter(
        (v) => rentableStatusIds.has(v.status as string) || rentableStatusNames.has(v.status as string),
      );
      const totalRentable = rentableFleet.length;

      const storeActiveVehicleIds = new Set<string>();
      for (const item of ninepmCandidates) {
        const orderData = item.orders as { store_id: string; status: string } | null;
        if (!orderData || orderData.status !== 'active') continue;
        if (sid && orderData.store_id !== sid) continue;
        const vid = item.vehicle_id as string | undefined;
        if (vid) storeActiveVehicleIds.add(vid);
      }

      const storeUpcomingVehicleIds = new Set<string>();
      for (const item of upcomingBookings) {
        const orderData = item.orders as { store_id: string } | null;
        if (sid && orderData?.store_id !== sid) continue;
        const vid = item.vehicle_id as string | undefined;
        if (vid) storeUpcomingVehicleIds.add(vid);
      }

      const bookedVehicleIds = new Set([...storeActiveVehicleIds, ...storeUpcomingVehicleIds]);
      const availableVehicles = rentableFleet.filter((v) => !bookedVehicleIds.has(v.id as string)).length;

      const activeCount = storeActiveOrders.length;
      const fleetUtilisation = totalRentable > 0
        ? Math.round((storeActiveVehicleIds.size / totalRentable) * 100)
        : 0;

      const depositsWithheld = storeActiveOrders.reduce(
        (sum, o) => sum + Number(o.security_deposit ?? 0), 0,
      );

      const ninepmVehicles = buildNinepmVehicles(ninepmCandidates, sid);
      /** Only vehicles with an open maintenance record (In Progress), not fleet status heuristics (e.g. Service Vehicle). */
      const maintenanceVehicles = buildMaintenanceVehicles(maintenanceRecords, sid);

      let maintenancePartsCost: number | null = null;
      let maintenanceLabourCost: number | null = null;
      let customerBreakdown: StoreMetrics['customerBreakdown'] = null;
      let expensesByCategory: ExpensesByCategoryRow[] | null = null;
      let expensesByCategoryLastMonth: ExpensesByCategoryRow[] | null = null;
      let todayRevenue: number | null = null;
      let miscSalesRevenue: number | null = null;
      let addonRevenue: AddonRevenueRow[] | null = null;
      let revenueTrend: RevenueTrendRow[] | null = null;
      let revenueThisMonth: RevenueTrendRow[] | null = null;

      const balanceData = dataMap.get('cashBalances') ?? [];
      const balanceMap = new Map<string, { name: string; debit: number; credit: number }>();
      for (const row of balanceData) {
        const acct = row.chart_of_accounts as { name: string; account_type: string } | null;
        if (!acct || acct.account_type !== 'Asset') continue;
        const lowerName = acct.name.toLowerCase();
        if (!lowerName.includes('cash') && !lowerName.includes('bank') && !lowerName.includes('gcash') && !lowerName.includes('float')) continue;
        if (sid && row.store_id !== sid) continue;
        const accId = row.account_id as string;
        const existing = balanceMap.get(accId) ?? { name: acct.name, debit: 0, credit: 0 };
        existing.debit += Number(row.debit ?? 0);
        existing.credit += Number(row.credit ?? 0);
        balanceMap.set(accId, existing);
      }
      const cashBalances: CashBalanceRow[] = [...balanceMap.entries()].map(([accountId, v]) => ({
        accountId,
        accountName: v.name,
        balance: v.debit - v.credit,
      }));

      if (canViewFinancial) {
        const todayPayments = dataMap.get('todayPayments') ?? [];
        const storePayments = sid
          ? todayPayments.filter((p) => p.store_id === sid)
          : todayPayments;
        todayRevenue = storePayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

        const miscSalesData = dataMap.get('miscSales') ?? [];
        const storeMisc = sid
          ? miscSalesData.filter((m) => m.store_id === sid)
          : miscSalesData;
        miscSalesRevenue = storeMisc.reduce((sum, m) => sum + Number(m.amount ?? 0), 0);

        const addonData = dataMap.get('addonRevenue') ?? [];
        const storeAddons = sid
          ? addonData.filter((a) => a.store_id === sid)
          : addonData;
        const addonMap = new Map<string, number>();
        for (const a of storeAddons) {
          const name = a.addon_name as string;
          addonMap.set(name, (addonMap.get(name) ?? 0) + Number(a.total_amount ?? 0));
        }
        addonRevenue = [...addonMap.entries()]
          .map(([addonName, total]) => ({ addonName, total }))
          .sort((a, b) => b.total - a.total);

        const trendData = dataMap.get('revenueTrend') ?? [];
        const storeTrend = sid
          ? trendData.filter((t) => t.store_id === sid)
          : trendData;
        const trendMap = new Map<string, number>();
        for (const p of storeTrend) {
          const createdAt = p.created_at as string;
          const payDate = new Date(createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
          trendMap.set(payDate, (trendMap.get(payDate) ?? 0) + Number(p.amount ?? 0));
        }
        revenueTrend = [...trendMap.entries()]
          .map(([date, revenue]) => ({ date, revenue }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const thisMonthData = dataMap.get('revenueThisMonth') ?? [];
        const storeThisMonth = sid
          ? thisMonthData.filter((t) => t.store_id === sid)
          : thisMonthData;
        const thisMonthMap = new Map<string, number>();
        for (const p of storeThisMonth) {
          const createdAt = p.created_at as string;
          const payDate = new Date(createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
          thisMonthMap.set(payDate, (thisMonthMap.get(payDate) ?? 0) + Number(p.amount ?? 0));
        }
        revenueThisMonth = [...thisMonthMap.entries()]
          .map(([date, revenue]) => ({ date, revenue }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const partsEntries = dataMap.get('maintenancePartsEntries') ?? [];
        maintenancePartsCost = partsEntries
          .filter((r) => !sid || r.store_id === sid)
          .reduce((sum, r) => sum + Number(r.debit ?? 0), 0);

        const labourEntries = dataMap.get('maintenanceLabourEntries') ?? [];
        maintenanceLabourCost = labourEntries
          .filter((r) => !sid || r.store_id === sid)
          .reduce((sum, r) => sum + Number(r.debit ?? 0), 0);

        const expensesMonthRows = dataMap.get('expensesMonth') ?? [];
        expensesByCategory = aggregateByCategory(expensesMonthRows, sid);

        const expensesLastMonthRows = dataMap.get('expensesLastMonth') ?? [];
        expensesByCategoryLastMonth = aggregateByCategory(expensesLastMonthRows, sid);

        const customerRows = (dataMap.get('customers') ?? []) as Array<{
          mobile: string | null;
          store_id: string;
        }>;
        const filteredCustomers = sid
          ? customerRows.filter((c) => c.store_id === sid)
          : customerRows;

        const countryMap = new Map<string, number>();
        const continentMap = new Map<string, number>();
        for (const c of filteredCustomers) {
          const { country, continent } = parseCountryFromMobile(c.mobile);
          countryMap.set(country, (countryMap.get(country) ?? 0) + 1);
          continentMap.set(continent, (continentMap.get(continent) ?? 0) + 1);
        }

        const byCountry = [...countryMap.entries()]
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count);
        const byContinent = [...continentMap.entries()]
          .map(([continent, count]) => ({ continent, count }))
          .sort((a, b) => b.count - a.count);

        customerBreakdown = { byCountry, byContinent };
      }

      return {
        activeRentals: activeCount,
        availableVehicles,
        ninepmReturns: { count: ninepmVehicles.length, vehicles: ninepmVehicles },
        depositsWithheld,
        fleetUtilisation,
        maintenanceVehicles,
        maintenancePartsCost,
        maintenanceLabourCost,
        customerBreakdown,
        expensesByCategory,
        expensesByCategoryLastMonth,
        todayRevenue,
        miscSalesRevenue,
        addonRevenue,
        cashBalances,
        revenueTrend,
        revenueThisMonth,
      };
    }

    const storeIds = ['store-lolas', 'store-bass'] as const;
    const stores: Record<string, StoreMetrics> = {};

    stores['combined'] = buildStoreMetrics(undefined);
    for (const sid of storeIds) {
      stores[sid] = buildStoreMetrics(sid);
    }

    if (storeFilter) {
      res.json({
        success: true,
        data: {
          date: manilaDate,
          stores: {
            [storeFilter]: stores[storeFilter] ?? emptyMetrics(canViewFinancial),
          },
        },
      });
    } else {
      res.json({
        success: true,
        data: { date: manilaDate, stores },
      });
    }
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRoutes };
