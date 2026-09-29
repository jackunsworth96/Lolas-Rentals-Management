export interface AllocationSummary {
  vehicleType: string;
  protectedAvailable: number;
  sharedAvailable: number;
  segments: Array<{ startsAt: string; endsAt: string; protectedAvailable: number; sharedAvailable: number }>;
}
export function AllocationAvailability({ allocation }: { allocation?: AllocationSummary }) {
  if (!allocation) return null;
  const date = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const distinct = new Set(allocation.segments.map((s) => `${s.protectedAvailable}:${s.sharedAvailable}`));
  const name = allocation.vehicleType === 'bike' ? 'Bikes' : allocation.vehicleType === 'tuktuk' ? 'Tuktuks' : allocation.vehicleType;
  return <section className="min-w-0 rounded-2xl border border-teal-200 bg-white p-5 shadow-sm sm:p-6" aria-label={`${name} availability`}>
    <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{name} available</h2>
    <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5">
      <div className="rounded-xl bg-teal-50 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-800 sm:text-sm">Protected for you</p>
        <p className="mt-2 text-4xl font-bold leading-none text-teal-800 sm:text-5xl">{allocation.protectedAvailable}</p>
        <p className="mt-2 text-sm text-teal-900">From your partner allocation</p>
      </div>
      <div className="rounded-xl bg-gray-50 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-700 sm:text-sm">Shared fleet</p>
        <p className="mt-2 text-4xl font-bold leading-none text-gray-900 sm:text-5xl">{allocation.sharedAvailable}</p>
        <p className="mt-2 text-sm text-gray-700">Additional vehicles you can book</p>
      </div>
    </div>
    <p className="mt-4 text-sm leading-relaxed text-gray-600">Counts are shared across {allocation.vehicleType} models. Your chosen model must also be available.</p>
    {distinct.size > 1 && <details className="mt-4 border-t border-gray-200 pt-4 text-sm text-gray-700"><summary className="cursor-pointer font-semibold text-teal-800">Availability changes during your rental</summary><div className="mt-3 space-y-2">{allocation.segments.filter((s) => s.startsAt < s.endsAt).map((s) => <p key={s.startsAt}>{date(s.startsAt)} to {date(s.endsAt)}: {s.protectedAvailable} protected, {s.sharedAvailable} shared</p>)}</div></details>}
  </section>;
}
