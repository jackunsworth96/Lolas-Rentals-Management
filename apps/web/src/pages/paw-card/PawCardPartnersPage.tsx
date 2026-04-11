import { useState, useMemo, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { PageLayout } from '../../components/layout/PageLayout.js';
import {
  usePublicEstablishments,
  type PawCardEstablishment,
} from '../../api/paw-card-establishments.js';

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
  food: 'Food & Drink',
  food_drink: 'Food & Drink',
  cafe: 'Food & Drink',
  activity: 'Activities',
  activities: 'Activities',
  service: 'Services',
  services: 'Services',
  shopping: 'Shopping',
};

const FILTER_TABS = ['All', 'Food & Drink', 'Activities', 'Services', 'Shopping'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

function getInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/);
  if (words.length === 1) return (words[0]?.[0] ?? '?').toUpperCase();
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}

function sortEstablishments(items: PawCardEstablishment[]): PawCardEstablishment[] {
  return [...items].sort((a, b) => {
    if (a.is_favourite !== b.is_favourite) return a.is_favourite ? -1 : 1;
    if (a.is_high_value !== b.is_high_value) return a.is_high_value ? -1 : 1;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

export default function PawCardPartnersPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  const [search, setSearch] = useState('');

  const { data: establishments = [], isLoading, error } = usePublicEstablishments();

  const filtered = useMemo(() => {
    let items = sortEstablishments(establishments);

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

    return items;
  }, [establishments, activeFilter, search]);

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

        {/* Cards grid */}
        {!isLoading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((e, index) => (
              <EstablishmentCard key={e.id} establishment={e} index={index} />
            ))}
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
  establishment: PawCardEstablishment;
  index: number;
}

function EstablishmentCard({ establishment: e, index }: EstablishmentCardProps) {
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
      className="bg-white rounded-2xl shadow-sm border border-charcoal-brand/8 overflow-hidden flex flex-col"
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
      <div className="p-4 flex-1">
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

      {/* ── Bottom — meta + links ── */}
      <div className="border-t border-charcoal-brand/8 p-4">
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
      </div>
    </div>
  );
}
