import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { Permission } from '@lolas/shared';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate } from '../utils/manila-date.js';
import { getPartnerCommissionStats } from '../lib/partner-commission.js';

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
  vehicleName: string;
  returnTime: string;
  customerName: string;
  customerMobile: string | null;
  helmetNumbers: string | null;
  balanceDue: number;
  securityDeposit: number;
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
  tomorrowAvailable: number;
  bookingSourceSplit: {
    directWeb: number;
    walkIn: number;
    wooCommerce: number;
    total: number;
  } | null;
  deviceSplit: {
    mobile: number;
    desktop: number;
    total: number;
  } | null;
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
    tomorrowAvailable: 0,
    bookingSourceSplit: null,
    deviceSplit: null,
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
    const firstDayLastMonth = formatManilaDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastDayLastMonth = formatManilaDate(new Date(now.getFullYear(), now.getMonth(), 0));

    const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

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
        .select(`
          id,
          order_id,
          vehicle_id,
          dropoff_datetime,
          vehicle_name,
          helmet_numbers,
          orders!inner(
            id,
            store_id,
            status,
            balance_due,
            security_deposit,
            booking_customer_name,
            customers!customer_id(name, mobile)
          )
        `)
        .eq('orders.status', 'active')
        .gte('dropoff_datetime', `${manilaDate}T00:00:00+08:00`)
        .lte('dropoff_datetime', `${manilaDate}T23:59:59+08:00`)
        .then((r) => ({ key: 'ninepmCandidates' as const, ...r })),

      sb
        .from('order_addons')
        .select('order_id, addon_name')
        .or('addon_name.ilike.%9pm%,addon_name.ilike.%21:00%,addon_name.ilike.%ninepm%')
        .then((r) => ({ key: 'ninepmAddons' as const, ...r })),

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
        .select('account_id, store_id, debit, credit, chart_of_accounts!account_id(name, account_type, store_id)')
        .then((r) => ({ key: 'cashBalances' as const, ...r })),

      sb
        .from('order_items')
        .select('vehicle_id, orders!inner(store_id, status)')
        .in('orders.status', ['active', 'confirmed'])
        .lt('pickup_datetime', `${tomorrowDate}T23:59:59+08:00`)
        .gt('dropoff_datetime', `${tomorrowDate}T00:00:00+08:00`)
        .then((r) => ({ key: 'tomorrowBookings' as const, ...r })),

      sb
        .from('orders_raw')
        .select('source, booking_channel, store_id, device_type')
        .gte('created_at', `${manilaDate}T00:00:00+08:00`)
        .lt('created_at', `${manilaDate}T23:59:59.999+08:00`)
        .then((r) => ({ key: 'bookingSourceData' as const, ...r })),
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

    // Quick-stats count queries — run in parallel with the main queries
    const cashupStatusQuery = (() => {
      let q = sb.from('cash_reconciliation')
        .select('store_id, is_locked')
        .eq('date', manilaDate);
      if (storeFilter) q = q.eq('store_id', storeFilter);
      return q;
    })();

    const pendingTasksQuery = (() => {
      let q = sb.from('tasks')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'Closed');
      if (storeFilter) q = q.eq('store_id', storeFilter);
      return q;
    })();

    const upcomingTransfersQuery = (() => {
      let q = sb.from('transfers')
        .select('id', { count: 'exact', head: true })
        .eq('service_date', manilaDate)
        .neq('status', 'Cancelled');
      if (storeFilter) q = q.eq('store_id', storeFilter);
      return q;
    })();

    // Select minimal fields to count distinct overdue orders in JS
    const overdueItemsQuery = (() => {
      let q = sb.from('order_items')
        .select('order_id, orders!inner(store_id, status)')
        .eq('orders.status', 'active')
        .lt('dropoff_datetime', new Date().toISOString());
      if (storeFilter) q = q.eq('orders.store_id', storeFilter);
      return q;
    })();

    const [allResults, cashupResult, pendingTasksResult, upcomingTransfersResult, overdueResult] =
      await Promise.all([
        Promise.all([...operationalQueries, ...financialQueries.filter(Boolean)]),
        cashupStatusQuery,
        pendingTasksQuery,
        upcomingTransfersQuery,
        overdueItemsQuery,
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

    const ninePmAddonOrderIds = new Set<string>(
      (dataMap.get('ninepmAddons') ?? [])
        .map((a) => a.order_id as string)
        .filter(Boolean),
    );

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

    function buildNinepmVehicles(items: Record<string, unknown>[], ninePmOrderIds: Set<string>, sid?: string): NinePmVehicle[] {
      const result: NinePmVehicle[] = [];
      for (const item of items) {
        const orderInfo = item.orders as {
          id: string;
          store_id: string;
          status: string;
          balance_due: number | null;
          security_deposit: number | null;
          booking_customer_name: string | null;
          customers: { name: string; mobile: string | null } | null;
        } | null;
        if (!orderInfo || orderInfo.status !== 'active') continue;
        if (sid && orderInfo.store_id !== sid) continue;

        const orderId = item.order_id as string | null;
        if (!orderId || !ninePmOrderIds.has(orderId)) continue;

        const dropoff = item.dropoff_datetime as string | null;
        if (!dropoff) continue;

        const dropDate = new Date(dropoff);

        const vehicleId = item.vehicle_id as string | null;
        const vehicleModel = (vehicleId ? fleetModelMap.get(vehicleId) : null) ?? (item.vehicle_name as string) ?? '—';
        const returnTime = dropDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });

        const customerName =
          orderInfo.booking_customer_name?.trim()
          || orderInfo.customers?.name
          || '—';
        const customerMobile = orderInfo.customers?.mobile ?? null;
        const helmetNumbers = (item.helmet_numbers as string | null) ?? null;
        const balanceDue = Number(orderInfo.balance_due ?? 0);
        const securityDeposit = Number(orderInfo.security_deposit ?? 0);
        const vehicleName = (item.vehicle_name as string | null) ?? vehicleModel;

        result.push({
          orderId,
          vehicleModel,
          vehicleName,
          returnTime,
          customerName,
          customerMobile,
          helmetNumbers,
          balanceDue,
          securityDeposit,
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
        const orderData = item.orders as unknown as { store_id: string; status: string } | null;
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

      const tomorrowBookedVehicleIds = new Set<string>();
      for (const item of (dataMap.get('tomorrowBookings') ?? [])) {
        const orderData = item.orders as unknown as { store_id: string; status: string } | null;
        if (!orderData) continue;
        if (sid && orderData.store_id !== sid) continue;
        const vid = item.vehicle_id as string | undefined;
        if (vid) tomorrowBookedVehicleIds.add(vid);
      }
      const tomorrowAvailable = rentableFleet.filter((v) => !tomorrowBookedVehicleIds.has(v.id as string)).length;

      const activeCount = storeActiveOrders.length;
      const fleetUtilisation = totalRentable > 0
        ? Math.round((storeActiveVehicleIds.size / totalRentable) * 100)
        : 0;

      const depositsWithheld = storeActiveOrders.reduce(
        (sum, o) => sum + Number(o.security_deposit ?? 0), 0,
      );

      const ninepmVehicles = buildNinepmVehicles(ninepmCandidates, ninePmAddonOrderIds, sid);
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
      let bookingSourceSplit: StoreMetrics['bookingSourceSplit'] = null;
      let deviceSplit: StoreMetrics['deviceSplit'] = null;

      const balanceData = dataMap.get('cashBalances') ?? [];
      const balanceMap = new Map<string, { name: string; debit: number; credit: number }>();
      for (const row of balanceData) {
        const acct = row.chart_of_accounts as { name: string; account_type: string; store_id?: string | null } | null;
        if (!acct || acct.account_type !== 'Asset') continue;
        const lowerName = acct.name.toLowerCase();
        if (!lowerName.includes('cash') && !lowerName.includes('bank') && !lowerName.includes('gcash') && !lowerName.includes('float')) continue;
        // Company-level accounts (shared across stores) always show their full balance —
        // filtering them by store_id would give a misleading partial balance for a shared bank account.
        const isCompanyAccount = !acct.store_id || acct.store_id === 'company';
        if (sid && !isCompanyAccount && row.store_id !== sid) continue;
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

      const bookingSourceRaw = dataMap.get('bookingSourceData') ?? [];
      const storeBookingRows = sid
        ? bookingSourceRaw.filter((r) => r.store_id === sid)
        : bookingSourceRaw;
      let bDirectWeb = 0;
      let bWalkIn = 0;
      let bWooCommerce = 0;
      let dMobile = 0;
      let dDesktop = 0;
      for (const row of storeBookingRows) {
        const source = row.source as string | null;
        const channel = row.booking_channel as string | null;
        if (channel === 'direct' || source === 'lolas-direct' || source === 'bass-direct') {
          bDirectWeb++;
        } else if (source === 'lolas-walkin' || source === 'bass-walkin' || channel === 'walk-in') {
          bWalkIn++;
        } else if ((source === 'lolas' || source === 'bass') && (channel === null || channel === 'woo')) {
          bWooCommerce++;
        }
        const dt = row.device_type as string | null;
        if (dt === 'mobile') dMobile++;
        else if (dt === 'desktop') dDesktop++;
      }
      bookingSourceSplit = {
        directWeb: bDirectWeb,
        walkIn: bWalkIn,
        wooCommerce: bWooCommerce,
        total: storeBookingRows.length,
      };
      deviceSplit = {
        mobile: dMobile,
        desktop: dDesktop,
        total: dMobile + dDesktop,
      };

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
        tomorrowAvailable,
        bookingSourceSplit,
        deviceSplit,
      };
    }

    const storeIds = ['store-lolas', 'store-bass'] as const;
    const stores: Record<string, StoreMetrics> = {};

    stores['combined'] = buildStoreMetrics(undefined);
    for (const sid of storeIds) {
      stores[sid] = buildStoreMetrics(sid);
    }

    // ── Quick Stats ──────────────────────────────────────────────────────────
    // cashupStatus: 'open' if any store has an unsubmitted reconciliation today,
    //               'closed' if all present records are locked, null if none started
    const cashupRows = (cashupResult.data ?? []) as Array<{ store_id: string; is_locked: boolean }>;
    // For a single-store view, closed = that store's row is locked.
    // For the combined view, closed = every active store has a locked row (not just
    // every row that happens to exist), so one store reconciling early doesn't
    // make the dashboard report the other store as done.
    const cashupStatus: 'open' | 'closed' | null =
      cashupRows.length === 0
        ? null
        : storeFilter
          ? (cashupRows.every((r) => r.is_locked) ? 'closed' : 'open')
          : (cashupRows.filter((r) => r.is_locked).length === storeIds.length ? 'closed' : 'open');

    const pendingInboxCount: number = pendingTasksResult.count ?? 0;
    const upcomingTransfersCount: number = upcomingTransfersResult.count ?? 0;

    const overdueItems = (overdueResult.data ?? []) as unknown as Array<{
      order_id: string;
      orders: { store_id: string; status: string } | Array<{ store_id: string; status: string }>;
    }>;
    const overdueOrdersCount = new Set(overdueItems.map((i) => i.order_id)).size;

    const baseMetrics = storeFilter
      ? (stores[storeFilter] ?? emptyMetrics(canViewFinancial))
      : stores['combined'];

    const quickStats = {
      activeOrdersCount: baseMetrics.activeRentals,
      revenueToday: baseMetrics.todayRevenue ?? 0,
      cashupStatus,
      pendingInboxCount,
      upcomingTransfersCount,
      overdueOrdersCount,
    };
    // ─────────────────────────────────────────────────────────────────────────

    if (storeFilter) {
      res.json({
        success: true,
        data: {
          date: manilaDate,
          stores: {
            [storeFilter]: stores[storeFilter] ?? emptyMetrics(canViewFinancial),
          },
          ...quickStats,
        },
      });
    } else {
      res.json({
        success: true,
        data: { date: manilaDate, stores, ...quickStats },
      });
    }
  } catch (err) {
    next(err);
  }
});

