import { useMemo } from 'react';
import { usePublicReviews, type Review } from '../../api/reviews.js';
import { BrandCard } from '../public/BrandCard.js';

const FALLBACK_REVIEWS = [
  {
    text: '"The best rental experience I\'ve had. Knowing my money helps the local pups makes exploring Cloud 9 even better!"',
    name: 'Sarah J.',
    role: 'DIGITAL NOMAD',
    initials: 'SJ',
    starRating: 5,
  },
  {
    text: '"Clean bikes, easy process, and a genuinely great mission. The Tuk-Tuk was perfect for our surf crew\'s boards."',
    name: 'Marcus W.',
    role: 'SURFER',
    initials: 'MW',
    starRating: 5,
  },
  {
    text: '"The inflatable kayak was a game changer for the lagoons. Excellent condition and the staff were so kind!"',
    name: 'Elena R.',
    role: 'SOLO TRAVELER',
    initials: 'ER',
    starRating: 5,
  },
];

type DisplayReview = {
  key: string;
  text: string;
  name: string;
  role: string;
  initials: string;
  starRating: number;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? '?';
}

const reviewsTrackClassName =
  'flex gap-6 overflow-x-auto snap-x snap-mandatory [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible md:snap-none';

const reviewCardSlotClassName =
  'min-w-[280px] shrink-0 snap-start md:min-w-0 md:shrink md:snap-none';

function mapApiToDisplay(r: Review, index: number): DisplayReview {
  return {
    key: `api-${r.id}-${index}`,
    text: `"${r.comment}"`,
    name: r.reviewerName,
    role: (r.reviewerRole ?? 'Guest').toUpperCase(),
    initials: initialsFromName(r.reviewerName),
    starRating: Math.min(5, Math.max(1, r.starRating)),
  };
}

export function ReviewsSection() {
  const { data, isLoading } = usePublicReviews();

  const rows: DisplayReview[] = useMemo(() => {
    if (!isLoading && data && data.length > 0) {
      return data.map(mapApiToDisplay);
    }
    return FALLBACK_REVIEWS.map((r, i) => ({
      key: `fallback-${i}`,
      text: r.text,
      name: r.name,
      role: r.role,
      initials: r.initials,
      starRating: r.starRating,
    }));
  }, [data, isLoading]);

  const showSkeleton = isLoading;

  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h3 className="mb-2 font-headline text-3xl font-black text-charcoal-brand">
            Loved by 500+ Explorers
          </h3>
          <p className="font-lato italic text-charcoal-brand/60">
            From all corners of the world, for one shared cause.
          </p>
        </div>

        <div className="md:overflow-hidden">
          {showSkeleton ? (
            <div className={reviewsTrackClassName}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={reviewCardSlotClassName}>
                  <div className="h-48 animate-pulse rounded-4xl bg-gray-200/80" />
                </div>
              ))}
            </div>
          ) : (
            <div className={reviewsTrackClassName}>
              {rows.map((r) => (
                <div key={r.key} className={reviewCardSlotClassName}>
                  <BrandCard className="h-full">
                    <div className="flex h-full min-h-[220px] flex-col p-8">
                      <div className="mb-4 flex gap-0.5">
                        {Array.from({ length: r.starRating }).map((_, i) => (
                          <span key={i} className="text-xl text-gold-brand">
                            ⭐
                          </span>
                        ))}
                      </div>
                      <p className="font-lato mb-6 flex-1 text-sm italic leading-relaxed text-charcoal-brand">{r.text}</p>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sand-brand text-sm font-black text-teal-brand">
                          {r.initials}
                        </div>
                        <div>
                          <h6 className="font-lato text-sm font-bold text-charcoal-brand">{r.name}</h6>
                          <p className="font-lato text-[10px] font-black uppercase text-charcoal-brand/50">{r.role}</p>
                        </div>
                      </div>
                    </div>
                  </BrandCard>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
