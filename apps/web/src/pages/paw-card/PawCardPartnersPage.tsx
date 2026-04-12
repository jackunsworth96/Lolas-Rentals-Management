import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import {
  MapPin,
  Instagram,
  Star,
  Heart,
  PiggyBank,
  Clock,
  Search,
  Users,
  User,
  Trophy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import {
  usePublicEstablishments,
  useTopEstablishments,
  type PawCardEstablishment,
} from '../../api/paw-card-establishments.js';
import pawPrintAsset from '../../assets/Paw Print.svg';

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}

const logoModules = import.meta.glob('../../assets/paw_card_partner_logos/*.svg', {
  eager: true,
  as: 'url',
}) as Record<string, string>;
const allLogos = Object.entries(logoModules)
  .sort(([a], [b]) => {
    const n = (p: string) => parseInt(p.match(/(\d+)\.svg$/)?.[1] ?? '0', 10);
    return n(a) - n(b);
  })
  .map(([, url]) => url);

/** Normalise a display name or file stem to a logo map key (matches partner SVG basenames). */
function toLogoLookupKey(raw: string | null | undefined): string {
  return (raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const LOGO_MAP: Record<string, string> = {};
for (const [path, url] of Object.entries(logoModules)) {
  const stem = path.match(/([^/\\]+)\.svg$/i)?.[1] ?? '';
  const key = toLogoLookupKey(stem.replace(/_/g, '-'));
  if (key && LOGO_MAP[key] === undefined) {
    LOGO_MAP[key] = url;
  }
}

function MarqueeRow({
  logos,
  direction,
  duration,
}: {
  logos: string[];
  direction: 'left' | 'right';
  duration: number;
}) {
  const doubled = [...logos, ...logos];
  return (
    <div
      style={{
        overflow: 'hidden',
        width: '100%',
        maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '24px',
          width: 'max-content',
          animation: `marquee-${direction} ${duration}s linear infinite`,
        }}
      >
        {doubled.map((src, i) => (
          <div
            key={i}
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              backgroundColor: 'rgba(54,55,55,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 8,
            }}
          >
            <img
              src={src}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                opacity: 0.4,
                filter: 'none',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const CATEGORY_MAP: Record<string, string> = {
  // slugs (legacy)
  food: 'Food & Drink',
  food_drink: 'Food & Drink',
  cafe: 'Food & Drink',
  activity: 'Activities',
  activities: 'Activities',
  service: 'Services',
  services: 'Services',
  shopping: 'Shopping',
  // display labels as stored in DB
  'Food & Drink': 'Food & Drink',
  'Activities': 'Activities',
  'Services': 'Services',
  'Shopping': 'Shopping',
};

const FILTER_TABS = ['All', 'Food & Drink', 'Activities', 'Services', 'Shopping'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

function getInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/);
  if (words.length === 1) return (words[0]?.[0] ?? '?').toUpperCase();
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}

const LETTER_NAV_ORDER = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  '0-9',
  '#',
] as const;

/** First index letter for grouping (A–Z, 0–9, or # for other). */
function indexLetter(name: string): string {
  const s = (name ?? '').trim();
  if (!s) return '#';
  const ch = s[0];
  const upper = ch.toUpperCase();
  if (upper >= 'A' && upper <= 'Z') return upper;
  if (ch >= '0' && ch <= '9') return '0-9';
  return '#';
}

function letterAnchorId(letter: string): string {
  if (letter === '0-9') return 'paw-partners-letter-09';
  if (letter === '#') return 'paw-partners-letter-symbol';
  return `paw-partners-letter-${letter}`;
}

function scrollToPartnerLetter(letter: string): void {
  const el = document.getElementById(letterAnchorId(letter));
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function groupPartnersByLetter(
  items: PawCardEstablishment[],
): { letter: string; items: PawCardEstablishment[] }[] {
  const map = new Map<string, PawCardEstablishment[]>();
  for (const e of items) {
    const L = indexLetter(e.name ?? '');
    if (!map.has(L)) map.set(L, []);
    map.get(L)!.push(e);
  }
  return LETTER_NAV_ORDER.filter((L) => map.has(L)).map((L) => ({
    letter: L,
    items: map.get(L)!,
  }));
}

export default function PawCardPartnersPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  const [search, setSearch] = useState('');

  const { data: establishments = [], isLoading, error } = usePublicEstablishments();
  const { data: topData } = useTopEstablishments();

  const topEstablishments = useMemo(() => {
    if (!topData || !establishments.length) return [];
    return (topData as { name: string; count: number }[])
      .slice(0, 10)
      .map(({ name, count }) => {
        const match = establishments.find(
          (e) => (e.name ?? '').toLowerCase().trim() === name.toLowerCase().trim(),
        );
        return match ? { ...match, redemptionCount: count } : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [topData, establishments]);

  const topNames = useMemo(
    () =>
      new Set(
        (topData as { name: string; count: number }[] ?? [])
          .slice(0, 10)
          .map((t) => t.name.toLowerCase().trim()),
      ),
    [topData],
  );

  const filtered = useMemo(() => {
    let items = [...establishments];

    if (activeFilter !== 'All') {
      items = items.filter((e) => CATEGORY_MAP[e.category ?? ''] === activeFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) =>
          (e.name ?? '').toLowerCase().includes(q) ||
          (e.description ?? '').toLowerCase().includes(q) ||
          (e.discount_headline ?? '').toLowerCase().includes(q),
      );
    }

    items.sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
    );
    return items;
  }, [establishments, activeFilter, search]);

  const partnersByLetter = useMemo(() => groupPartnersByLetter(filtered), [filtered]);

  const lettersPresent = useMemo(
    () => new Set(partnersByLetter.map((g) => g.letter)),
    [partnersByLetter],
  );

  const third = Math.ceil(allLogos.length / 3);
  const row1 = allLogos.slice(0, third);
  const row2 = allLogos.slice(third, third * 2);
  const row3 = allLogos.slice(third * 2);

  return (
    <PageLayout
      title="Paw Card Partner Discounts | Lola's Rentals"
      showFloralLeft={false}
      showFloralRight={false}
      fullBleed
    >
      <style>{`
        @keyframes marquee-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-right {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @keyframes paw-first-glitter-sweep {
          0% { transform: translate(-130%, -40%) rotate(28deg); }
          100% { transform: translate(130%, 40%) rotate(28deg); }
        }
        .paw-first-glitter {
          position: absolute;
          top: -60%;
          left: -60%;
          width: 220%;
          height: 220%;
          z-index: 2;
          pointer-events: none;
          mix-blend-mode: soft-light;
          background: linear-gradient(
            105deg,
            transparent 0%,
            transparent 38%,
            rgba(255, 255, 255, 0) 42%,
            rgba(255, 255, 255, 0.75) 47%,
            rgba(255, 248, 220, 0.95) 50%,
            rgba(255, 255, 255, 0.8) 53%,
            rgba(255, 255, 255, 0) 58%,
            transparent 100%
          );
          animation: paw-first-glitter-sweep 2.8s ease-in-out infinite;
        }
        @keyframes paw-first-place-glow {
          0%, 100% {
            box-shadow:
              0 0 0 3px rgba(252, 188, 90, 0.45),
              0 2px 14px rgba(252, 188, 90, 0.4),
              0 0 28px rgba(255, 224, 140, 0.35);
          }
          50% {
            box-shadow:
              0 0 0 4px rgba(252, 188, 90, 0.55),
              0 4px 22px rgba(252, 188, 90, 0.55),
              0 0 36px rgba(255, 235, 170, 0.55);
          }
        }
        .paw-card-first-place-btn {
          border-width: 3px !important;
          animation: paw-first-place-glow 2.4s ease-in-out infinite;
        }
        .paw-card-first-place-btn:hover {
          animation: none;
          box-shadow: 0 4px 20px rgba(252, 188, 90, 0.5) !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .paw-first-glitter {
            animation: none;
            opacity: 0;
          }
          .paw-card-first-place-btn {
            animation: none;
            box-shadow: 0 0 0 3px rgba(252, 188, 90, 0.4), 0 2px 12px rgba(252, 188, 90, 0.35) !important;
          }
        }
      `}</style>

      {/* ── Hero ── */}
      <div
        style={{
          position: 'relative',
          backgroundColor: '#f1e6d6',
          overflow: 'hidden',
          padding: '60px 0',
        }}
      >
        {/* Logo conveyor belts — background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-around',
            gap: '16px',
            padding: '16px 0',
            opacity: 1,
          }}
        >
          <MarqueeRow logos={row1} direction="left" duration={40} />
          <MarqueeRow logos={row2} direction="right" duration={35} />
          <MarqueeRow logos={row3} direction="left" duration={45} />
        </div>

        {/* Dark overlay for text readability */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(241, 230, 214, 0.55)',
          }}
        />

        {/* Hero content — on top */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            textAlign: 'center',
            padding: '40px 24px',
            maxWidth: 700,
            margin: '0 auto',
          }}
        >
          <h1
            className="font-headline font-black text-teal-brand"
            style={{
              fontSize: 'clamp(32px, 5vw, 56px)',
              lineHeight: 1.1,
              marginBottom: 16,
            }}
          >
            Rent and Reap
            <span className="italic text-gold-brand"> Rewards</span>
          </h1>
          <p
            className="font-lato"
            style={{
              fontSize: 18,
              color: 'rgba(54,55,55,0.7)',
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            Show your Paw Card at these local favourites for exclusive discounts across Siargao
          </p>

          {/* Search */}
          <div className="mx-auto max-w-md mb-6">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(54,55,55,0.4)] pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search establishments..."
                className="w-full bg-white text-[#363737] border border-[rgba(54,55,55,0.2)] rounded-full pl-10 pr-4 py-2.5 font-lato text-sm placeholder:text-[rgba(54,55,55,0.4)] focus:outline-none focus:border-[rgba(54,55,55,0.35)] transition-colors"
              />
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-4 py-2 rounded-full font-lato text-sm font-medium transition-colors border ${
                  activeFilter === tab
                    ? 'bg-gold-brand text-charcoal-brand border-transparent'
                    : 'bg-white/60 text-charcoal-brand border-[rgba(54,55,55,0.2)] hover:bg-white/80'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Customer Favourites ── */}
      {topEstablishments.length > 0 && (
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <img
              src={pawPrintAsset}
              alt=""
              aria-hidden="true"
              style={{ width: 28, height: 28, objectFit: 'contain', display: 'block', flexShrink: 0 }}
            />
            <div>
              <h2 className="font-headline font-bold" style={{ fontSize: 24, color: '#363737', marginBottom: 2 }}>
                Customer Favourites
              </h2>
              <p className="font-lato" style={{ fontSize: 14, color: 'rgba(54,55,55,0.6)' }}>
                Most visited by Lola&apos;s customers
              </p>
            </div>
          </div>

          <div
            className="[-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(10, 80px)',
              columnGap: 12,
              rowGap: 12,
              justifyContent: 'center',
              maxWidth: '100%',
              overflowX: 'auto',
              overflowY: 'visible',
              paddingTop: 12,
              paddingBottom: 14,
              scrollbarWidth: 'none',
            }}
          >
            {topEstablishments.map((est, index) => {
              const logoKey = toLogoLookupKey(est.name ?? '');
              const logoSrc = LOGO_MAP[logoKey] ?? null;

              const isFirstPlace = index === 0;

              return (
                <button
                  key={est.id}
                  type="button"
                  className={isFirstPlace ? 'paw-card-first-place-btn' : undefined}
                  onClick={() => {
                    const el = document.getElementById(`establishment-${est.id}`);
                    if (el) {
                      el.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                      el.style.outline = '3px solid #FCBC5A';
                      el.style.outlineOffset = '3px';
                      setTimeout(() => {
                        el.style.outline = '';
                        el.style.outlineOffset = '';
                      }, 2000);
                    }
                  }}
                  style={{
                    position: 'relative',
                    flexShrink: 0,
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    border: '2px solid #FCBC5A',
                    backgroundColor: 'white',
                    padding: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isFirstPlace ? undefined : '0 2px 12px rgba(252,188,90,0.3)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  }}
                  onMouseEnter={(ev) => {
                    ev.currentTarget.style.transform = 'scale(1.1)';
                    if (!isFirstPlace) {
                      ev.currentTarget.style.boxShadow = '0 4px 20px rgba(252,188,90,0.5)';
                    }
                  }}
                  onMouseLeave={(ev) => {
                    ev.currentTarget.style.transform = 'scale(1)';
                    if (!isFirstPlace) {
                      ev.currentTarget.style.boxShadow = '0 2px 12px rgba(252,188,90,0.3)';
                    }
                  }}
                  title={`${est.name} — ${est.redemptionCount} visits`}
                >
                  <div style={{
                    position: 'absolute',
                    top: -4,
                    left: -4,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: '#FCBC5A',
                    color: '#363737',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: 'Lato, sans-serif',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    zIndex: 2,
                  }}>
                    {index + 1}
                  </div>

                  <div
                    style={{
                      position: 'relative',
                      zIndex: 0,
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isFirstPlace && <span className="paw-first-glitter" aria-hidden />}
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt={est.name ?? ''}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          borderRadius: '50%',
                          position: 'relative',
                          zIndex: 1,
                        }}
                      />
                    ) : (
                      <span style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#00577C',
                        fontFamily: 'Lato, sans-serif',
                        position: 'relative',
                        zIndex: 1,
                      }}>
                        {(est.name ?? '').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div style={{
                    position: 'absolute',
                    bottom: -4,
                    right: -4,
                    zIndex: 3,
                    backgroundColor: '#00577C',
                    color: 'white',
                    borderRadius: 10,
                    padding: '1px 5px',
                    fontSize: 9,
                    fontFamily: 'Lato, sans-serif',
                    fontWeight: 600,
                  }}>
                    {est.redemptionCount}x
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <section className="px-6 py-10 max-w-7xl mx-auto">

        {/* Results count */}
        {!isLoading && !error && (
          <p className="font-lato text-sm text-charcoal-brand/60 mb-6">
            Showing {filtered.length} partner{filtered.length !== 1 ? 's' : ''}
          </p>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-sm border border-charcoal-brand/8 overflow-hidden animate-pulse"
              >
                <div className="bg-slate-200 h-32" />
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-slate-200 rounded w-1/3" />
                  <div className="h-4 bg-slate-200 rounded w-2/3" />
                  <div className="h-3 bg-slate-200 rounded w-full" />
                  <div className="h-3 bg-slate-200 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-16">
            <p className="font-lato text-charcoal-brand/60">
              Failed to load partners. Please try again later.
            </p>
          </div>
        )}

        {/* A–Z jump nav */}
        {!isLoading && !error && filtered.length > 0 && (
          <nav
            aria-label="Jump to partners by first letter"
            className="mb-6 flex flex-wrap items-center justify-center gap-1 sm:justify-start"
          >
            <span className="mr-1 font-lato text-[11px] font-bold uppercase tracking-wide text-charcoal-brand/45">
              A–Z
            </span>
            {LETTER_NAV_ORDER.map((letter) => {
              const has = lettersPresent.has(letter);
              const label =
                letter === '0-9' ? '0–9' : letter === '#' ? '#' : letter;
              return has ? (
                <button
                  key={letter}
                  type="button"
                  onClick={() => scrollToPartnerLetter(letter)}
                  className="min-w-[1.75rem] rounded-md border border-charcoal-brand/15 bg-white px-1.5 py-1 font-lato text-xs font-bold text-teal-brand shadow-sm transition-colors hover:border-gold-brand hover:bg-gold-brand/15"
                >
                  {label}
                </button>
              ) : (
                <span
                  key={letter}
                  className="min-w-[1.75rem] px-1.5 py-1 text-center font-lato text-xs font-bold text-charcoal-brand/20"
                  aria-hidden
                >
                  {label}
                </span>
              );
            })}
          </nav>
        )}

        {/* Cards grid (A–Z, grouped by letter) */}
        {!isLoading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {(() => {
              let cardIndex = 0;
              return partnersByLetter.map(({ letter, items: letterItems }) => (
                <Fragment key={letter}>
                  <div
                    id={letterAnchorId(letter)}
                    className="col-span-full scroll-mt-28 border-b border-charcoal-brand/10 pb-2 pt-4 first:pt-0"
                  >
                    <h3 className="font-headline text-lg font-bold text-teal-brand">
                      {letter === '0-9' ? '0–9' : letter === '#' ? 'Other' : letter}
                    </h3>
                  </div>
                  {letterItems.map((e) => {
                    const index = cardIndex++;
                    return (
                      <div key={e.id} id={`establishment-${e.id}`} className="h-full min-w-0 flex flex-col">
                        <EstablishmentCard
                          establishment={e}
                          index={index}
                          isFavourite={topNames.has((e.name ?? '').toLowerCase().trim())}
                        />
                      </div>
                    );
                  })}
                </Fragment>
              ));
            })()}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="font-headline text-2xl text-charcoal-brand/40 mb-2">
              No partners found
            </p>
            <p className="font-lato text-sm text-charcoal-brand/40">
              Try a different search term or category filter
            </p>
          </div>
        )}

        {/* Footer note */}
        <p className="font-lato text-xs text-charcoal-brand/40 text-center mt-10">
          Discounts are subject to partner terms and conditions. Please show your digital Paw Card
          when redeeming.
        </p>
      </section>
    </PageLayout>
  );
}

interface EstablishmentCardProps {
  establishment: PawCardEstablishment & { redemptionCount?: number };
  index: number;
  isFavourite?: boolean;
}

function EstablishmentCard({ establishment: e, index, isFavourite }: EstablishmentCardProps) {
  const { ref, inView } = useInView(0.1);
  const [hovered, setHovered] = useState(false);
  const displayName = e.name ?? '';
  const initials = getInitials(e.name);
  const key = toLogoLookupKey(e.name);
  const logoSrc = LOGO_MAP[key] ?? null;
  const categoryLabel = CATEGORY_MAP[e.category] ?? e.category;
  const stagger = (index % 3) * 0.1;

  return (
    <div
      ref={ref}
      className="bg-white rounded-2xl shadow-sm border border-charcoal-brand/8 overflow-hidden flex min-h-0 w-full min-w-0 flex-1 flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView
          ? hovered
            ? 'translateY(-6px) scale(1.02)'
            : 'translateY(0) scale(1)'
          : 'translateY(24px) scale(1)',
        transition: `opacity 0.5s ease ${stagger}s, transform 0.4s ease ${stagger}s, box-shadow 0.3s ease`,
        boxShadow: hovered
          ? '0 12px 40px rgba(0,87,124,0.15), 0 4px 12px rgba(0,87,124,0.1)'
          : '0 1px 4px rgba(54,55,55,0.06)',
        cursor: 'pointer',
      }}
    >

      {/* ── Top — discount banner ── */}
      <div
        className="p-4 flex items-start justify-between gap-3"
        style={{
          backgroundColor: hovered ? '#1d6b8a' : '#1B5E7B',
          transition: 'background-color 0.3s ease',
        }}
      >
        <div className="flex-1 min-w-0">
          <span
            className="inline-block text-charcoal-brand font-bold text-xs px-2 py-1 rounded mb-2"
            style={{
              backgroundColor: hovered ? '#f5b045' : '#FCBC5A',
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
              transition: 'all 0.3s ease',
            }}
          >
            DISCOUNT
          </span>
          <p className="text-white text-2xl font-bold leading-tight">{e.discount_headline}</p>
          {e.discount_conditions && (
            <p className="text-white/70 text-xs mt-1 leading-snug">{e.discount_conditions}</p>
          )}
        </div>
        {/* Logo circle */}
        <div
          className="flex-shrink-0 w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-inner overflow-hidden"
          style={{
            boxShadow: hovered
              ? '0 0 0 3px rgba(252,188,90,0.6)'
              : '0 0 0 0px rgba(252,188,90,0)',
            transition: 'box-shadow 0.3s ease',
          }}
        >
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={displayName}
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span className="font-headline text-[#1B5E7B] text-lg font-bold leading-none">
              {initials}
            </span>
          )}
        </div>
      </div>

      {/* ── Middle — details ── */}
      <div className="p-4 flex-1 min-h-0 flex flex-col">
        <p className="text-xs font-bold text-charcoal-brand/50 uppercase tracking-wide mb-1">
          {categoryLabel}
        </p>
        {e.description && (
          <p className="text-sm text-charcoal-brand/70 leading-relaxed mb-3">{e.description}</p>
        )}
        {e.discount_code && (
          <span className="inline-block bg-gold-brand/20 text-charcoal-brand text-xs px-2 py-1 rounded">
            Code: {e.discount_code}
          </span>
        )}
      </div>

      {/* ── Bottom — meta + links + CTA (pinned to card bottom in each row) ── */}
      <div className="border-t border-charcoal-brand/8 p-4 mt-auto shrink-0">
        {/* Row 1: savings / rating / hours */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-charcoal-brand/60 mb-2.5">
          {(e.saving_solo != null || e.saving_group != null) && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 flex-shrink-0" />
              <span>{e.saving_solo != null ? `₱${e.saving_solo}` : '—'}</span>
              <span className="text-charcoal-brand/30 mx-0.5">|</span>
              <Users className="w-3 h-3 flex-shrink-0" />
              <span>{e.saving_group != null ? `₱${e.saving_group}` : '—'}</span>
            </span>
          )}
          {e.google_rating != null && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-gold-brand text-gold-brand flex-shrink-0" />
              {e.google_rating}
            </span>
          )}
          {e.opening_hours && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 flex-shrink-0" />
              {e.opening_hours}
            </span>
          )}
        </div>

        {/* Row 2: badges + external links */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isFavourite && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#FFF8ED',
                color: '#B45309',
                border: '1px solid #FCD34D',
                borderRadius: 20,
                padding: '2px 8px',
                fontSize: 11,
                fontFamily: 'Lato, sans-serif',
                fontWeight: 600,
              }}>
                <Trophy className="h-3 w-3 flex-shrink-0" strokeWidth={2.5} aria-hidden />
                Top Ten
              </span>
            )}
            {e.is_favourite && (
              <span className="flex items-center gap-1 bg-red-50 text-red-500 text-xs px-2 py-0.5 rounded-full">
                <Heart className="w-3 h-3 fill-red-400 flex-shrink-0" />
                Lola's Pick
              </span>
            )}
            {e.is_high_value && (
              <span className="flex items-center gap-1 bg-amber-50 text-amber-600 text-xs px-2 py-0.5 rounded-full">
                <PiggyBank className="w-3 h-3 flex-shrink-0" />
                Save ₱100+
              </span>
            )}
            {e.time_of_day && (
              <span className="flex items-center gap-1 bg-charcoal-brand/5 text-charcoal-brand/50 text-xs px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3 flex-shrink-0" />
                {e.time_of_day}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            {e.google_maps_url && (
              <a
                href={e.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${e.name} on Google Maps`}
                className="text-charcoal-brand/40"
                style={{ transition: 'color 0.2s ease, transform 0.2s ease' }}
                onMouseEnter={(ev) => {
                  ev.currentTarget.style.transform = 'scale(1.2)';
                  ev.currentTarget.style.color = '#00577C';
                }}
                onMouseLeave={(ev) => {
                  ev.currentTarget.style.transform = 'scale(1)';
                  ev.currentTarget.style.color = '';
                }}
              >
                <MapPin className="w-4 h-4" />
              </a>
            )}
            {e.instagram_url && (
              <a
                href={e.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${e.name} on Instagram`}
                className="text-charcoal-brand/40"
                style={{ transition: 'color 0.2s ease, transform 0.2s ease' }}
                onMouseEnter={(ev) => {
                  ev.currentTarget.style.transform = 'scale(1.2)';
                  ev.currentTarget.style.color = '#00577C';
                }}
                onMouseLeave={(ev) => {
                  ev.currentTarget.style.transform = 'scale(1)';
                  ev.currentTarget.style.color = '';
                }}
              >
                <Instagram className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* Log Saving CTA */}
        <div style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid rgba(54,55,55,0.08)',
        }}>
          <Link
            to={`/book/paw-card?establishment=${e.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              width: '100%',
              padding: '8px 16px',
              backgroundColor: '#FCBC5A',
              color: '#363737',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'Lato, sans-serif',
              textDecoration: 'none',
              transition: 'opacity 0.2s ease',
            }}
            onMouseEnter={(ev) => {
              (ev.currentTarget as HTMLAnchorElement).style.opacity = '0.85';
            }}
            onMouseLeave={(ev) => {
              (ev.currentTarget as HTMLAnchorElement).style.opacity = '1';
            }}
          >
            🐾 Log My Saving
          </Link>
        </div>
      </div>
    </div>
  );
}