// ── Charity impact — shared query helper ──────────────────────────────────────
const CHARITY_OPENING_BALANCE = 307995;
const CHARITY_PENDING_LEGACY = 2933;

async function queryCharityImpact(sb: ReturnType<typeof getSupabaseClient>) {
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [bookingRes, annualRes] = await Promise.all([
    sb
      .from('orders_raw')
      .select('charity_donation')
      .not('charity_donation', 'is', null)
      .gt('charity_donation', 0),
    sb
      .from('journal_entries')
      .select('debit')
      .eq('account_id', 'CHARITY-EXPENSE')
      .neq('reference_type', 'opening_balance')
      .gte('date', yearStart),
  ]);

  const ordersCharitySum = (bookingRes.data ?? []).reduce(
    (sum, r) => sum + Number((r as { charity_donation?: number | null }).charity_donation ?? 0),
    0,
  );
  const bookingContributions = CHARITY_PENDING_LEGACY + ordersCharitySum;
  const totalRaised = CHARITY_OPENING_BALANCE + bookingContributions;
  const totalDonated = CHARITY_OPENING_BALANCE;
  const pendingPayout = totalRaised - totalDonated;

  const annualDonated = (annualRes.data ?? []).reduce(
    (sum, r) => sum + Number((r as { debit?: number | null }).debit ?? 0),
    0,
  );

  return {
    openingBalance: CHARITY_OPENING_BALANCE,
    totalRaised: Math.round(totalRaised * 100) / 100,
    totalDonated: Math.round(totalDonated * 100) / 100,
    pendingPayout: Math.round(pendingPayout * 100) / 100,
    bookingContributions: Math.round(bookingContributions * 100) / 100,
    annualCap: 100000,
    annualDonated: Math.round(annualDonated * 100) / 100,
  };
}

