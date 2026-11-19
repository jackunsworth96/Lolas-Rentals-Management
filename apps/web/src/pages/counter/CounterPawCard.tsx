import { forwardRef, useMemo, useState } from 'react';
import { usePublicEstablishments, type PawCardEstablishment } from '../../api/paw-card-establishments.js';
import { CloudinaryImage } from '../../components/ui/CloudinaryImage.js';
import { PARTNER_LOGO_CACHE_BUST } from '../../lib/cloudinary.js';
import { resolveEstablishmentCloudinaryId } from '../paw-card/partner-marquee-public-ids.js';
import { CATEGORY_MAP, FILTER_TABS, getInitials, type FilterTab } from '../paw-card/partner-display.js';

const STEPS = [
  { title: 'Rent with Lola’s', body: 'Every rental comes with a free Siargao Paw Card.' },
  { title: 'Show it & save', body: 'Get exclusive discounts at cafés, restaurants, surf schools and more.' },
  { title: 'Every peso wags a tail', body: 'We match every saving peso-for-peso as a donation to local animal welfare and community NGOs.' },
];

function PartnerTile({ establishment: e }: { establishment: PawCardEstablishment }) {
  const logoPublicId = resolveEstablishmentCloudinaryId(e.cloudinary_public_id, e.name ?? '');
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-charcoal-brand bg-white shadow-[4px_4px_0_#363737]">
      <div className="flex items-start gap-3 p-4" style={{ backgroundColor: '#1B5E7B' }}>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold leading-tight text-white">{e.discount_headline}</p>
          <p className="mt-1 font-lato text-base font-semibold leading-snug text-white/90">{e.name}</p>
        </div>
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
          {logoPublicId ? (
            <CloudinaryImage
              publicId={logoPublicId}
              alt={e.name ?? ''}
              className="h-full w-full object-contain p-1"
              cacheBust={PARTNER_LOGO_CACHE_BUST}
              plugins={[]}
            />
          ) : (
            <span className="font-headline text-lg font-bold text-[#1B5E7B]">{getInitials(e.name)}</span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="font-lato text-xs font-bold uppercase tracking-wide text-charcoal-brand/50">
          {CATEGORY_MAP[e.category] ?? e.category}
        </p>
        {e.discount_conditions && (
          <p className="font-lato text-sm leading-snug text-charcoal-brand/70">{e.discount_conditions}</p>
        )}
      </div>
    </div>
  );
}

/** Paw Card partner showcase under the counter tablet's welcome hero, for the walk-in sales pitch. */
export const CounterPawCard = forwardRef<HTMLElement>(function CounterPawCard(_props, ref) {
  const { data, isLoading, error } = usePublicEstablishments();
  const [filter, setFilter] = useState<FilterTab>('All');

  const partners = useMemo(() => {
    const list = [...(data ?? [])].sort(
      (a, b) => Number(b.is_high_value) - Number(a.is_high_value) || (a.name ?? '').localeCompare(b.name ?? ''),
    );
    return filter === 'All' ? list : list.filter((e) => CATEGORY_MAP[e.category ?? ''] === filter);
  }, [data, filter]);

  return (
    <section ref={ref} className="relative z-10 scroll-mt-4 px-6 pb-40 pt-16">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="font-headline font-extrabold" style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.12 }}>
            <span className="block text-teal-brand">Free Paw Card with every rental</span>
            <span className="block italic text-gold-brand" style={{ textShadow: '0.045em 0.045em 0 #363737' }}>
              Every peso wags a tail
            </span>
          </h2>
          {data && (
            <p className="mt-4 font-lato text-lg text-charcoal-brand">
              <span className="font-extrabold text-teal-brand">{data.length}</span> partners across Siargao
            </p>
          )}
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border-2 border-charcoal-brand bg-cream-brand p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-brand font-lato text-xl font-extrabold text-charcoal-brand">
                {i + 1}
              </span>
              <p className="mt-3 font-headline text-xl font-bold text-teal-brand">{s.title}</p>
              <p className="mt-1 font-lato text-base leading-snug text-charcoal-brand/80">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap justify-center gap-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              aria-pressed={filter === tab}
              className={`rounded-full border-2 border-charcoal-brand px-5 py-2.5 font-lato text-base font-bold transition-colors ${
                filter === tab ? 'bg-teal-brand text-white' : 'bg-white text-charcoal-brand'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/70" />
          ))}
          {partners.map((e) => <PartnerTile key={e.id} establishment={e} />)}
        </div>

        {error && (
          <p className="mt-8 text-center font-lato text-charcoal-brand/60">Partners couldn&apos;t be loaded right now.</p>
        )}
        {!isLoading && !error && partners.length === 0 && (
          <p className="mt-8 text-center font-lato text-charcoal-brand/60">No partners in this category yet.</p>
        )}

        <p className="mt-10 text-center font-lato text-sm text-charcoal-brand/50">
          Discounts are subject to partner terms and conditions. Show your digital Paw Card when redeeming.
        </p>
      </div>
    </section>
  );
});
