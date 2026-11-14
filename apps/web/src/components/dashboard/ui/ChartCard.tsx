export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-gray-400">{children}</p>;
}

export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-xs font-medium text-teal-brand hover:underline">
      {children}
    </a>
  );
}

export function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return <div className={`${height} w-full animate-pulse rounded-xl bg-gray-100`} />;
}