// ── GET /charity-donations (authenticated) ────────────────────────────────────
router.get('/charity-donations', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('orders_raw')
      .select('id, customer_name, order_reference, charity_donation, created_at')
      .not('charity_donation', 'is', null)
      .gt('charity_donation', 0)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = (data ?? []).map((r) => ({
      id: (r as { id: string }).id,
      customerName: (r as { customer_name?: string | null }).customer_name ?? null,
      orderReference: (r as { order_reference?: string | null }).order_reference ?? null,
      charityDonation: Number((r as { charity_donation: number }).charity_donation),
      createdAt: (r as { created_at: string }).created_at,
    }));

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /charity-impact (authenticated) ──────────────────────────────────────
router.get('/charity-impact', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const impact = await queryCharityImpact(sb);
    res.json({ success: true, data: impact });
  } catch (err) {
    next(err);
  }
});

// ── GET /availability-detail ──────────────────────────────────────────────────
router.get('/availability-detail', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const storeIdParam = req.query.storeId as string | undefined;
    const dateParam = req.query.date as string | undefined;
    const targetDate = dateParam ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

    const [fleetRes, fleetStatusRes, orderItemsRes, vehicleModelsRes] = await Promise.all([
      sb
        .from('fleet')
        .select('id, name, model_id, status, surf_rack, store_id'),

      sb
        .from('fleet_statuses')
        .select('id, name, is_rentable'),

      sb
        .from('order_items')
        .select(`
          vehicle_id,
          vehicle_name,
          dropoff_datetime,
          orders!inner(store_id, status)
        `)
        .in('orders.status', ['active', 'confirmed'])
        .lt('pickup_datetime', `${targetDate}T23:59:59+08:00`)
        .gt('dropoff_datetime', new Date().toISOString()),

      sb
        .from('vehicle_models')
        .select('id, name'),
    ]);

    if (fleetRes.error) throw new Error(fleetRes.error.message);
    if (fleetStatusRes.error) throw new Error(fleetStatusRes.error.message);

    const allFleet = fleetRes.data ?? [];
    const fleetStatuses = fleetStatusRes.data ?? [];
    const orderItems = orderItemsRes.data ?? [];
    const vehicleModels = vehicleModelsRes.data ?? [];

    const rentableStatusIds = new Set(
      fleetStatuses.filter((s) => s.is_rentable).map((s) => s.id as string),
    );
    const rentableStatusNames = new Set(
      fleetStatuses.filter((s) => s.is_rentable).map((s) => s.name as string),
    );

    const storeFleet =
      storeIdParam && storeIdParam !== 'all'
        ? allFleet.filter((v) => v.store_id === storeIdParam)
        : allFleet;

    const rentableFleet = storeFleet.filter(
      (v) => rentableStatusIds.has(v.status as string) || rentableStatusNames.has(v.status as string),
    );

    const bookedVehicleIds = new Set<string>();
    const vehicleDropoffs = new Map<string, string>();

    for (const item of orderItems) {
      const orderData = item.orders as unknown as { store_id: string; status: string } | null;
      if (!orderData) continue;
      if (storeIdParam && storeIdParam !== 'all' && orderData.store_id !== storeIdParam) continue;
      const vid = item.vehicle_id as string | null;
      if (!vid) continue;
      bookedVehicleIds.add(vid);
      const dropoff = item.dropoff_datetime as string | null;
      const existing = vehicleDropoffs.get(vid);
      if (dropoff && (!existing || dropoff > existing)) vehicleDropoffs.set(vid, dropoff);
    }

    const modelNameMap = new Map<string, string>();
    for (const m of vehicleModels) modelNameMap.set(m.id as string, m.name as string);

    const modelMap = new Map<string, {
      modelName: string;
      units: Array<{ id: string; name: string; surfRack: boolean; isBooked: boolean; dropoff: string | null }>;
    }>();

    for (const v of rentableFleet) {
      const modelId = v.model_id as string | null;
      if (!modelId) continue;
      const modelName = modelNameMap.get(modelId) ?? 'Unknown';
      if (!modelMap.has(modelId)) modelMap.set(modelId, { modelName, units: [] });
      const isBooked = bookedVehicleIds.has(v.id as string);
      modelMap.get(modelId)!.units.push({
        id: v.id as string,
        name: v.name as string,
        surfRack: Boolean(v.surf_rack),
        isBooked,
        dropoff: isBooked ? (vehicleDropoffs.get(v.id as string) ?? null) : null,
      });
    }

    const models = [...modelMap.entries()].map(([modelId, { modelName, units }]) => {
      const availableUnits = units.filter((u) => !u.isBooked);
      const bookedUnits = units.filter((u) => u.isBooked && u.dropoff !== null);

      const returningToday = bookedUnits
        .filter((u) => {
          if (!u.dropoff) return false;
          return new Date(u.dropoff).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === targetDate;
        })
        .map((u) => {
          const dropoffDt = new Date(u.dropoff!);
          const availableFrom = new Date(dropoffDt.getTime() + 30 * 60 * 1000);
          return {
            vehicleName: u.name,
            dropoffDatetime: u.dropoff!,
            availableFrom: availableFrom.toLocaleTimeString('en-GB', {
              timeZone: 'Asia/Manila',
              hour: '2-digit',
              minute: '2-digit',
            }),
          };
        })
        .sort((a, b) => a.dropoffDatetime.localeCompare(b.dropoffDatetime));

      return {
        modelId,
        modelName,
        totalUnits: units.length,
        availableNow: availableUnits.length,
        withSurfRack: availableUnits.filter((u) => u.surfRack).length,
        withoutSurfRack: availableUnits.filter((u) => !u.surfRack).length,
        isScooter: !modelName.toLowerCase().includes('tuk'),
        returningToday,
      };
    });

    models.sort((a, b) => {
      if (a.isScooter !== b.isScooter) return a.isScooter ? -1 : 1;
      return a.modelName.localeCompare(b.modelName);
    });

    res.json({ success: true, data: { models } });
  } catch (err) {
    next(err);
  }
});

