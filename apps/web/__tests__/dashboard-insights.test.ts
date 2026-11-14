// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildInsights, MAX_INSIGHTS } from '../src/pages/dashboard/insights.js';
import type { DashboardInsights } from '../src/api/dashboard.js';
import type { AnalyticsData, FleetModelMetrics } from '../src/api/analytics.js';

const period = { revenue: 0, expenses: 0, profit: 0, bookings: 0, avgBookingValue: 0 };

function makeInsights(overrides: Partial<DashboardInsights> = {}): DashboardInsights {
  return {
    today: '2026-11-14',
    rentableFleetSize: 20,
    mtd: { ...period, dayOfMonth: 14, lastMonth: { ...period } },
    monthly: [],
    dailyRevenue: [],
    next7Days: [],
    weekdayDemand: [],
    ...overrides,
  };
}

function model(overrides: Partial<FleetModelMetrics>): FleetModelMetrics {
  return {
    modelId: 'm',
    modelName: 'Model',
    currentFleetSize: 4,
    rentalDaysUsed: 0,
    availableFleetDays: 0,
    utilisationRate: 0.6,
    recommendedFleetSize: 4,
    fleetDelta: 0,
    avgRentalDuration: 0,
    revPAB: 0,
    extensionRate: 0,
    totalRentals: 0,
    ...overrides,
  };
}

function makeAnalytics(byModel: FleetModelMetrics[]): AnalyticsData {
  return {
    period: { days: 30, from: '', to: '' },
    fleet: {
      byModel,
      overall: { utilisationRate: 0, revPAB: 0, extensionRate: 0, cancellationRate: 0, cancelledBookings: 0, bookingsPlaced: 0, totalRentals: 0 },
    },
    bookings: {
      leadTimeBuckets: { same_day: 0, one_to_three: 0, four_to_seven: 0, seven_plus: 0 },
      addonAttachRate: 0,
      repeatCustomerRate: 0,
      totalUniqueCustomers: 0,
      returningCustomers: 0,
      walkInShare: 0,
      walkInResponses: 0,
    },
    affiliates: { totalBookings: 0, attributedBookings: 0, attributedSharePct: 0, minBookingsForDailyAvg: 0, byPartner: [] },
    unmetDemand: { trackingSince: null, total: 0, website: 0, partnerPortal: 0, walkIn: 0, bookedAnyway: 0, byModel: [] },
  };
}

describe('buildInsights', () => {
  it('returns nothing when there is no data', () => {
    expect(buildInsights({})).toEqual([]);
  });

  it('reports revenue pace against last month', () => {
    const ahead = buildInsights({
      insights: makeInsights({
        mtd: { ...period, revenue: 120_000, profit: 60_000, dayOfMonth: 14, lastMonth: { ...period, revenue: 100_000 } },
      }),
    });
    expect(ahead[0]).toMatchObject({ id: 'pace', tone: 'good', title: 'Revenue is 20% ahead of last month' });

    const behind = buildInsights({
      insights: makeInsights({
        mtd: { ...period, revenue: 80_000, profit: 40_000, dayOfMonth: 14, lastMonth: { ...period, revenue: 100_000 } },
      }),
    });
    expect(behind.find((i) => i.id === 'pace')).toMatchObject({ tone: 'warning', title: 'Revenue is 20% behind last month' });
  });

  it('warns when expenses exceed revenue', () => {
    const result = buildInsights({
      insights: makeInsights({
        mtd: { ...period, revenue: 50_000, expenses: 70_000, profit: -20_000, dayOfMonth: 14, lastMonth: { ...period } },
      }),
    });
    expect(result.find((i) => i.id === 'margin')).toMatchObject({ tone: 'warning', title: 'Spending more than earning this month' });
  });

  it('flags nearly sold-out and quiet days in the next week', () => {
    const result = buildInsights({
      insights: makeInsights({
        next7Days: [
          { date: '2026-11-14', pickups: 3, returns: 2, onRent: 19, bookedPct: 95 },
          { date: '2026-11-15', pickups: 1, returns: 1, onRent: 15, bookedPct: 75 },
          { date: '2026-11-16', pickups: 0, returns: 4, onRent: 5, bookedPct: 25 },
        ],
      }),
    });
    expect(result.find((i) => i.id === 'busy-day')).toMatchObject({ tone: 'warning', title: 'Saturday 14 Nov is 95% booked' });
    expect(result.find((i) => i.id === 'quiet-day')).toMatchObject({ title: 'Monday is only 25% booked' });
  });

  it('picks the biggest expense spike and ignores small amounts', () => {
    const result = buildInsights({
      expensesByCategory: [
        { category: 'Fuel', thisMonth: 6000, lastMonth: 3000 },
        { category: 'Snacks', thisMonth: 900, lastMonth: 100 },
        { category: 'Rent', thisMonth: 20000, lastMonth: 20000 },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'expense-spike', title: 'Fuel spend is already 100% above all of last month' });
  });

  it('calls out under- and over-used vehicle models', () => {
    const result = buildInsights({
      analytics: makeAnalytics([
        model({ modelName: 'Honda Click', utilisationRate: 0.25 }),
        model({ modelName: 'Honda Beat', utilisationRate: 0.92, fleetDelta: 2 }),
        model({ modelName: 'Single TukTuk', utilisationRate: 0.1, currentFleetSize: 1 }),
      ]),
    });
    expect(result.find((i) => i.id === 'low-model')?.title).toBe('Honda Click is only 25% utilised');
    expect(result.find((i) => i.id === 'high-model')?.detail).toBe('Demand supports about 2 more units.');
  });

  it('only flags website conversion and chat handoffs with enough volume', () => {
    expect(buildInsights({ basket: { total: 5, conversionRate: 5 }, chat: { total: 3, handoffRate: 50 } })).toEqual([]);
    const result = buildInsights({ basket: { total: 50, conversionRate: 12 }, chat: { total: 40, handoffRate: 30 } });
    expect(result.map((i) => i.id)).toEqual(['conversion', 'chat-handoff']);
  });

  it('puts warnings first and caps the list', () => {
    const result = buildInsights({
      insights: makeInsights({
        mtd: { ...period, revenue: 80_000, expenses: 75_000, profit: 5_000, dayOfMonth: 14, lastMonth: { ...period, revenue: 100_000 } },
        next7Days: [{ date: '2026-11-14', pickups: 3, returns: 2, onRent: 19, bookedPct: 95 }],
        weekdayDemand: [{ day: 'Sat', pickups: 40, avgPerWeek: 3.1 }],
      }),
      expensesByCategory: [{ category: 'Fuel', thisMonth: 6000, lastMonth: 3000 }],
      analytics: makeAnalytics([model({ modelName: 'Honda Click', utilisationRate: 0.2 })]),
      basket: { total: 50, conversionRate: 12 },
      chat: { total: 40, handoffRate: 30 },
    });
    expect(result).toHaveLength(MAX_INSIGHTS);
    expect(result.every((i) => i.tone === 'warning')).toBe(true);
  });
});
