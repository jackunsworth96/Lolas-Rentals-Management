import { Truck } from 'lucide-react';

export type TransportService = 'delivery' | 'collection' | 'both' | null | undefined;

export function TransportBadge({ service }: { service: TransportService }) {
  if (!service) return <span className="text-gray-400">—</span>;

  const label = service === 'both' ? 'Both' : service === 'delivery' ? 'Delivery' : 'Collection';
  const color = service === 'delivery'
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : service === 'collection'
      ? 'border-violet-200 bg-violet-50 text-violet-700'
      : 'border-teal-200 bg-teal-50 text-teal-700';

  return (
    <span
      title={`${label} transport required`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${color}`}
    >
      <Truck aria-hidden="true" className="h-3 w-3" strokeWidth={2.25} />
      {label}
    </span>
  );
}
