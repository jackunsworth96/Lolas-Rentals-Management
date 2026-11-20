import { forwardRef, useMemo } from 'react';
import { usePublicEstablishments } from '../../api/paw-card-establishments.js';
import { PartnerCarousel } from './PartnerCarousel.js';

const STEPS = ['Rent with Lola’s', 'Show your card & save', 'We match every saving and put it back into the community'];

/** Paw Card partner showcase under the counter tablet's welcome hero, for the walk-in sales pitch. */
export const CounterPawCard = forwardRef<HTMLElement>(function CounterPawCard(_props, ref) {
  const { data, isLoading, error } = usePublicEstablishments();

  const partners = useMemo(
    () => [...(data ?? [])].sort(
      (a, b) => Number(b.is_high_value) - Number(a.is_high_value) || (a.name ?? '').localeCompare(b.name ?? ''),
    ),
    [data],
  );

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

        <ol className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2 font-lato text-base font-semibold text-charcoal-brand/80">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gold-brand text-sm font-extrabold text-charcoal-brand">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>

        <div className="mt-10">
          {isLoading && (
            <div className="flex flex-col items-center" aria-hidden="true">
              <div className="h-60 w-60 animate-pulse rounded-full bg-white/70" />
              <div className="mt-8 h-10 w-72 animate-pulse rounded-full bg-white/70" />
              <div className="mt-3 h-6 w-40 animate-pulse rounded-full bg-white/70" />
            </div>
          )}
          {partners.length > 0 && <PartnerCarousel partners={partners} />}
        </div>

        {error && (
          <p className="mt-8 text-center font-lato text-charcoal-brand/60">Partners couldn&apos;t be loaded right now.</p>
        )}
        {!isLoading && !error && partners.length === 0 && (
          <p className="mt-8 text-center font-lato text-charcoal-brand/60">No partners yet.</p>
        )}

        <p className="mt-10 text-center font-lato text-sm text-charcoal-brand/50">
          Discounts are subject to partner terms and conditions. Show the Paw Card on your vehicle keys when redeeming.
        </p>
      </div>
    </section>
  );
});