// ── GET /basket-abandonment ───────────────────────────────────────────────────
router.get('/basket-abandonment', async (req, res, next) => {
  try {
    const user = (req as unknown as { user?: { permissions?: string[] } }).user;
    if (!user?.permissions?.includes(Permission.ViewDashboard)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      return;
    }

    const storeId = req.query.storeId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const sb = getSupabaseClient();

    // Default window: last 30 days in Manila time
    const manilaOffset = 8 * 60 * 60 * 1000;
    const now = new Date();
    const defaultTo = new Date(now.getTime() + manilaOffset);
    const defaultFrom = new Date(defaultTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromIso = from ?? defaultFrom.toISOString();
    const toIso = to ?? defaultTo.toISOString();

    let query = sb
      .from('booking_sessions')
      .select('basket_viewed_at, renter_details_started_at, submitted_at, created_at, interaction_count')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);

    if (storeId && storeId !== 'all') {
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      basket_viewed_at: string | null;
      renter_details_started_at: string | null;
      submitted_at: string | null;
      created_at: string;
      interaction_count: number;
    }>;

    const abandonThreshold = 3 * 60 * 60 * 1000; // 3 hours
    const total = rows.length;
    const basketViewed = rows.filter((r) => r.basket_viewed_at !== null).length;
    const renterStarted = rows.filter((r) => r.renter_details_started_at !== null).length;
    const converted = rows.filter((r) => r.submitted_at !== null).length;
    const abandoned = rows.filter(
      (r) =>
        r.submitted_at === null &&
        now.getTime() - new Date(r.created_at).getTime() > abandonThreshold,
    ).length;
    const conversionRate = total > 0 ? Math.round((converted / total) * 1000) / 10 : 0;

    const avgInteractions = (subset: typeof rows): number | null => {
      const tracked = subset.filter((r) => r.interaction_count > 0);
      if (tracked.length === 0) return null;
      const sum = tracked.reduce((s, r) => s + r.interaction_count, 0);
      return Math.round((sum / tracked.length) * 10) / 10;
    };

    const completedRows = rows.filter((r) => r.submitted_at !== null);
    const abandonedRows = rows.filter(
      (r) =>
        r.submitted_at === null &&
        now.getTime() - new Date(r.created_at).getTime() > abandonThreshold,
    );
    const avgClicksCompleted = avgInteractions(completedRows);
    const avgClicksAbandoned = avgInteractions(abandonedRows);

    res.json({
      success: true,
      data: { total, basketViewed, renterStarted, converted, abandoned, conversionRate, avgClicksCompleted, avgClicksAbandoned },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /chat-summary ─────────────────────────────────────────────────────────
router.get('/chat-summary', async (req, res, next) => {
  try {
    const user = (req as unknown as { user?: { permissions?: string[] } }).user;
    if (!user?.permissions?.includes(Permission.ViewDashboard)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      return;
    }

    const sb = getSupabaseClient();

    // Default window: last 30 days in Manila time
    const manilaOffset = 8 * 60 * 60 * 1000;
    const now = new Date();
    const defaultTo = new Date(now.getTime() + manilaOffset);
    const defaultFrom = new Date(defaultTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromIso = (req.query.from as string | undefined) ?? defaultFrom.toISOString();
    const toIso   = (req.query.to   as string | undefined) ?? defaultTo.toISOString();

    const { data, error } = await sb
      .from('chat_sessions')
      .select('started_at, ended_at, page_origin, message_count, handoff_triggered, device_type, topics, messages')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      started_at:        string;
      ended_at:          string | null;
      page_origin:       string | null;
      message_count:     number;
      handoff_triggered: boolean;
      device_type:       string | null;
      topics:            string[] | null;
      messages:          Array<{ role: string; content: string }> | null;
    }>;

    const total       = rows.length;
    const handoffs    = rows.filter((r) => r.handoff_triggered).length;
    const handoffRate = total > 0 ? Math.round((handoffs / total) * 1000) / 10 : 0;

    const avgMessages =
      total > 0
        ? Math.round((rows.reduce((s, r) => s + r.message_count, 0) / total) * 10) / 10
        : 0;

    // Sessions by day (Manila date)
    const byDayMap = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(new Date(r.started_at).getTime() + manilaOffset)
        .toISOString()
        .slice(0, 10);
      byDayMap.set(d, (byDayMap.get(d) ?? 0) + 1);
    }
    const sessionsByDay = [...byDayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({ date, sessions }));

    // Page origin breakdown
    const originMap = new Map<string, number>();
    for (const r of rows) {
      const origin = r.page_origin ?? 'unknown';
      originMap.set(origin, (originMap.get(origin) ?? 0) + 1);
    }
    const byPageOrigin = [...originMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([page, count]) => ({ page, count }));

    // Device split
    const deviceMap = new Map<string, number>();
    for (const r of rows) {
      const d = r.device_type ?? 'unknown';
      deviceMap.set(d, (deviceMap.get(d) ?? 0) + 1);
    }
    const byDevice = [...deviceMap.entries()].map(([device, count]) => ({ device, count }));

    // Topic frequency — from AI-tagged sessions
    const topicMap = new Map<string, number>();
    for (const r of rows) {
      for (const t of (r.topics ?? [])) {
        topicMap.set(t, (topicMap.get(t) ?? 0) + 1);
      }
    }
    const topTopics = [...topicMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([topic, count]) => ({ topic, count }));

    // Top questions — first user message from each completed session transcript
    const questionMap = new Map<string, number>();
    for (const r of rows) {
      const msgs = r.messages ?? [];
      const firstUser = msgs.find((m) => m.role === 'user');
      if (!firstUser) continue;
      // Normalise: lowercase, collapse whitespace, trim to 200 chars
      const key = firstUser.content.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
      if (key.length > 0) questionMap.set(key, (questionMap.get(key) ?? 0) + 1);
    }
    const topQuestions = [...questionMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([question, count]) => ({ question, count }));

    res.json({
      success: true,
      data: {
        total,
        handoffs,
        handoffRate,
        avgMessages,
        sessionsByDay,
        byPageOrigin,
        byDevice,
        topTopics,
        topQuestions,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /partner-summary — partner attribution stats for dashboard ─────────────
// Returns current-month commissionable bookings per partner, for the store filter.
router.get('/partner-summary', async (req, res, next) => {
  try {
    const storeIdParam = req.query.storeId as string | undefined;
    const storeFilter = storeIdParam && storeIdParam !== 'all' ? storeIdParam : undefined;
    const sb = getSupabaseClient();

    const manilaDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const currentMonthValue = manilaDate.slice(0, 7);

    // Fetch active partners
    let partnersQuery = sb
      .from('accommodation_partners')
      .select('id, store_id, name, slug')
      .eq('active', true);
    if (storeFilter) partnersQuery = partnersQuery.eq('store_id', storeFilter);

    const { data: partners, error: partnerErr } = await partnersQuery;
    if (partnerErr) throw new Error(partnerErr.message);

    if (!partners || partners.length === 0) {
      res.json({ success: true, data: { totalAttributedBookings: 0, totalCommission: 0, byPartner: [] } });
      return;
    }

    type PartnerRow = {
      id: string; store_id: string; name: string; slug: string;
    };

    const rows = await Promise.all((partners as PartnerRow[]).map(async (p) => {
      const stats = await getPartnerCommissionStats(p.id, currentMonthValue);
      return {
        partnerId: p.id,
        partnerName: p.name,
        slug: p.slug,
        totalBookings: stats.totalBookings,
        commissionableBookings: stats.commissionableBookings,
        commissionDue: stats.totalCommission,
      };
    }));

    const byPartner = rows
      .filter((p) => p.totalBookings > 0)
      .sort((a, b) => b.commissionDue - a.commissionDue);

    const totalAttributedBookings = byPartner.reduce((s, p) => s + p.totalBookings, 0);
    const totalCommission = byPartner.reduce((s, p) => s + p.commissionDue, 0);

    res.json({
      success: true,
      data: {
        totalAttributedBookings,
        totalCommission: Math.round(totalCommission * 100) / 100,
        byPartner,
      },
    });
  } catch (err) {
    next(err);
  }
});

function normalizeAccomName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

const REFERRAL_LABELS: Record<string, string> = {
  google: 'Google / Search engine',
  friend: 'A friend or family member',
  accommodation: 'My hotel or accommodation',
  travel_site: 'A travel website',
  ai: 'AI assistant',
  social_media: 'Social media',
  repeat: "Repeat customer",
  walk_in: 'Saw shop in person',
  other: 'Other',
};

router.get('/referral-stats', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const storeFilter = typeof req.query.storeId === 'string' && req.query.storeId ? req.query.storeId : null;

    const [waiverResult, aliasResult] = await Promise.all([
      (() => {
        let q = sb
          .from('waivers')
          .select('referral_source, referral_detail, store_id')
          .eq('status', 'signed')
          .not('referral_source', 'is', null);
        if (storeFilter) q = q.eq('store_id', storeFilter);
        return q;
      })(),
      sb.from('accommodation_aliases').select('raw_name, canonical_name'),
    ]);

    if (waiverResult.error) throw new Error(waiverResult.error.message);
    if (aliasResult.error) throw new Error(aliasResult.error.message);

    type WaiverRow = { referral_source: string | null; referral_detail: string | null };
    type AliasRow = { raw_name: string; canonical_name: string };

    // Build alias lookup: normalised raw → canonical
    const aliasMap = new Map<string, string>();
    for (const a of (aliasResult.data ?? []) as AliasRow[]) {
      aliasMap.set(normalizeAccomName(a.raw_name), a.canonical_name);
    }

    const counts = new Map<string, number>();
    const accommodationCounts = new Map<string, number>();

    for (const row of (waiverResult.data ?? []) as WaiverRow[]) {
      const src = row.referral_source;
      if (!src) continue;
      counts.set(src, (counts.get(src) ?? 0) + 1);

      if (src === 'accommodation' && row.referral_detail) {
        const normalised = normalizeAccomName(row.referral_detail);
        if (!normalised) continue;
        const display = aliasMap.get(normalised) ?? row.referral_detail.trim();
        accommodationCounts.set(display, (accommodationCounts.get(display) ?? 0) + 1);
      }
    }

    const total = Array.from(counts.values()).reduce((s, n) => s + n, 0);

    const breakdown = Array.from(counts.entries())
      .map(([source, count]) => ({
        source,
        label: REFERRAL_LABELS[source] ?? source,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const accommodationBreakdown = Array.from(accommodationCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Collect raw names that have no alias (for the alias management UI)
    const unmatchedRawNames = Array.from(
      new Set(
        ((waiverResult.data ?? []) as WaiverRow[])
          .filter((r) => r.referral_source === 'accommodation' && r.referral_detail)
          .map((r) => normalizeAccomName(r.referral_detail!))
          .filter((n) => n && !aliasMap.has(n)),
      ),
    ).sort();

    res.json({ success: true, data: { total, breakdown, accommodationBreakdown, unmatchedRawNames } });
  } catch (err) {
    next(err);
  }
});

// ── Accommodation alias CRUD ──────────────────────────────────────────────────

router.get('/accommodation-aliases', async (req, res, next) => {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('accommodation_aliases')
      .select('id, raw_name, canonical_name, created_at')
      .order('canonical_name', { ascending: true });
    if (error) throw new Error(error.message);
    res.json({ success: true, data: data ?? [] });
  } catch (err) {
    next(err);
  }
});

router.post('/accommodation-aliases', async (req, res, next) => {
  try {
    if (!req.user?.permissions?.includes(Permission.EditSettings)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Requires can_edit_settings' } });
      return;
    }
    const rawName = typeof req.body.rawName === 'string' ? req.body.rawName.trim() : '';
    const canonicalName = typeof req.body.canonicalName === 'string' ? req.body.canonicalName.trim() : '';
    if (!rawName || !canonicalName) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'rawName and canonicalName are required' } });
      return;
    }
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('accommodation_aliases')
      .upsert({ raw_name: normalizeAccomName(rawName), canonical_name: canonicalName }, { onConflict: 'raw_name' })
      .select('id, raw_name, canonical_name')
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.delete('/accommodation-aliases/:id', async (req, res, next) => {
  try {
    if (!req.user?.permissions?.includes(Permission.EditSettings)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Requires can_edit_settings' } });
      return;
    }
    const { id } = req.params;
    const sb = getSupabaseClient();
    const { error } = await sb.from('accommodation_aliases').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRoutes, queryCharityImpact, CHARITY_OPENING_BALANCE, CHARITY_PENDING_LEGACY };
