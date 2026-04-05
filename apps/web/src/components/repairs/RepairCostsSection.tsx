import { useQueries } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { BrandCard } from '../public/BrandCard.js';
import hondaBeatImg from '../../assets/Honda Beat Image.svg';
import tukTukImg from '../../assets/TukTuk Image.svg';

type CostsPayload = { items: { item: string; costPhp: number }[] };

const COLUMNS: {
  vehicleType: 'honda_beat' | 'tuk_tuk';
  title: string;
  image: string;
  imageAlt: string;
}[] = [
  {
    vehicleType: 'honda_beat',
    title: 'Scooter Honda Beat 110cc',
    image: hondaBeatImg,
    imageAlt: 'Honda Beat scooter',
  },
  {
    vehicleType: 'tuk_tuk',
    title: 'TukTuk Bajaj RE 250cc',
    image: tukTukImg,
    imageAlt: 'TukTuk',
  },
];

function CostColumn({
  vehicleType,
  title,
  image,
  imageAlt,
  data,
  isLoading,
  isError,
}: {
  vehicleType: 'honda_beat' | 'tuk_tuk';
  title: string;
  image: string;
  imageAlt: string;
  data: CostsPayload | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <BrandCard glowColor="40 96 67" className="h-full">
      <div className="rounded-[22px] bg-[#FAF6F0] p-6 md:p-8">
          <h3 className="font-headline text-xl font-black text-teal-brand md:text-2xl">{title}</h3>
          <div className="relative mx-auto mt-4 flex h-36 max-w-[220px] items-center justify-center md:h-40">
            <img src={image} alt={imageAlt} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="mt-6 overflow-hidden rounded-2xl border border-charcoal-brand/10 bg-cream-brand">
            {isLoading ? (
              <div className="space-y-0 p-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-12 rounded-lg animate-pulse ${i % 2 ? 'bg-cream-brand' : 'bg-sand-brand/50'}`} />
                ))}
              </div>
            ) : isError ? (
              <p className="font-lato p-6 text-center text-sm font-semibold text-charcoal-brand/70">
                Unable to load prices for this vehicle.
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-teal-brand text-white">
                    <th className="px-4 py-3 font-headline text-sm font-bold md:px-5 md:text-base">Item</th>
                    <th className="px-4 py-3 text-right font-headline text-sm font-bold md:px-5 md:text-base">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="font-lato font-medium text-charcoal-brand/90">
                  {(data?.items ?? []).map((row, i) => (
                    <tr key={`${vehicleType}-${row.item}-${i}`} className={i % 2 === 0 ? 'bg-white/80' : 'bg-sand-brand/40'}>
                      <td className="px-4 py-3 text-sm md:px-5">{row.item}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-charcoal-brand md:px-5">
                        <span className="font-lato">₱</span>
                        {row.costPhp.toLocaleString('en-PH')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
    </BrandCard>
  );
}

export function RepairCostsSection() {
  const results = useQueries({
    queries: COLUMNS.map((col) => ({
      queryKey: ['repair-costs', col.vehicleType],
      queryFn: () =>
        api.get<CostsPayload>(`/public/repairs/costs?vehicleType=${col.vehicleType}`),
    })),
  });

  return (
    <section className="mx-auto max-w-5xl px-4 pb-8 md:px-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        {COLUMNS.map((col, i) => (
          <CostColumn
            key={col.vehicleType}
            vehicleType={col.vehicleType}
            title={col.title}
            image={col.image}
            imageAlt={col.imageAlt}
            data={results[i]?.data}
            isLoading={!!results[i]?.isLoading}
            isError={!!results[i]?.isError}
          />
        ))}
      </div>

      <p className="font-lato mx-auto mt-8 max-w-2xl text-center text-sm text-charcoal-brand/60">
        Costs are estimates. Final charges depend on actual damage assessment at return.
      </p>
    </section>
  );
}
