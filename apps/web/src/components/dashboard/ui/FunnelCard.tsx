import { ChartCard } from './ChartCard.js';
import { CHART_COLORS } from './format.js';

export interface FunnelStage {
  label: string;
  count: number;
}

export function FunnelCard({
  title,
  subtitle,
  stages,
  footer,
}: {
  title: string;
  subtitle?: string;
  stages: FunnelStage[];
  footer?: React.ReactNode;
}) {
  const top = stages[0]?.count || 1;
  return (
    <ChartCard title={title} subtitle={subtitle} className="h-full">
      <div className="space-y-3">
        {stages.map((stage, idx) => {
          const prev = idx > 0 ? stages[idx - 1].count : null;
          const dropOff = prev && prev > 0 ? Math.round(((prev - stage.count) / prev) * 100) : null;
          const width = Math.max(4, Math.round((stage.count / top) * 100));
          return (
            <div key={stage.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700">{stage.label}</span>
                <span className="flex items-center gap-3">
                  {dropOff !== null && dropOff > 0 && <span className="text-red-500">-{dropOff}% drop-off</span>}
                  <span className="font-semibold tabular-nums text-gray-900">{stage.count}</span>
                </span>
              </div>
              <div className="h-6 w-full overflow-hidden rounded-lg bg-gray-50">
                <div
                  className="h-full rounded-lg transition-all duration-500"
                  style={{
                    width: `${width}%`,
                    backgroundColor: CHART_COLORS.primary,
                    opacity: 1 - idx * 0.18,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {footer && <div className="mt-4 border-t border-gray-100 pt-3">{footer}</div>}
    </ChartCard>
  );
}
