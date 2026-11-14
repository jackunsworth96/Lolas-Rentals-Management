const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAY_LOOKBACK_DAYS = 90;
export const MONTHLY_LOOKBACK = 12;

export interface AmountAt {
  amount: number | string | null;
  created_at: string;
}

export interface ExpenseRow {
  amount: number | string | null;
  date: string;
}

export interface BookingItemRow {
  id: string;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
}

export interface OrderValueRow {
  final_total: number | string | null;
  order_date: string;
}

export interface InsightsInput {
  /** Manila calendar date, YYYY-MM-DD. */
  today: string;
  /** Current time; rentals that ended before it don't count toward today's booked share. */
  nowMs?: number;
  payments: AmountAt[];
  miscSales: AmountAt[];
  expenses: ExpenseRow[];
  /** Live (active/confirmed) rental items that end after the start of today. */
  upcomingItems: BookingItemRow[];
  /** Live or completed rental items picked up in the weekday lookback window. */
  recentPickups: Array<{ pickup_datetime: string | null }>;
  /** Non-cancelled orders dated this month or last month. */
  orders: OrderValueRow[];
  /** Vehicles in the working fleet: free now or currently out on rent (not in repair, sold, etc.). */
  rentableFleetSize: number;
}

export interface PeriodTotals {
  revenue: number;
  expenses: number;
  profit: number;
  bookings: number;
  avgBookingValue: number;
}

export interface DashboardInsights {
  today: string;
  rentableFleetSize: number;
  mtd: PeriodTotals & { dayOfMonth: number; lastMonth: PeriodTotals };
  monthly: Array<{ month: string; label: string; revenue: number; expenses: number; profit: number }>;
  dailyRevenue: Array<{ day: number; thisMonth: number | null; lastMonth: number | null }>;
  next7Days: Array<{ date: string; pickups: number; returns: number; onRent: number; bookedPct: number }>;
  weekdayDemand: Array<{ day: (typeof WEEKDAYS)[number]; pickups: number; avgPerWeek: number }>;
}

