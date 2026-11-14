import { CHART_COLORS } from './format.js';

/** Semicircle gauge; `value` is a percentage 0–100. */
export function Gauge({
  value,
  color = CHART_COLORS.primary,
  size = 160,
}: {
  value: number;
  color?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = size * 0.11;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * r;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <svg width={size} height={size / 2 + stroke / 2} viewBox={`0 0 ${size} ${size / 2 + stroke / 2}`} aria-hidden>
      <path d={arc} fill="none" stroke="#eef0f2" strokeWidth={stroke} strokeLinecap="round" />
      <path
        d={arc}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        style={{ transition: 'stroke-dasharray 700ms ease-out' }}
      />
    </svg>
  );
}

export function GaugeCard({
  title,
  value,
  caption,
  footer,
  color,
}: {
  title: string;
  value: number;
  caption?: string;
  footer?: React.ReactNode;
  color?: string;
}) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <div className="relative mt-4 flex flex-1 flex-col items-center justify-end">
        <Gauge value={value} color={color} />
        <div className="absolute bottom-0 flex flex-col items-center">
          <span className="text-3xl font-bold tabular-nums text-gray-900">{Math.round(value)}%</span>
        </div>
      </div>
      {caption && <p className="mt-2 text-center text-xs text-gray-400">{caption}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </section>
  );
}
