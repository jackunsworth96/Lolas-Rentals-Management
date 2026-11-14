import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Info, Lightbulb, TrendingUp } from 'lucide-react';
import type { Insight, InsightTone } from '../../pages/dashboard/insights.js';
import { ChartCard, ChartSkeleton, EmptyState } from './ui/index.js';

const TONE: Record<InsightTone, { icon: typeof Info; box: string; iconClass: string }> = {
  warning: { icon: AlertTriangle, box: 'border-amber-100 bg-amber-50/60', iconClass: 'text-amber-600' },
  good: { icon: TrendingUp, box: 'border-green-100 bg-green-50/60', iconClass: 'text-green-600' },
  info: { icon: Info, box: 'border-teal-brand/10 bg-teal-brand/5', iconClass: 'text-teal-brand' },
};

export function InsightsPanel({ insights, loading }: { insights: Insight[]; loading?: boolean }) {
  return (
    <ChartCard
      title="What the numbers say"
      subtitle="Automatic observations from this month's data"
      action={<Lightbulb className="h-5 w-5 text-gold-brand" />}
      className="h-full"
    >
      {loading ? (
        <ChartSkeleton />
      ) : insights.length === 0 ? (
        <EmptyState>Not enough data yet for insights</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {insights.map((insight) => {
            const { icon: Icon, box, iconClass } = TONE[insight.tone];
            const body = (
              <>
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-gray-900">{insight.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{insight.detail}</p>
                </div>
                {insight.href && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />}
              </>
            );
            const className = `flex items-start gap-3 rounded-xl border p-3 ${box}`;
            return (
              <li key={insight.id}>
                {insight.href ? (
                  <Link to={insight.href} className={`${className} transition-shadow hover:shadow-sm`}>
                    {body}
                  </Link>
                ) : (
                  <div className={className}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
