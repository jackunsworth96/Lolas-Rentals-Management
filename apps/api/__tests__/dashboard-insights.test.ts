import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  buildDashboardInsights,
  insightsWindowStart,
  type InsightsInput,
} from '../src/lib/dashboard-insights.js';

const base: InsightsInput = {
  today: '2026-11-14',
  payments: [],
  miscSales: [],
  expenses: [],
  upcomingItems: [],
  recentPickups: [],
  orders: [],
  rentableFleetSize: 10,
};

describe('dashboard insights date helpers', () => {
  it('rolls days and months across year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(insightsWindowStart('2026-11-14')).toBe('2025-12-01');
  });
});

describe('month-to-date profit', () => {
  it('compares this month with the same day range last month', () => {
    const insights = buildDashboardInsights({
      ...base,
      payments: [
        { amount: 1000, created_at: '2026-11-02T03:00:00Z' },
        { amount: '500', created_at: '2026-10-10T03:00:00Z' },
        // After day 14 of last month, so outside the like-for-like window.
        { amount: 9999, created_at: '2026-10-20T03:00:00Z' },
      ],
      miscSales: [{ amount: 200, created_at: '2026-11-05T03:00:00Z' }],
      expenses: [
        { amount: 300, date: '2026-11-03' },
        { amount: 100, date: '2026-10-01' },
      ],
      orders: [
        { final_total: 1000, order_date: '2026-11-02' },
        { final_total: 2000, order_date: '2026-11-08' },
        { final_total: 800, order_date: '2026-10-04' },
      ],
    });

    expect(insights.mtd).toMatchObject({
      dayOfMonth: 14,
      revenue: 1200,
      expenses: 300,
      profit: 900,
      bookings: 2,
      avgBookingValue: 1500,
    });
    expect(insights.mtd.lastMonth).toMatchObject({ revenue: 500, expenses: 100, profit: 400, bookings: 1 });
  });

  it('attributes a payment to its Manila date, not its UTC date', () => {
    // 23:30 UTC on Oct 31 is 07:30 on Nov 1 in Manila.
    const insights = buildDashboardInsights({
      ...base,
      payments: [{ amount: 400, created_at: '2026-10-31T23:30:00Z' }],
    });
    expect(insights.mtd.revenue).toBe(400);
    expect(insights.mtd.lastMonth.revenue).toBe(0);
  });

  it('builds 12 monthly buckets ending with the current month', () => {
    const insights = buildDashboardInsights({
      ...base,
      payments: [{ amount: 700, created_at: '2026-01-15T03:00:00Z' }],
      expenses: [{ amount: 200, date: '2026-01-20' }],
    });
    expect(insights.monthly).toHaveLength(12);
    expect(insights.monthly[0].month).toBe('2025-12');
    expect(insights.monthly[11]).toMatchObject({ month: '2026-11', label: 'Nov 26' });
    expect(insights.monthly.find((m) => m.month === '2026-01')).toMatchObject({ revenue: 700, expenses: 200, profit: 500 });
  });

  it('accumulates daily revenue and leaves future days empty', () => {
    const insights = buildDashboardInsights({
      ...base,
      payments: [
        { amount: 100, created_at: '2026-11-01T03:00:00Z' },
        { amount: 50, created_at: '2026-11-03T03:00:00Z' },
      ],
    });
    expect(insights.dailyRevenue[0].thisMonth).toBe(100);
    expect(insights.dailyRevenue[2].thisMonth).toBe(150);
    expect(insights.dailyRevenue[14].thisMonth).toBeNull();
    expect(insights.dailyRevenue[30].thisMonth).toBeNull();
    expect(insights.dailyRevenue[30].lastMonth).toBe(0);
  });
});

describe('next 7 days', () => {
  it('counts pickups, returns and vehicles on rent per Manila day', () => {
    const insights = buildDashboardInsights({
      ...base,
      upcomingItems: [
        // Already out, back on the 15th.
        { id: 'a', pickup_datetime: '2026-11-10T02:00:00Z', dropoff_datetime: '2026-11-15T02:00:00Z' },
        // Picked up on the 16th (Manila), back on the 18th.
        { id: 'b', pickup_datetime: '2026-11-15T17:00:00Z', dropoff_datetime: '2026-11-18T02:00:00Z' },
      ],
    });
    const byDate = Object.fromEntries(insights.next7Days.map((d) => [d.date, d]));
    expect(insights.next7Days).toHaveLength(7);
    expect(byDate['2026-11-14']).toMatchObject({ pickups: 0, returns: 0, onRent: 1, bookedPct: 10 });
    expect(byDate['2026-11-15']).toMatchObject({ returns: 1, onRent: 1 });
    expect(byDate['2026-11-16']).toMatchObject({ pickups: 1, onRent: 1 });
    expect(byDate['2026-11-19']).toMatchObject({ onRent: 0, bookedPct: 0 });
  });

  it('counts the peak out at once, not every rental that touches the day', () => {
    const insights = buildDashboardInsights({
      ...base,
      upcomingItems: [
        // Back at 10:00 Manila on the 16th, then the same slot rented again from 14:00.
        { id: 'morning', pickup_datetime: '2026-11-13T02:00:00Z', dropoff_datetime: '2026-11-16T02:00:00Z' },
        { id: 'afternoon', pickup_datetime: '2026-11-16T06:00:00Z', dropoff_datetime: '2026-11-18T02:00:00Z' },
      ],
    });
    expect(insights.next7Days.find((d) => d.date === '2026-11-16')).toMatchObject({ pickups: 1, returns: 1, onRent: 1 });
  });

  it('ignores rentals already returned earlier today', () => {
    const insights = buildDashboardInsights({
      ...base,
      nowMs: Date.parse('2026-11-14T12:00:00+08:00'),
      upcomingItems: [
        { id: 'back-this-morning', pickup_datetime: '2026-11-10T02:00:00Z', dropoff_datetime: '2026-11-14T01:00:00Z' },
        { id: 'still-out', pickup_datetime: '2026-11-10T02:00:00Z', dropoff_datetime: '2026-11-16T01:00:00Z' },
      ],
    });
    expect(insights.next7Days[0]).toMatchObject({ returns: 1, onRent: 1, bookedPct: 10 });
  });
});

describe('weekday demand', () => {
  it('buckets pickups Monday to Sunday', () => {
    const insights = buildDashboardInsights({
      ...base,
      recentPickups: [
        { pickup_datetime: '2026-11-07T02:00:00Z' }, // Saturday
        { pickup_datetime: '2026-11-07T05:00:00Z' }, // Saturday
        { pickup_datetime: '2026-11-09T02:00:00Z' }, // Monday
        { pickup_datetime: '2025-01-01T02:00:00Z' }, // outside the window
      ],
    });
    expect(insights.weekdayDemand.map((d) => d.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(insights.weekdayDemand[5].pickups).toBe(2);
    expect(insights.weekdayDemand[0].pickups).toBe(1);
  });
});
