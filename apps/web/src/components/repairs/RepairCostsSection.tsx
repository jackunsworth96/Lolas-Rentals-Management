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
                    <th
                      scope="col"
                      className="px-4 py-3 font-sans text-sm font-bold text-white md:px-5 md:text-base"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-sans text-sm font-bold text-white md:px-5 md:text-base"
                    >
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

      <div className="mt-10 rounded-2xl border border-charcoal-brand/10 bg-sand-brand/40 px-6 py-6 md:px-8">
        <h3 className="font-headline mb-4 text-lg font-bold text-charcoal-brand md:text-xl">How Damage Charges Work</h3>
        <ul className="font-lato space-y-3 text-sm leading-relaxed text-charcoal-brand/85">
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-medium text-teal-brand">①</span>
            <span>
              For damage requiring bodywork or repainting, charges depend on the extent of the panel affected and will be quoted individually. We will always discuss this with you before any work begins.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-medium text-teal-brand">②</span>
            <span>
              Where damage falls outside our standard price list, all parts are charged at cost — prices are published on our website so you can verify them yourself.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-medium text-teal-brand">③</span>
            <span>
              Crash guards are only charged for full replacement if the guard has genuinely lost its protective function. Cosmetic wear is not charged. A repolish, where sufficient, is charged at{' '}
              <strong className="font-semibold text-charcoal-brand">₱500</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-medium text-teal-brand">④</span>
            <span>
              A minimum call-out fee of <strong className="font-semibold text-charcoal-brand">₱200</strong> applies if you need us to come to you. If the distance warrants it, an additional{' '}
              <strong className="font-semibold text-charcoal-brand">₱20</strong> per km applies for any amount beyond the ₱200 minimum.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-medium text-teal-brand">⑥</span>
            <span>
              In the event of a total write-off, the vehicle must be restored to its original condition regardless of cost. The renter is liable for all parts and labour required to bring the vehicle back to the standard it was rented out in, even if the total repair cost exceeds the market value of the vehicle itself. An out-of-service fee also applies for every day the vehicle is unavailable to our fleet while awaiting parts or repair.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
