import type { DashboardInsights } from '../../api/dashboard.js';
import type { AnalyticsData } from '../../api/analytics.js';
import { formatPeso, pctChange, shortDate } from '../../components/dashboard/ui/format.js';

export type InsightTone = 'good' | 'warning' | 'info';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  href?: string;
}

export interface InsightInputs {
  insights?: DashboardInsights | null;
  analytics?: AnalyticsData | null;
  /** This month to date vs all of last month, per expense category. */
  expensesByCategory?: Array<{ category: string; thisMonth: number; lastMonth: number }>;
  basket?: { total: number; conversionRate: number } | null;
  chat?: { total: number; handoffRate: number } | null;
}

export const MAX_INSIGHTS = 6;
const PACE_THRESHOLD_PCT = 5;
const LOW_MARGIN_PCT = 15;
const NEAR_SOLD_OUT_PCT = 90;
const BUSY_PCT = 75;
const QUIET_PCT = 30;
const EXPENSE_SPIKE_RATIO = 1.25;
const EXPENSE_SPIKE_MIN = 2000;
const LOW_UTILISATION = 0.4;
const HIGH_UTILISATION = 0.85;
const LOW_CONVERSION_PCT = 20;
const MIN_BASKET_SESSIONS = 20;
const HIGH_HANDOFF_PCT = 20;
const MIN_CHAT_SESSIONS = 10;

const WEEKDAY_NAMES: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

function dayName(iso: string): string {
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', weekday: 'long' });
}

const TONE_ORDER: Record<InsightTone, number> = { warning: 0, good: 1, info: 2 };

