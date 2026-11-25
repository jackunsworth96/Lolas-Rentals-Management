import { useMemo, useState } from 'react';
import { usePublicReviews, type Review } from '../../api/reviews.js';
import { useLiveCustomerCount } from '../../hooks/useLiveCustomerCount.js';
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
  'flex gap-6 overflow-x-auto snap-x snap-mandatory [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-4';

const reviewCardSlotClassName =
  'w-[80vw] max-w-[340px] shrink-0 snap-start';

const REVIEW_PREVIEW_CHARS = 120;

function ReviewQuote({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > REVIEW_PREVIEW_CHARS;
  const shown = !isLong || expanded ? text : `${text.slice(0, REVIEW_PREVIEW_CHARS).trimEnd()}…`;

  return (
    <div className="mb-6 flex-1">
      <p className="font-lato text-pretty text-[15px] italic leading-relaxed text-charcoal-brand">{shown}</p>
      {isLong && (
        <button
          type="button"
          aria-expanded={expanded}
          className="font-lato mt-2 cursor-pointer text-sm font-bold text-teal-brand underline underline-offset-2"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="mb-4 flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: rating }).map((_, i) => (
        <svg key={i} width={18} height={18} viewBox="0 0 24 24" fill="#FCBC5A" aria-hidden="true">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </div>
  );
}

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
  const explorers = Math.floor(useLiveCustomerCount() / 100) * 100;

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
          <p className="mb-3 font-lato text-[13px] font-bold uppercase tracking-[0.1em] text-teal-brand">
            Reviews
          </p>
          <h2
            className="mb-4 font-headline font-bold text-balance"
            style={{ fontSize: 'clamp(32px, 5vw, 42px)', lineHeight: 1.2, color: '#363737' }}
          >
            Loved by <span className="tabular-nums">{explorers.toLocaleString()}+</span> Explorers
          </h2>
          <p className="mx-auto max-w-[480px] font-lato text-base text-balance text-charcoal-brand/80">
            From all corners of the world, for one shared cause.
          </p>
        </div>

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
                    <StarRow rating={r.starRating} />
                    <ReviewQuote text={r.text} />
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-sand-brand text-sm font-black text-teal-brand">
                        {r.initials}
                      </div>
                      <div>
                        <p className="font-lato text-sm font-bold text-charcoal-brand">{r.name}</p>
                        <p className="font-lato text-[11px] font-bold uppercase tracking-[0.05em] text-charcoal-brand/75">{r.role}</p>
                      </div>
                    </div>
                  </div>
                </BrandCard>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