export function manilaDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(month: string, months: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** First day of the oldest month the monthly chart covers. */
export function insightsWindowStart(today: string): string {
  return `${addMonths(today.slice(0, 7), -(MONTHLY_LOOKBACK - 1))}-01`;
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

function manilaDayBounds(date: string): [number, number] {
  const start = new Date(`${date}T00:00:00+08:00`).getTime();
  return [start, start + DAY_MS];
}

export function buildDashboardInsights(input: InsightsInput): DashboardInsights {
  const { today } = input;
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonths(thisMonth, -1);
  const dayOfMonth = Number(today.slice(8, 10));
  const lastMonthCutoff = Math.min(dayOfMonth, daysInMonth(lastMonth));

  const revenueByDate = new Map<string, number>();
  for (const row of [...input.payments, ...input.miscSales]) {
    const date = manilaDateOf(row.created_at);
    revenueByDate.set(date, (revenueByDate.get(date) ?? 0) + num(row.amount));
  }
  const expensesByDate = new Map<string, number>();
  for (const row of input.expenses) {
    expensesByDate.set(row.date, (expensesByDate.get(row.date) ?? 0) + num(row.amount));
  }

  const sumWhere = (map: Map<string, number>, month: string, maxDay: number) => {
    let total = 0;
    for (const [date, amount] of map) {
      if (date.slice(0, 7) === month && Number(date.slice(8, 10)) <= maxDay) total += amount;
    }
    return total;
  };

  const periodTotals = (month: string, maxDay: number): PeriodTotals => {
    const revenue = sumWhere(revenueByDate, month, maxDay);
    const expenses = sumWhere(expensesByDate, month, maxDay);
    const orders = input.orders.filter(
      (o) => o.order_date.slice(0, 7) === month && Number(o.order_date.slice(8, 10)) <= maxDay,
    );
    const orderValue = orders.reduce((s, o) => s + num(o.final_total), 0);
    return {
      revenue: round2(revenue),
      expenses: round2(expenses),
      profit: round2(revenue - expenses),
      bookings: orders.length,
      avgBookingValue: orders.length > 0 ? round2(orderValue / orders.length) : 0,
    };
  };

  const monthly: DashboardInsights['monthly'] = [];
  for (let i = MONTHLY_LOOKBACK - 1; i >= 0; i--) {
    const month = addMonths(thisMonth, -i);
    const revenue = sumWhere(revenueByDate, month, 31);
    const expenses = sumWhere(expensesByDate, month, 31);
    const [y, m] = month.split('-');
    monthly.push({
      month,
      label: `${MONTH_LABELS[Number(m) - 1]} ${y.slice(2)}`,
      revenue: round2(revenue),
      expenses: round2(expenses),
      profit: round2(revenue - expenses),
    });
  }

  const dailyRevenue: DashboardInsights['dailyRevenue'] = [];
  let cumThis = 0;
  let cumLast = 0;
  const lastMonthDays = daysInMonth(lastMonth);
  for (let day = 1; day <= Math.max(daysInMonth(thisMonth), lastMonthDays); day++) {
    const dd = String(day).padStart(2, '0');
    cumThis += revenueByDate.get(`${thisMonth}-${dd}`) ?? 0;
    cumLast += revenueByDate.get(`${lastMonth}-${dd}`) ?? 0;
    dailyRevenue.push({
      day,
      thisMonth: day <= dayOfMonth ? round2(cumThis) : null,
      lastMonth: day <= lastMonthDays ? round2(cumLast) : null,
    });
  }

  const next7Days: DashboardInsights['next7Days'] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const [dayStart, end] = manilaDayBounds(date);
    // Rentals already returned earlier today no longer occupy a vehicle.
    const start = i === 0 && input.nowMs != null ? Math.max(dayStart, input.nowMs) : dayStart;
    let pickups = 0;
    let returns = 0;
    const events: Array<[number, number]> = [];
    for (const item of input.upcomingItems) {
      if (!item.pickup_datetime || !item.dropoff_datetime) continue;
      const p = new Date(item.pickup_datetime).getTime();
      const d = new Date(item.dropoff_datetime).getTime();
      if (p >= dayStart && p < end) pickups++;
      if (d >= dayStart && d < end) returns++;
      if (p < end && d > start) {
        events.push([Math.max(p, start), 1], [Math.min(d, end), -1]);
      }
    }
    // Peak number of vehicles out at the same moment: a bike returned at 10am and
    // re-rented at 2pm is one vehicle, not two.
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let out = 0;
    let onRent = 0;
    for (const [, delta] of events) {
      out += delta;
      onRent = Math.max(onRent, out);
    }
    next7Days.push({
      date,
      pickups,
      returns,
      onRent,
      bookedPct: input.rentableFleetSize > 0
        ? Math.min(100, Math.round((onRent / input.rentableFleetSize) * 100))
        : 0,
    });
  }

  const weekdayCounts = new Array<number>(7).fill(0);
  const windowStart = addDays(today, -WEEKDAY_LOOKBACK_DAYS);
  for (const row of input.recentPickups) {
    if (!row.pickup_datetime) continue;
    const date = manilaDateOf(row.pickup_datetime);
    if (date < windowStart || date > today) continue;
    const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay();
    weekdayCounts[(jsDay + 6) % 7]++;
  }
  const weeks = WEEKDAY_LOOKBACK_DAYS / 7;
  const weekdayDemand = WEEKDAYS.map((day, i) => ({
    day,
    pickups: weekdayCounts[i],
    avgPerWeek: Math.round((weekdayCounts[i] / weeks) * 10) / 10,
  }));

  const current = periodTotals(thisMonth, dayOfMonth);
  return {
    today,
    rentableFleetSize: input.rentableFleetSize,
    mtd: { ...current, dayOfMonth, lastMonth: periodTotals(lastMonth, lastMonthCutoff) },
    monthly,
    dailyRevenue,
    next7Days,
    weekdayDemand,
  };
}