/** Turns dashboard numbers into short, plain-English observations, most urgent first. */
export function buildInsights({ insights, analytics, expensesByCategory, basket, chat }: InsightInputs): Insight[] {
  const out: Insight[] = [];

  const mtd = insights?.mtd;
  if (mtd) {
    const pace = pctChange(mtd.revenue, mtd.lastMonth.revenue);
    if (pace != null) {
      const versus = `${formatPeso(mtd.revenue)} so far vs ${formatPeso(mtd.lastMonth.revenue)} by day ${mtd.dayOfMonth} last month.`;
      if (pace >= PACE_THRESHOLD_PCT) {
        out.push({ id: 'pace', tone: 'good', title: `Revenue is ${pace.toFixed(0)}% ahead of last month`, detail: versus });
      } else if (pace <= -PACE_THRESHOLD_PCT) {
        out.push({
          id: 'pace',
          tone: 'warning',
          title: `Revenue is ${Math.abs(pace).toFixed(0)}% behind last month`,
          detail: `${versus} Check the next 7 days for quiet days to promote.`,
        });
      } else {
        out.push({ id: 'pace', tone: 'info', title: 'Revenue is on par with last month', detail: versus });
      }
    }

    if (mtd.revenue > 0) {
      const margin = (mtd.profit / mtd.revenue) * 100;
      if (mtd.profit < 0) {
        out.push({
          id: 'margin',
          tone: 'warning',
          title: 'Spending more than earning this month',
          detail: `Recorded expenses are ${formatPeso(mtd.expenses)} against ${formatPeso(mtd.revenue)} revenue.`,
          href: '/expenses',
        });
      } else if (margin < LOW_MARGIN_PCT) {
        out.push({
          id: 'margin',
          tone: 'warning',
          title: `Profit margin is only ${margin.toFixed(0)}%`,
          detail: 'Review the biggest expense categories below.',
          href: '/expenses',
        });
      }
    }
  }

  const upcoming = insights?.next7Days ?? [];
  const busiest = [...upcoming].sort((a, b) => b.bookedPct - a.bookedPct)[0];
  if (busiest && busiest.bookedPct >= BUSY_PCT) {
    const nearlyFull = busiest.bookedPct >= NEAR_SOLD_OUT_PCT;
    out.push({
      id: 'busy-day',
      tone: nearlyFull ? 'warning' : 'good',
      title: `${dayName(busiest.date)} ${shortDate(busiest.date)} is ${busiest.bookedPct}% booked`,
      detail: nearlyFull
        ? 'Nearly sold out. Hold back discounts and make sure every bike is road-ready.'
        : 'Strong demand. A good day to hold firm on price.',
      href: '/orders/inbox',
    });
  }
  const quiet = upcoming.slice(1, 4).find((d) => d.bookedPct <= QUIET_PCT);
  if (quiet && insights && insights.rentableFleetSize > 0) {
    out.push({
      id: 'quiet-day',
      tone: 'info',
      title: `${dayName(quiet.date)} is only ${quiet.bookedPct}% booked`,
      detail: 'A good day for a promotion, or to schedule maintenance.',
    });
  }

  const spike = (expensesByCategory ?? [])
    .filter((e) => e.lastMonth > 0 && e.thisMonth >= EXPENSE_SPIKE_MIN && e.thisMonth > e.lastMonth * EXPENSE_SPIKE_RATIO)
    .sort((a, b) => b.thisMonth / b.lastMonth - a.thisMonth / a.lastMonth)[0];
  if (spike) {
    const up = pctChange(spike.thisMonth, spike.lastMonth) ?? 0;
    out.push({
      id: 'expense-spike',
      tone: 'warning',
      title: `${spike.category} spend is already ${up.toFixed(0)}% above all of last month`,
      detail: `${formatPeso(spike.thisMonth)} so far vs ${formatPeso(spike.lastMonth)} last month.`,
      href: '/expenses',
    });
  }

  const models = (analytics?.fleet.byModel ?? []).filter((m) => m.currentFleetSize >= 2);
  const lowModel = [...models].sort((a, b) => a.utilisationRate - b.utilisationRate)[0];
  if (lowModel && lowModel.utilisationRate < LOW_UTILISATION) {
    out.push({
      id: 'low-model',
      tone: 'warning',
      title: `${lowModel.modelName} is only ${Math.round(lowModel.utilisationRate * 100)}% utilised`,
      detail: `Over the last 30 days with ${lowModel.currentFleetSize} units. Consider promoting it, or selling a unit.`,
      href: '/analytics',
    });
  }
  const highModel = [...models].sort((a, b) => b.utilisationRate - a.utilisationRate)[0];
  if (highModel && highModel.utilisationRate >= HIGH_UTILISATION) {
    out.push({
      id: 'high-model',
      tone: 'good',
      title: `${highModel.modelName} is ${Math.round(highModel.utilisationRate * 100)}% utilised`,
      detail: highModel.fleetDelta > 0
        ? `Demand supports about ${highModel.fleetDelta} more ${highModel.fleetDelta === 1 ? 'unit' : 'units'}.`
        : 'Your best-performing model. Consider adding a unit before peak season.',
      href: '/analytics',
    });
  }

  if (basket && basket.total >= MIN_BASKET_SESSIONS && basket.conversionRate < LOW_CONVERSION_PCT) {
    out.push({
      id: 'conversion',
      tone: 'warning',
      title: `Only ${basket.conversionRate}% of website baskets become bookings`,
      detail: 'See the checkout funnel on the Marketing tab to find where people drop off.',
      href: '/dashboard?tab=marketing',
    });
  }

  if (chat && chat.total >= MIN_CHAT_SESSIONS && chat.handoffRate > HIGH_HANDOFF_PCT) {
    out.push({
      id: 'chat-handoff',
      tone: 'warning',
      title: `Lolo hands ${chat.handoffRate}% of chats to WhatsApp`,
      detail: 'Check the top questions on the Marketing tab and add those answers to Lolo.',
      href: '/dashboard?tab=marketing',
    });
  }

  const topWeekday = [...(insights?.weekdayDemand ?? [])].sort((a, b) => b.pickups - a.pickups)[0];
  if (topWeekday && topWeekday.pickups > 0) {
    out.push({
      id: 'weekday',
      tone: 'info',
      title: `${WEEKDAY_NAMES[topWeekday.day] ?? topWeekday.day} is your busiest pickup day`,
      detail: `About ${topWeekday.avgPerWeek} pickups on a typical ${WEEKDAY_NAMES[topWeekday.day] ?? topWeekday.day}. Roster extra staff.`,
    });
  }

  const repeat = analytics?.bookings.repeatCustomerRate;
  if (repeat != null && (analytics?.bookings.totalUniqueCustomers ?? 0) > 0) {
    const pct = Math.round(repeat * 100);
    out.push({
      id: 'repeat',
      tone: pct >= 15 ? 'good' : 'info',
      title: `${pct}% of customers are returning`,
      detail: pct >= 15
        ? 'Loyal customers are a strong sign. Keep the follow-up messages going.'
        : 'A loyalty discount or follow-up message could bring more people back.',
    });
  }

  return out
    .map((insight, index) => ({ insight, index }))
    .sort((a, b) => TONE_ORDER[a.insight.tone] - TONE_ORDER[b.insight.tone] || a.index - b.index)
    .slice(0, MAX_INSIGHTS)
    .map(({ insight }) => insight);
}
