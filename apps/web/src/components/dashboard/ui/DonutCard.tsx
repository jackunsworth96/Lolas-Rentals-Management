import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { ChartCard, EmptyState } from './ChartCard.js';
import { SERIES_COLORS } from './format.js';

export interface DonutSlice {
  name: string;
  value: number;
}

export function DonutChart({
  data,
  centerValue,
  centerLabel,
  formatValue = (v) => String(v),
}: {
  data: DonutSlice[];
  centerValue?: string;
  centerLabel?: string;
  formatValue?: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number, n: string) => [formatValue(v), n]} />
          </PieChart>
        </ResponsiveContainer>
        {centerValue && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums text-gray-900">{centerValue}</span>
            {centerLabel && <span className="text-[11px] text-gray-400">{centerLabel}</span>}
          </div>
        )}
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-gray-600">{d.name}</span>
            <span className="font-semibold tabular-nums text-gray-900">{formatValue(d.value)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-gray-400">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DonutCard({
  title,
  subtitle,
  data,
  centerValue,
  centerLabel,
  emptyText = 'No data yet',
  formatValue,
  action,
}: {
  title: string;
  subtitle?: string;
  data: DonutSlice[];
  centerValue?: string;
  centerLabel?: string;
  emptyText?: string;
  formatValue?: (v: number) => string;
  action?: React.ReactNode;
}) {
  const nonEmpty = data.filter((d) => d.value > 0);
  return (
    <ChartCard title={title} subtitle={subtitle} action={action} className="h-full">
      {nonEmpty.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <DonutChart data={nonEmpty} centerValue={centerValue} centerLabel={centerLabel} formatValue={formatValue} />
      )}
    </ChartCard>
  );
}
