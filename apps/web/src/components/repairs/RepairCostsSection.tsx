import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';

type VehicleKey = 'honda_beat' | 'tuk_tuk';

const VEHICLES: { id: VehicleKey; label: string; icon: string }[] = [
  { id: 'honda_beat', label: 'Honda Beat', icon: '🛵' },
  { id: 'tuk_tuk', label: 'TVS Tuk-Tuk', icon: '🛺' },
];

export function RepairCostsSection() {
  const [vehicleType, setVehicleType] = useState<VehicleKey>('honda_beat');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['repair-costs', vehicleType],
    queryFn: () =>
      api.get<{ items: { item: string; costPhp: number }[] }>(
        `/public/repairs/costs?vehicleType=${vehicleType}`,
      ),
  });

  return (
    <section className="mx-auto max-w-4xl px-6">
      <div className="mb-12 text-center">
        <h2 className="font-headline text-3xl font-bold text-teal-brand md:text-4xl">Repair &amp; Damage Costs</h2>
        <p className="mt-4 text-charcoal-brand/70">Standard pricing for common repairs to keep things transparent.</p>
      </div>

      <div className="mb-10 flex justify-center gap-4 overflow-x-auto pb-4">
        {VEHICLES.map((v) => {
          const sel = vehicleType === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setVehicleType(v.id)}
              className={`flex min-w-[160px] max-w-[200px] flex-1 flex-col items-center gap-3 rounded-3xl p-6 transition-transform hover:scale-105 ${
                sel
                  ? 'bg-teal-brand text-white shadow-[0_20px_40px_rgba(62,73,70,0.06)]'
                  : 'bg-cream-brand text-teal-brand shadow-sm'
              }`}
            >
              <span className="text-4xl">{v.icon}</span>
              <span className="font-bold">{v.label}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-3xl bg-cream-brand shadow-[0_20px_40px_rgba(62,73,70,0.06)]">
        {isLoading ? (
          <div className="space-y-0 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-14 rounded-xl animate-pulse ${i % 2 ? 'bg-cream-brand' : 'bg-sand-brand'}`}
              />
            ))}
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-sm font-bold text-charcoal-brand/70">
            Unable to load repair costs. Please{' '}
            <a
              href="https://wa.me/639694443413"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-brand underline"
            >
              WhatsApp us
            </a>{' '}
            for pricing.
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-teal-brand text-white">
                <th className="px-8 py-5 font-headline text-lg font-bold">Item</th>
                <th className="px-8 py-5 text-right font-headline text-lg font-bold">Cost (₱)</th>
              </tr>
            </thead>
            <tbody className="font-medium text-charcoal-brand/80">
              {(data?.items ?? []).map((row, i) => (
                <tr key={row.item} className={i % 2 === 0 ? 'bg-cream-brand' : 'bg-sand-brand'}>
                  <td className="px-8 py-4">{row.item}</td>
                  <td className="px-8 py-4 text-right font-bold text-charcoal-brand">
                    ₱{row.costPhp.toLocaleString('en-PH')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-6 text-center text-sm italic text-charcoal-brand/60">
        Prices include parts and labour. May vary based on damage severity.
      </p>
    </section>
  );
}
