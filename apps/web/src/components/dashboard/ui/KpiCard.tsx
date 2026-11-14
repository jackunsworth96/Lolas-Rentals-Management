import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { CHART_COLORS } from './format.js';

type Tone = 'default' | 'good' | 'warning' | 'danger';

const TONE_ICON: Record<Tone, string> = {
  default: 'bg-teal-brand/10 text-teal-brand',
  good: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-600',
};

const TONE_VALUE: Record<Tone, string> = {
  default: 'text-gray-900',
  good: 'text-green-700',
  warning: 'text-amber-700',
  danger: 'text-red-600',
};

export function DeltaPill({
  delta,
  goodWhen = 'up',
  label,
}: {
  delta: number | null | undefined;
  goodWhen?: 'up' | 'down';
  label?: string;
}) {
  if (delta == null) return null;
  const up = delta >= 0;
  const good = goodWhen === 'up' ? up : !up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
          good ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}
      >
        <Icon className="h-3 w-3" />
        {Math.abs(delta).toFixed(1)}%
      </span>
      {label && <span className="text-gray-400">{label}</span>}
    </span>
  );
}

export interface KpiCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
  goodWhen?: 'up' | 'down';
  tone?: Tone;
  sparkline?: number[];
  onClick?: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
  delta,
  deltaLabel,
  goodWhen,
  tone = 'default',
  sparkline,
  onClick,
  loading,
  children,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="h-3 w-24 rounded bg-gray-200" />
        <div className="mt-3 h-7 w-20 rounded bg-gray-200" />
        <div className="mt-3 h-3 w-16 rounded bg-gray-100" />
      </div>
    );
  }

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_ICON[tone]}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className={`text-2xl font-bold tabular-nums tracking-tight ${TONE_VALUE[tone]}`}>{value}</p>
        {sparkline && sparkline.length > 1 && (
          <div className="h-8 w-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkline.map((v, i) => ({ i, v }))}>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={1.5}
                  fill={CHART_COLORS.primary}
                  fillOpacity={0.1}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="mt-2 flex min-h-[1.25rem] flex-wrap items-center gap-x-2 gap-y-1">
        <DeltaPill delta={delta} goodWhen={goodWhen} label={deltaLabel} />
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
      {children}
    </>
  );

  const className =
    'h-full w-full rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-shadow';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} cursor-pointer hover:border-teal-brand/30 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-brand/40`}
      >
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
