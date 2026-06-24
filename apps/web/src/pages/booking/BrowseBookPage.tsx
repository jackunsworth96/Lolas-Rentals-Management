import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { useToast } from '../../hooks/useToast.js';
import { HoldCountdown } from '../../components/booking/HoldCountdown.js';
import { VehicleCard } from '../../components/booking/VehicleCard.js';
import { getStoredPartnerBenefit } from '../../utils/partnerRef.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';
import { hasBookingDatetimeWithTime } from '../../utils/booking-datetime.js';
import SectionDivider from '../../components/home/SectionDivider.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import InclusionMarquee from '../../components/home/InclusionMarquee.js';
import { ReviewsSection } from '../../components/home/ReviewsSection.js';
import { RentalIncludedIconsGrid } from '../../components/public/RentalIncludedIconsGrid.js';
import { CloudinaryImage } from '../../components/ui/CloudinaryImage.js';
import { resolvePublicId } from '../../utils/vehicle-images.js';
import { formatPhpNumber } from '../../utils/currency.js';
import { BrandCard } from '../../components/public/BrandCard.js';
import { PesoSign } from '../../components/ui/PesoSign.js';
import iconPeaceOfMind from '../../assets/Home/Peace of Mind.svg';
import iconHelmet from '../../assets/Home/Helmet Icon.svg';
import iconFuel from '../../assets/Home/Fuel Icon.svg';
import iconPawCard from '../../assets/Home/Paw Card Icon.svg';
import iconCoat from '../../assets/Home/Coat Icon.svg';
import iconFirstAid from '../../assets/Home/First Aid Icon.svg';
import iconRepairKit from '../../assets/Home/Repair Kit Icon.svg';
import iconPhoneMount from '../../assets/Home/Phone Mount Icon.svg';
import iconCloth from '../../assets/Home/Cloth Icon.svg';
import iconDryBag from '../../assets/Home/Dry Bag Icon.svg';
import iconLesson from '../../assets/Home/Lesson Icon.svg';
import iconCrashGuard from '../../assets/Home/Crash Guard Icon.svg';
import iconSurfRack from '../../assets/Home/Surf Rack Icon.svg';
import iconBungee from '../../assets/Home/Bungee Cord Icon.svg';
import iconDelivery from '../../assets/Home/Delivery Collection Icon.svg';
import iconNinePm from '../../assets/Home/9PM Return Icon.svg';
import tickIcon from '../../assets/Home/Tick Icon.svg';
import pesoIcon from '../../assets/Home/Peso Icon.svg';

const SAND = '#f1e6d6';
const CHARITY_IMPACT_ENDPOINT = '/api/public/booking/charity-impact';

interface CharityImpactPayload {
  totalRaised: number;
}

function formatCharityTotalRaised(n: number): string {
  const rounded = parseFloat(n.toFixed(0));
  const parts = rounded.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

const RESERVE_PAGE_STORE_DISPLAY_NAME = "Lola's Rentals Siargao";

function useInclusionItems() {
  const { t } = useTranslation();
  return [
    { icon: iconHelmet,      label: t('browse.items.helmet') },
    { icon: iconFuel,        label: t('browse.items.fullTank') },
    { icon: iconPawCard,     label: t('browse.items.pawCard') },
    { icon: iconCoat,        label: t('browse.items.rainCoat') },
    { icon: iconFirstAid,    label: t('browse.items.firstAid') },
    { icon: iconRepairKit,   label: t('browse.items.repairKit') },
    { icon: iconPhoneMount,  label: t('browse.items.phoneMount') },
    { icon: iconCloth,       label: t('browse.items.seatCloth') },
    { icon: iconDryBag,      label: t('browse.items.dryBag') },
    { icon: iconLesson,      label: t('browse.items.ridingLesson') },
    { icon: iconCrashGuard,  label: t('browse.items.crashArmour') },
    { icon: iconPeaceOfMind, label: t('browse.items.peaceOfMind'), isUpgrade: true },
    { icon: iconSurfRack,    label: t('browse.items.surfRack'),     isUpgrade: true },
    { icon: iconBungee,      label: t('browse.items.bungeeCord'),   isUpgrade: true },
    { icon: iconDelivery,    label: t('browse.items.deliveryCollection'), isUpgrade: true },
    { icon: iconNinePm,      label: t('browse.items.lateReturn'),   isUpgrade: true },
  ];
}

interface AvailableModel {
  modelId: string;
  modelName: string;
  availableCount: number;
  nextAvailablePickup?: string;
  holdExpiresAt?: string;
}

interface QuoteData {
  dailyRate: number;
  securityDeposit: number;
}

interface VehicleModelSummary {
  id: string;
  name: string;
  minDailyRate: number | null;
}

interface LocationRow {
  id: number;
  name: string;
  deliveryCost: number;
  collectionCost: number;
  locationType: string | null;
}

function isStoreLocation(loc: LocationRow): boolean {
  if (loc.locationType === 'store') return true;
  return loc.deliveryCost === 0 && loc.collectionCost === 0;
}

function generateTimeSlots(): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = [];
  const start = 9 * 60 + 15;
  const end = 16 * 60 + 45;
  for (let m = start; m <= end; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const hh = String(h).padStart(2, '0');
    const mm = String(min).padStart(2, '0');
    const value = `${hh}:${mm}`;
    const h12 = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const label = `${h12}:${mm} ${ampm}`;
    slots.push({ value, label });
  }
  return slots;
}

const ALL_TIME_SLOTS = generateTimeSlots();

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function nowTimeMinutes(): number {
  const manilaTime = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [h, m] = manilaTime.split(':').map(Number);
  return h * 60 + m;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function getAvailablePickupSlots(pickupDate: string): { value: string; label: string }[] {
  if (!pickupDate || pickupDate > todayStr()) return ALL_TIME_SLOTS;
  if (pickupDate < todayStr()) return ALL_TIME_SLOTS;
  const now = nowTimeMinutes();
  return ALL_TIME_SLOTS.filter((s) => timeToMinutes(s.value) > now);
}

function getAvailableDropoffSlots(
  pickupDate: string,
  pickupTime: string,
  dropoffDate: string,
): { value: string; label: string }[] {
  if (!pickupDate || !dropoffDate) return ALL_TIME_SLOTS;
  if (dropoffDate > pickupDate) return ALL_TIME_SLOTS;
  if (dropoffDate === pickupDate) {
    if (!pickupTime) return ALL_TIME_SLOTS;
    const pickupMins = timeToMinutes(pickupTime);
    return ALL_TIME_SLOTS.filter((s) => timeToMinutes(s.value) > pickupMins);
  }
  return ALL_TIME_SLOTS;
}

const VEHICLE_NAME_MAP: Record<string, string> = {
  'Honda Beat': 'Scooter Honda Beat 110cc',
  'TukTuk (RE)': 'TukTuk Bajaj RE 250cc',
  'TukTuk (TVS)': 'TukTuk TVS King 200cc',
};

const inputClass =
  'w-full rounded-xl border border-[#d1c4b0] bg-white px-4 py-2.5 text-sm font-medium text-charcoal-brand shadow-sm transition-all duration-200 focus:border-[#00577C] focus:outline-none focus:ring-2 focus:ring-[#00577C]/25';

/** Star rating display — always 4.9 (brand social proof). */
function StarRating() {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4].map((i) => (
        <svg key={i} className="h-4 w-4 fill-gold-brand" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      {/* Half star */}
      <svg className="h-4 w-4" viewBox="0 0 20 20">
        <defs>
          <linearGradient id="half-star">
            <stop offset="50%" stopColor="#FCBC5A" />
            <stop offset="50%" stopColor="#d1c4b0" />
          </linearGradient>
        </defs>
        <path fill="url(#half-star)" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    </div>
  );
}

/** Preview card shown on the initial vehicle grid (before selecting a vehicle). */
function ModelPreviewCard({
  model,
  onSelect,
}: {
  model: VehicleModelSummary;
  onSelect: () => void;
}) {
  const displayName = VEHICLE_NAME_MAP[model.name] ?? model.name;
  const publicId = resolvePublicId(model.name);

  return (
    <BrandCard glowColor="36 96 67">
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Book ${displayName}`}
        className="group flex h-full w-full flex-col overflow-hidden rounded-[22px] bg-[#FAF6F0] text-left outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-teal-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sand-brand"
      >
        <div className="relative h-48 w-full overflow-hidden rounded-t-[22px] bg-white">
          {publicId ? (
            <CloudinaryImage
              publicId={publicId}
              alt=""
              aria-hidden
              plugins={[]}
              className="h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-sand-brand">
              <span className="text-5xl opacity-20" aria-hidden>🏍️</span>
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <div className="mb-1 flex items-center gap-2">
            <StarRating />
            <span className="font-lato text-sm font-bold text-charcoal-brand/70">4.9</span>
          </div>
          <h3 className="font-headline mb-1 text-lg font-bold uppercase tracking-tight text-charcoal-brand">
            {displayName}
          </h3>
          <div className="font-lato mb-4 flex-1 text-sm text-charcoal-brand/60">
            {model.minDailyRate != null ? (
              <span>
                From <span className="font-bold text-teal-brand">
                  <PesoSign />{formatPhpNumber(model.minDailyRate)}
                </span>
                <span className="text-charcoal-brand/50">/day</span>
              </span>
            ) : (
              <span className="italic">Price on request</span>
            )}
          </div>
          {/* Pure-CSS hover — no React state, no re-render on hover */}
          <div
            aria-hidden="true"
            style={{
              backgroundColor: '#FCBC5A',
              color: '#363737',
              border: '2px solid #363737',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontFamily: 'Lato, sans-serif',
              padding: '10px 0',
              width: '100%',
              cursor: 'pointer',
              textAlign: 'center',
            }}
            className="shadow-[3px_3px_0_#363737] transition-[transform,box-shadow] duration-150 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-[5px_5px_0_#363737]"
          >
            Book Now
          </div>
        </div>
      </button>
    </BrandCard>
  );
}

/** Truncate a review comment to the nearest word boundary under maxChars. */
function truncateReview(comment: string, maxChars = 180): string {
  if (comment.length <= maxChars) return comment;
  const truncated = comment.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

interface ReviewQuote {
  text: string;
  author: string;
}

const FALLBACK_REVIEW_QUOTES: ReviewQuote[] = [
  {
    text: "Super smooth booking and really friendly handover. The scooter was clean, reliable, and perfect for exploring Siargao.",
    author: 'Lola\'s Guest',
  },
  {
    text: 'Great service from pickup to return. Fast replies, fair pricing, and the team made everything easy.',
    author: 'Verified Explorer',
  },
  {
    text: 'One of the easiest rental experiences we have had. Clear communication and a bike that felt brand new.',
    author: 'Happy Customer',
  },
];

type BubblePhase = 'idle' | 'entering' | 'typing' | 'holding' | 'leaving';

/**
 * Full-card testimonial that slots into the vehicle grid.
 * Self-contained: fetches reviews & manages all animation state internally.
 */
function ReviewTestimonialCard() {
  const { data: reviewsData } = useQuery<Array<{ reviewerName: string; comment: string; platform: string }>>({
    queryKey: ['public-reviews'],
    queryFn: () => api.get<Array<{ reviewerName: string; comment: string; platform: string }>>('/public/reviews'),
    retry: false,
  });

  const quotes = useMemo<ReviewQuote[]>(
    () =>
      (reviewsData ?? [])
        .filter((r) => r.comment && r.comment.trim().length > 10)
        .map((r) => ({ text: truncateReview(r.comment.trim()), author: r.reviewerName || 'Guest' })),
    [reviewsData],
  );
  const displayQuotes = quotes.length > 0 ? quotes : FALLBACK_REVIEW_QUOTES;

  const [phase, setPhase] = useState<BubblePhase>('idle');
  const [idx, setIdx] = useState(0);
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    if (displayQuotes.length === 0) return;
    const t = setTimeout(() => setPhase('entering'), 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayQuotes.length]);

  useEffect(() => {
    if (displayQuotes.length === 0) return;
    if (phase === 'entering') {
      const t = setTimeout(() => { setVisibleChars(0); setPhase('typing'); }, 400);
      return () => clearTimeout(t);
    }
    if (phase === 'typing') {
      const text = displayQuotes[idx]?.text ?? '';
      if (visibleChars >= text.length) {
        const t = setTimeout(() => setPhase('holding'), 50);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setVisibleChars((c) => c + 1), 22);
      return () => clearTimeout(t);
    }
    if (phase === 'holding') {
      const t = setTimeout(() => setPhase('leaving'), 4000);
      return () => clearTimeout(t);
    }
    if (phase === 'leaving') {
      const t = setTimeout(() => {
        setIdx((i) => (i + 1) % displayQuotes.length);
        setVisibleChars(0);
        setPhase('entering');
      }, 400);
      return () => clearTimeout(t);
    }
  }, [phase, visibleChars, idx, displayQuotes]);

  const opacity = phase === 'leaving' || phase === 'idle' ? 0 : 1;
  const isTyping = phase === 'typing';
  const quote = displayQuotes[idx] ?? null;
  const displayText = quote?.text.slice(0, visibleChars) ?? '';

  return (
    <BrandCard glowColor="36 96 67">
      <div
        className="flex h-full flex-col overflow-hidden rounded-[22px] bg-[#FAF6F0] p-6"
        style={{ opacity, transition: 'opacity 0.4s ease' }}
      >
        {/* Opening quote mark */}
        <div className="mb-3 font-serif text-5xl leading-none text-teal-brand/20 select-none" aria-hidden="true">
          &ldquo;
        </div>

        {/* Review text — grows to fill available space */}
        <p className="font-lato flex-1 text-[13px] italic leading-relaxed text-charcoal-brand/80">
          {displayText}
          {isTyping && <span className="font-bold not-italic text-teal-brand">|</span>}
        </p>

        {/* Footer: name + stars */}
        <div className="mt-5 border-t border-teal-brand/10 pt-4">
          <div className="flex gap-0.5 mb-1.5">
            {[1,2,3,4,5].map((i) => (
              <svg key={i} className="h-4 w-4 fill-gold-brand" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <p className="font-lato text-sm font-bold text-teal-brand">{quote?.author ?? ''}</p>
          <p className="font-lato mt-0.5 text-[11px] text-charcoal-brand/40 uppercase tracking-wider">Verified customer</p>
        </div>
      </div>
    </BrandCard>
  );
}

const LOLAS_GOOGLE_REVIEWS_URL =
  'https://www.google.com/search?gs_ssp=eJzj4tVP1zc0LLbMsiyIzyszYLRSNagwNjYwMbA0MDCzTDFJTjJJsTKoMLFINLBINTO3NLQwNbE0T_LizcnPSSxWKErNK0nMKQYAj74TwQ&q=lolas+rentals&oq=&sourceid=chrome&ie=UTF-8';

/** Static trust pill: 6300+ explorers · ★★★★★ · 5.0 Google Reviews */
function TrustPill() {
  const [count, setCount] = useState(6300);
  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
    const base = apiBase.replace(/\/+$/, '');
    fetch(`${base}/stats/order-count`)
      .then((r) => r.json())
      .then((json) => {
        const n = json?.data?.totalOrders;
        if (typeof n === 'number' && n >= 6300) setCount(n);
      })
      .catch(() => {});
  }, []);

  const rounded = Math.floor(count / 25) * 25;

  return (
    <a
      href={LOLAS_GOOGLE_REVIEWS_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${rounded.toLocaleString()}+ explorers — 5.0 on Google Reviews (opens in new tab)`}
      className="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-full border border-charcoal-brand/10 bg-white/80 px-5 py-1.5 text-sm shadow-sm backdrop-blur-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md sm:flex-nowrap sm:justify-between sm:py-2 sm:pl-8 sm:pr-8"
    >
      <p className="font-lato min-w-0 shrink text-charcoal-brand">
        <span className="font-extrabold text-teal-brand">{rounded.toLocaleString()}+</span>
        <span className="font-medium"> explorers</span>
      </p>
      <div className="flex shrink-0 items-center gap-0.5 px-2 sm:border-x sm:border-charcoal-brand/15" aria-hidden="true">
        {[1,2,3,4,5].map((i) => (
          <svg key={i} className="h-3 w-3 fill-gold-brand sm:h-[14px] sm:w-[14px]" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <p className="font-lato shrink-0 whitespace-nowrap text-charcoal-brand">
        <span className="font-extrabold text-teal-brand">5.0</span>
        <span className="text-charcoal-brand/40" aria-hidden="true">
          {' '}
          ·{' '}
        </span>
        Google Reviews
      </p>
    </a>
  );
}



/** Inline range calendar for picking pickup and return dates. */
function BookingCalendar({
  pickupDate,
  dropoffDate,
  onDropoffSelect,
  onReset,
}: {
  pickupDate: string;
  dropoffDate: string;
  onDropoffSelect: (date: string) => void;
  onReset: (newPickup: string) => void;
}) {
  const today = todayStr();
  const [viewYear, setViewYear] = useState(() => {
    if (pickupDate) return new Date(pickupDate + 'T00:00').getFullYear();
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    if (pickupDate) return new Date(pickupDate + 'T00:00').getMonth();
    return new Date().getMonth();
  });
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  function handleDayClick(dateStr: string) {
    if (dateStr < today) return;
    if (!pickupDate || (pickupDate && dropoffDate)) {
      onReset(dateStr);
    } else {
      if (dateStr < pickupDate) {
        onReset(dateStr);
      } else if (dateStr === pickupDate) {
        onDropoffSelect(dateStr);
      } else {
        onDropoffSelect(dateStr);
      }
    }
  }

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<{ dateStr: string | null; day: number }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ dateStr: null, day: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push({ dateStr: `${viewYear}-${mm}-${dd}`, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ dateStr: null, day: 0 });

  const effectiveHover = pickupDate && !dropoffDate ? hoverDate : null;

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function formatDisplayDate(d: string) {
    return new Date(d + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="mb-3 flex items-center justify-between px-1">
        <button type="button" onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-charcoal-brand/50 transition-colors hover:bg-sand-brand hover:text-charcoal-brand"
        >‹</button>
        <span className="font-headline text-sm font-bold text-charcoal-brand">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-charcoal-brand/50 transition-colors hover:bg-sand-brand hover:text-charcoal-brand"
        >›</button>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1 grid grid-cols-7">
        {DAYS.map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] font-bold uppercase tracking-wider text-charcoal-brand/40">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          if (!cell.dateStr) return <div key={i} className="h-9" />;
          const isPast = cell.dateStr < today;
          const isPickup = cell.dateStr === pickupDate;
          const isDropoff = cell.dateStr === dropoffDate;
          const inRange = !!(pickupDate && dropoffDate && cell.dateStr > pickupDate && cell.dateStr < dropoffDate);
          const inHover = !!(effectiveHover && cell.dateStr > pickupDate && cell.dateStr <= effectiveHover);
          const isToday = cell.dateStr === today;
          const isEndpoint = isPickup || isDropoff;

          return (
            <div
              key={i}
              className={[
                'relative flex h-9 items-center justify-center',
                (inRange || inHover) ? 'bg-teal-brand/10' : '',
                (isPickup && dropoffDate) ? 'rounded-l-full' : '',
                isDropoff ? 'rounded-r-full' : '',
              ].filter(Boolean).join(' ')}
            >
              <button
                type="button"
                disabled={isPast}
                onClick={() => handleDayClick(cell.dateStr!)}
                onMouseEnter={() => setHoverDate(cell.dateStr)}
                onMouseLeave={() => setHoverDate(null)}
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium transition-colors',
                  isPast
                    ? 'cursor-not-allowed text-charcoal-brand/20'
                    : isEndpoint
                    ? 'bg-teal-brand font-bold text-white shadow-sm'
                    : isToday
                    ? 'border-2 border-teal-brand font-bold text-teal-brand'
                    : 'cursor-pointer text-charcoal-brand hover:bg-teal-brand/20',
                ].join(' ')}
              >
                {cell.day}
              </button>
            </div>
          );
        })}
      </div>

      {/* Selection status hint */}
      <div className="mt-3 rounded-xl bg-sand-brand/60 px-3 py-2 text-center">
        {!pickupDate ? (
          <p className="font-lato text-[12px] text-charcoal-brand/60">
            Tap a date to set your <span className="font-bold text-teal-brand">pickup</span>
          </p>
        ) : !dropoffDate ? (
          <p className="font-lato text-[12px] text-charcoal-brand/60">
            <span className="font-bold text-teal-brand">{formatDisplayDate(pickupDate)}</span>
            {' '}— now tap your <span className="font-bold text-teal-brand">return</span> date
          </p>
        ) : (
          <p className="font-lato text-[12px] font-medium text-charcoal-brand">
            <span className="text-teal-brand">{formatDisplayDate(pickupDate)}</span>
            <span className="mx-2 text-charcoal-brand/40">→</span>
            <span className="text-teal-brand">{formatDisplayDate(dropoffDate)}</span>
          </p>
        )}
      </div>
    </div>
  );
}


export default function BrowseBookPage() {
  const { t } = useTranslation();
  const INCLUSION_ITEMS = useInclusionItems();

  const storeId = useBookingStore((s) => s.storeId);
  const pickupDatetime = useBookingStore((s) => s.pickupDatetime);
  const dropoffDatetime = useBookingStore((s) => s.dropoffDatetime);
  const pickupLocationId = useBookingStore((s) => s.pickupLocationId);
  const dropoffLocationId = useBookingStore((s) => s.dropoffLocationId);
  const setDates = useBookingStore((s) => s.setDates);
  const setLocations = useBookingStore((s) => s.setLocations);
  const sessionToken = useBookingStore((s) => s.sessionToken);
  const basket = useBookingStore((s) => s.basket);
  const removeFromBasket = useBookingStore((s) => s.removeFromBasket);
  const searchTrigger = useBookingStore((s) => s.searchTrigger);

  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchParams, setSearchParams] = useState<{
    storeId: string; pickup: string; dropoff: string;
  } | null>(null);
  const [dateError, setDateError] = useState('');

  const { toasts, pushToast } = useToast();

  const prevBasketLen = useRef(basket.length);
  const [badgeBump, setBadgeBump] = useState(false);
  useEffect(() => {
    if (basket.length > prevBasketLen.current) {
      setBadgeBump(true);
      const t = window.setTimeout(() => setBadgeBump(false), 400);
      prevBasketLen.current = basket.length;
      return () => clearTimeout(t);
    }
    prevBasketLen.current = basket.length;
  }, [basket.length]);

  const { data: charityTotalRaised, isSuccess: charityTotalSuccess } = useQuery({
    queryKey: ['charity-impact'],
    queryFn: async () => {
      const r = await fetch(CHARITY_IMPACT_ENDPOINT);
      if (!r.ok) throw new Error('charity impact fetch failed');
      const json = (await r.json()) as { success?: boolean; data?: CharityImpactPayload };
      if (json?.data?.totalRaised == null) throw new Error('charity impact missing total');
      return json.data.totalRaised;
    },
    retry: false,
  });

  const showCharityTotalInTagline =
    charityTotalSuccess && typeof charityTotalRaised === 'number' && charityTotalRaised > 0;

  // All vehicle models (loaded upfront — no dates required)
  const { data: allModels, isLoading: modelsLoading } = useQuery<VehicleModelSummary[]>({
    queryKey: ['public-models', storeId],
    queryFn: () => api.get<VehicleModelSummary[]>(`/public/booking/models?storeId=${storeId}`),
    enabled: !!storeId,
  });

  // Locations for the booking form
  const { data: locations } = useQuery<LocationRow[]>({
    queryKey: ['public-locations', storeId],
    queryFn: () => api.get<LocationRow[]>(`/public/booking/locations?storeId=${storeId}`),
    enabled: !!storeId,
  });

  const storeLocationId = useMemo(() => {
    if (!locations || locations.length === 0) return null;
    const store = locations.find(isStoreLocation);
    return store ? store.id : locations[0].id;
  }, [locations]);

  useEffect(() => {
    if (storeLocationId != null && pickupLocationId == null) {
      setLocations(storeLocationId, storeLocationId);
    }
  }, [storeLocationId, pickupLocationId, setLocations]);

  const {
    data: availableModels,
    isFetching: availFetching,
    refetch: refetchAvailability,
  } = useQuery<AvailableModel[]>({
    queryKey: ['availability', searchParams],
    queryFn: () =>
      api.get(
        `/public/booking/availability?storeId=${searchParams!.storeId}&pickupDatetime=${encodeURIComponent(searchParams!.pickup)}&dropoffDatetime=${encodeURIComponent(searchParams!.dropoff)}`,
      ),
    enabled: !!searchParams,
  });

  async function handleSearch() {
    const state = useBookingStore.getState();
    const sid = state.storeId;
    const pickup = state.pickupDatetime;
    const dropoff = state.dropoffDatetime;
    if (!sid || !pickup || !dropoff || !hasBookingDatetimeWithTime(pickup) || !hasBookingDatetimeWithTime(dropoff)) return;
    setSearching(true);
    setSearchParams({ storeId: sid, pickup, dropoff });
    await refetchAvailability();
    setSearching(false);
  }

  // Handle triggerSearch from VehicleCard's "next available" button
  const prevTrigger = useRef(searchTrigger);
  useEffect(() => {
    if (searchTrigger > prevTrigger.current) {
      prevTrigger.current = searchTrigger;
      handleSearch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTrigger]);

  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  useEffect(() => {
    if (!availableModels || !searchParams || pickupLocationId == null || dropoffLocationId == null) {
      setQuotesLoading(false);
      return;
    }
    if (availableModels.length === 0) {
      setQuotesLoading(false);
      setQuotes({});
      return;
    }
    let cancelled = false;
    setQuotesLoading(true);
    const load = async () => {
      const newQuotes: Record<string, QuoteData> = {};
      await Promise.all(
        availableModels.map(async (m) => {
          try {
            const q = await api.get<QuoteData>(
              `/public/booking/quote?storeId=${searchParams.storeId}&vehicleModelId=${m.modelId}&pickupDatetime=${encodeURIComponent(searchParams.pickup)}&dropoffDatetime=${encodeURIComponent(searchParams.dropoff)}&pickupLocationId=${pickupLocationId}&dropoffLocationId=${dropoffLocationId}`,
            );
            if (!cancelled) newQuotes[m.modelId] = q;
          } catch {
            if (!cancelled) pushToast(t('browse.failedPrice', { name: m.modelName }), 'error');
          }
        }),
      );
      if (!cancelled) {
        setQuotes(newQuotes);
        setQuotesLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [availableModels, searchParams, pickupLocationId, dropoffLocationId, pushToast]);

  useEffect(() => {
    if (basket.length === 0) return;
    const interval = setInterval(async () => {
      try {
        const serverHolds = await api.get<Array<{ id: string }>>(`/public/booking/hold/${sessionToken}`);
        const serverIds = new Set(serverHolds.map((h) => h.id));
        for (const item of basket) {
          if (!serverIds.has(item.holdId)) {
            removeFromBasket(item.holdId);
            pushToast(t('browse.holdExpired', { name: item.modelName }), 'error');
          }
        }
      } catch {
        pushToast(t('browse.verifyHoldsError'), 'error');
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [basket, sessionToken, removeFromBasket, pushToast]);

  const isSearched = !!searchParams;
  const isLoading = searching || availFetching || quotesLoading;

  // Date form state (derived from store, mirrors SearchBar logic)
  const pickupDate = pickupDatetime.slice(0, 10);
  const pickupTime =
    pickupDatetime.includes('T') && pickupDatetime.slice(11, 16).length === 5
      ? pickupDatetime.slice(11, 16)
      : '';
  const dropoffDate = dropoffDatetime.slice(0, 10);
  const dropoffTime =
    dropoffDatetime.includes('T') && dropoffDatetime.slice(11, 16).length === 5
      ? dropoffDatetime.slice(11, 16)
      : '';

  const availablePickupSlots = useMemo(() => getAvailablePickupSlots(pickupDate), [pickupDate]);
  const availableDropoffSlots = useMemo(
    () => getAvailableDropoffSlots(pickupDate, pickupTime, dropoffDate),
    [pickupDate, pickupTime, dropoffDate],
  );

  const rentalDays = useMemo(() => {
    if (!pickupDate || !dropoffDate) return 0;
    const diff = Math.round(
      (new Date(dropoffDate).getTime() - new Date(pickupDate).getTime()) / 86400000,
    );
    return Math.max(0, diff);
  }, [pickupDate, dropoffDate]);

  function validateDates(pDate: string, pTime: string, dDate: string, dTime: string): boolean {
    if (!pDate || !dDate || !pTime || !dTime) { setDateError(''); return true; }
    const pickup = new Date(`${pDate}T${pTime}`);
    const dropoff = new Date(`${dDate}T${dTime}`);
    if (dropoff <= pickup) { setDateError('Return must be after pickup'); return false; }
    setDateError('');
    return true;
  }

  function updatePickup(date: string, time: string) {
    let newPickup = '';
    if (date && time) newPickup = `${date}T${time}:00+08:00`;
    else if (date) newPickup = date;
    setDates(newPickup, dropoffDatetime);
    if (date && time) validateDates(date, time, dropoffDate, dropoffTime);
    else setDateError('');
  }

  function updateDropoff(date: string, time: string) {
    let newDropoff = '';
    if (date && time) newDropoff = `${date}T${time}:00+08:00`;
    else if (date) newDropoff = date;
    setDates(pickupDatetime, newDropoff);
    if (date && time) validateDates(pickupDate, pickupTime, date, time);
    else setDateError('');
  }

  const pickupLoc = locations?.find((l) => l.id === pickupLocationId);
  const dropoffLoc = locations?.find((l) => l.id === dropoffLocationId);
  const pickupFee = pickupLoc ? Number(pickupLoc.deliveryCost) : 0;
  const dropoffFee = dropoffLoc ? Number(dropoffLoc.collectionCost) : 0;

  const canSearch =
    !!storeId &&
    pickupLocationId != null &&
    dropoffLocationId != null &&
    hasBookingDatetimeWithTime(pickupDatetime) &&
    hasBookingDatetimeWithTime(dropoffDatetime) &&
    !dateError;

  const selectedModel = allModels?.find((m) => m.id === selectedModelId) ?? null;
  const selectedDisplayName = selectedModel
    ? (VEHICLE_NAME_MAP[selectedModel.name] ?? selectedModel.name)
    : '';
  const selectedPublicId = selectedModel ? resolvePublicId(selectedModel.name) : null;

  const selectedAvailModel = selectedModelId
    ? (availableModels?.find((m) => m.modelId === selectedModelId) ?? null)
    : null;

  function handleSelectModel(modelId: string) {
    setSelectedModelId(modelId);
    setSearchParams(null);
    setQuotes({});
  }

  function handleBackToGrid() {
    setSelectedModelId(null);
    setSearchParams(null);
    setQuotes({});
  }

  // Calendar date handlers — keep existing time values when changing dates
  function handleCalendarDropoffSelect(dateStr: string) {
    updateDropoff(dateStr, dropoffTime);
  }
  function handleCalendarReset(newPickup: string) {
    // Set pickup date only (preserve existing pickup time if there was one), clear dropoff
    const newPickupFull = newPickup && pickupTime ? `${newPickup}T${pickupTime}:00+08:00` : newPickup;
    setDates(newPickupFull, '');
    setDateError('');
  }

  // Scroll detail panel into view when a model is selected
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedModelId && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedModelId]);

  // Auto-search: fire handleSearch 500 ms after all required fields are complete
  const autoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    if (!selectedModelId || !canSearch) return;
    autoSearchTimer.current = setTimeout(() => {
      void handleSearch();
    }, 500);
    return () => {
      if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    };
  // handleSearch reads store state via getState() so it's stable — safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupDatetime, dropoffDatetime, pickupLocationId, dropoffLocationId, selectedModelId, canSearch]);

  return (
    <PageLayout title="Browse & Book | Lola's Rentals" showBasketIcon unclipLeftFloral>
      <SEO
        title="Reserve a Scooter, Motorbike or Tuktuk — Siargao Island"
        description="Browse and reserve Honda Beat scooters, motorbikes, tuktuks and tricycles online. Pick your dates, choose your vehicle, instant confirmation. Lola's Rentals, General Luna, Siargao."
        canonical="/book/reserve"
        schema={{
          "@context": "https://schema.org",
          "@type": "Service",
          "name": "Vehicle Rental Siargao",
          "provider": { "@type": "LocalBusiness", "name": "Lola's Rentals & Tours Inc." },
          "areaServed": { "@type": "Place", "name": "Siargao Island, Philippines" },
          "serviceType": "Vehicle Rental",
          "description": "Online scooter, motorbike, tuktuk and tricycle rental booking for Siargao Island"
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl overflow-visible px-4 pt-4">
        <HeroFloatingClouds variant="functional" />

        {/* Basket bar — always visible when items are held */}
        {basket.length > 0 && (
          <div className="relative z-10 mb-6 flex flex-wrap items-center gap-4 rounded-4xl bg-cream-brand p-4 shadow-sm">
            {basket.map((item) => (
              <div key={item.holdId} className="flex items-center gap-2 rounded-full bg-sand-brand px-4 py-2">
                <span className="text-sm font-bold text-charcoal-brand">{item.modelName}</span>
                <HoldCountdown
                  expiresAt={item.expiresAt}
                  onExpired={() => {
                    removeFromBasket(item.holdId);
                    pushToast(t('browse.holdExpired', { name: item.modelName }), 'error');
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {!selectedModelId ? (
          /* ─────────────────────────────────────────────────
             STEP 1 — Vehicle grid (no dates required)
          ───────────────────────────────────────────────── */
          <section className="relative z-10">
            {/* Clean centred heading — no sidebars */}
            <div className="mb-6 text-center">
              <h1
                className="font-headline font-extrabold"
                style={{ fontSize: 'clamp(36px, 5vw, 52px)', lineHeight: 1.15 }}
              >
                Reserve Now
              </h1>
              {(() => {
                const pb = getStoredPartnerBenefit();
                if (!pb) {
                  return (
                    <p className="font-lato mt-1.5 text-sm text-charcoal-brand/60">
                      Choose your vehicle, then pick your dates
                    </p>
                  );
                }
                return (
                  <div className="mt-2 flex flex-col items-center gap-1.5">
                    {/* Partner logo — bare, no pill */}
                    {pb.logoUrl ? (
                      <img
                        src={pb.logoUrl}
                        alt={pb.name}
                        className="mx-auto w-auto object-contain"
                        style={{
                          maxWidth: `${pb.logoDisplayWidth ?? 120}px`,
                          maxHeight: `${pb.logoDisplayHeight ?? 40}px`,
                        }}
                      />
                    ) : (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-charcoal-brand/40">
                        {pb.name}
                      </span>
                    )}
                    {/* Partner welcome copy */}
                    <p className="font-lato max-w-md text-sm leading-relaxed text-charcoal-brand/70">
                      {pb.welcomeMessage ?? (
                        <>
                          You&apos;re in great hands at{' '}
                          <span className="font-semibold text-charcoal-brand">{pb.name}</span>.
                          Let us be the second best decision you make on your Siargao trip.
                        </>
                      )}
                    </p>
                  </div>
                );
              })()}
              {/* Trust pill sits naturally under the subtitle */}
              <div className="mt-2 mx-auto flex w-full max-w-2xl justify-center px-4">
                <TrustPill />
              </div>
            </div>

            {/* 3-column grid: review card + vehicle cards */}
            {modelsLoading ? (
              <div className="flex justify-center py-16" role="status" aria-label="Loading vehicles">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-brand border-t-transparent" />
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-8">
                {/* Review testimonial — first slot */}
                <div style={{ width: '100%', maxWidth: 340 }}>
                  <ReviewTestimonialCard />
                </div>

                {/* Vehicle cards */}
                {(allModels ?? []).map((model) => (
                  <div key={model.id} style={{ width: '100%', maxWidth: 340 }}>
                    <ModelPreviewCard model={model} onSelect={() => handleSelectModel(model.id)} />
                  </div>
                ))}
              </div>
            )}

            {/* Inclusions bar — below the vehicles so cards stay above the fold */}
            <div className="relative z-10 mt-10 mb-8 rounded-2xl border border-teal-brand/20 bg-sand-brand/50 px-4 py-4 sm:px-5">
              <RentalIncludedIconsGrid variant="compact" showOptionals />
              <p className="font-lato mx-auto mt-4 max-w-xl border-t border-teal-brand/20 pt-3 text-center text-sm font-semibold leading-snug text-teal-brand sm:text-[15px]">
                {showCharityTotalInTagline
                  ? t('browse.charityTagline', { amount: formatCharityTotalRaised(charityTotalRaised!) })
                  : t('browse.charityTaglineSimple')}
              </p>
            </div>
          </section>
        ) : (
          /* ─────────────────────────────────────────────────
             STEP 2 — Vehicle detail + booking form
          ───────────────────────────────────────────────── */
          <section className="relative z-10" ref={detailRef}>

            {/* ── Split layout: image left, booking form right ── */}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">

              {/* LEFT — Vehicle image + name (sticky on large screens while form scrolls) */}
              <div className="lg:sticky lg:top-24 lg:self-start">
                <h1 className="font-headline mb-1 text-3xl font-black uppercase tracking-tight text-charcoal-brand sm:text-4xl">
                  {selectedDisplayName}
                </h1>
                <div className="mb-4 flex items-center gap-2">
                  <StarRating />
                  <span className="font-lato text-sm font-bold text-charcoal-brand/70">4.9</span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-charcoal-brand/10 bg-white">
                  {selectedPublicId ? (
                    <CloudinaryImage
                      publicId={selectedPublicId}
                      alt={selectedDisplayName}
                      plugins={[]}
                      className="h-72 w-full object-contain p-6 sm:h-96"
                    />
                  ) : (
                    <div className="flex h-72 w-full items-center justify-center bg-sand-brand sm:h-96">
                      <span className="text-8xl opacity-20">🏍️</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT — Booking form */}
              <div className="flex flex-col gap-4">

                {/* Back link */}
                <button
                  type="button"
                  onClick={handleBackToGrid}
                  className="font-lato flex w-fit items-center gap-1.5 rounded-full border border-charcoal-brand/20 bg-white px-4 py-2 text-sm font-semibold text-charcoal-brand/70 transition-colors hover:bg-sand-brand/50 hover:text-charcoal-brand"
                >
                  ← Choose a different vehicle
                </button>

                <div className="rounded-2xl border border-teal-brand/20 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <h2 className="font-headline text-xl font-bold text-charcoal-brand">
                      Plan Your Ride
                    </h2>
                    {(() => {
                      const pb = getStoredPartnerBenefit();
                      if (!pb?.logoUrl) return null;
                      return (
                        <img
                          src={pb.logoUrl}
                          alt={pb.name}
                          className="w-auto shrink-0 object-contain opacity-80"
                          style={{
                            maxWidth: `${pb.logoDisplayWidth ?? 90}px`,
                            maxHeight: `${pb.logoDisplayHeight ?? 28}px`,
                          }}
                        />
                      );
                    })()}
                  </div>

                  {/* Store label */}
                  <div className="mb-4 space-y-1.5">
                    <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Store</label>
                    <div className={`${inputClass} flex items-center justify-between gap-2`}>
                      <span className="font-semibold">{RESERVE_PAGE_STORE_DISPLAY_NAME}</span>
                      <a
                        href="https://maps.google.com/?q=Lola%27s+Rentals+General+Luna+Siargao"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[11px] font-semibold text-teal-brand underline underline-offset-2 transition-colors hover:text-teal-brand/70"
                      >
                        View map →
                      </a>
                    </div>
                    <p className="ml-1 text-[11px] leading-snug text-charcoal-brand/45">
                      General Luna, Siargao Island · <a href="https://maps.google.com/?q=Lola%27s+Rentals+General+Luna+Siargao" target="_blank" rel="noopener noreferrer" className="text-teal-brand underline underline-offset-2 hover:text-teal-brand/70 transition-colors">Get directions</a>
                    </p>
                  </div>

                  {/* Location pickers */}
                  {locations && locations.length > 0 && (
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                          Pickup Location
                        </label>
                        <div className="relative">
                          <select
                            value={pickupLocationId ?? ''}
                            onChange={(e) => setLocations(Number(e.target.value), dropoffLocationId)}
                            className={`${inputClass} appearance-none`}
                          >
                            <option value="">Select…</option>
                            {locations.map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
                        </div>
                        {pickupFee > 0 && (
                          <p className="ml-1 text-xs font-semibold text-teal-700">
                            Delivery fee: <PesoSign />{pickupFee.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                          Return Location
                        </label>
                        <div className="relative">
                          <select
                            value={dropoffLocationId ?? ''}
                            onChange={(e) => setLocations(pickupLocationId, Number(e.target.value))}
                            className={`${inputClass} appearance-none`}
                          >
                            <option value="">Select…</option>
                            {locations.map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
                        </div>
                        {dropoffFee > 0 && (
                          <p className="ml-1 text-xs font-semibold text-teal-700">
                            Collection fee: <PesoSign />{dropoffFee.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Date range calendar */}
                  <div className="mb-4 rounded-2xl border border-teal-brand/10 bg-[#f8f5f0] p-4">
                    <BookingCalendar
                      pickupDate={pickupDate}
                      dropoffDate={dropoffDate}
                      onDropoffSelect={handleCalendarDropoffSelect}
                      onReset={handleCalendarReset}
                    />
                  </div>

                  {/* Time selectors — below the calendar */}
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                        Pickup Time
                      </label>
                      <div className="relative">
                        <select
                          value={pickupTime}
                          onChange={(e) => updatePickup(pickupDate, e.target.value)}
                          className={`${inputClass} appearance-none`}
                        >
                          <option value="">Select time…</option>
                          {availablePickupSlots.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                        Return Time
                      </label>
                      <div className="relative">
                        <select
                          value={dropoffTime}
                          onChange={(e) => updateDropoff(dropoffDate, e.target.value)}
                          className={`${inputClass} appearance-none ${dateError ? 'border-red-400 ring-2 ring-red-400/20' : ''}`}
                        >
                          <option value="">Select time…</option>
                          {availableDropoffSlots.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
                      </div>
                      {dateError && (
                        <p className="ml-1 text-xs font-semibold text-red-500">{dateError}</p>
                      )}
                    </div>
                  </div>

                  {/* Live running total — shown once dates are selected */}
                  {rentalDays > 0 && (() => {
                    const dailyRate = quotes[selectedModelId!]?.dailyRate ?? selectedModel?.minDailyRate ?? null;
                    const isEstimate = !quotes[selectedModelId!] && !!selectedModel?.minDailyRate;
                    if (!dailyRate) return null;
                    return (
                      <div className="mb-4 rounded-xl border border-teal-brand/15 bg-teal-50/50 px-4 py-3 text-center">
                        <p className="font-lato text-sm font-bold text-charcoal-brand">
                          {rentalDays} day{rentalDays !== 1 ? 's' : ''} × {isEstimate ? 'from ' : ''}<PesoSign />{formatPhpNumber(dailyRate)}{' '}
                          ={' '}
                          <span className="text-base text-teal-brand">
                            {isEstimate ? 'from ' : ''}<PesoSign />{formatPhpNumber(rentalDays * dailyRate)}
                          </span>
                        </p>
                      </div>
                    );
                  })()}

                  {/* Availability status */}
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-brand border-t-transparent" />
                      <span className="font-lato text-sm font-semibold text-charcoal-brand/60">Checking availability…</span>
                    </div>
                  ) : !canSearch ? (
                    <p className="font-lato text-center text-xs text-charcoal-brand/40">
                      Complete all fields above to see availability
                    </p>
                  ) : null}

                  {isSearched && (
                    <p className="font-lato mt-2 text-center text-xs italic text-charcoal-brand/60">
                      {t('browse.vehiclesFillFast')}
                    </p>
                  )}
                </div>

                {/* Availability result for selected model */}
                {isSearched && !isLoading && (
                  <div>
                    {selectedAvailModel != null ? (
                      <VehicleCard
                        modelId={selectedModelId!}
                        modelName={selectedModel!.name}
                        availableCount={selectedAvailModel.availableCount}
                        dailyRate={quotes[selectedModelId!]?.dailyRate ?? null}
                        securityDeposit={quotes[selectedModelId!]?.securityDeposit ?? null}
                        nextAvailablePickup={selectedAvailModel.nextAvailablePickup}
                        holdExpiresAt={selectedAvailModel.holdExpiresAt}
                        onToast={pushToast}
                      />
                    ) : (
                      <div className="rounded-2xl border border-gold-brand/30 bg-gold-brand/10 px-6 py-5 text-center">
                        <p className="font-lato font-bold text-charcoal-brand">
                          No availability found for these dates.
                        </p>
                        <p className="font-lato mt-1 text-sm text-charcoal-brand/70">
                          Try different dates or contact us on WhatsApp.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── Below-fold trust builders ─────────────────────────── */}

      <FadeUpSection>
        <section id="whats-included" style={{ backgroundColor: SAND, padding: '64px 5%' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <p
              className="font-lato"
              style={{
                textAlign: 'center',
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#00577C',
                marginBottom: 12,
                fontWeight: 700,
              }}
            >
              {t('browse.everyScooterRental')}
            </p>
            <h2
              className="font-headline font-bold"
              style={{
                textAlign: 'center',
                fontSize: 'clamp(32px, 5vw, 42px)',
                color: '#363737',
                marginBottom: 16,
                lineHeight: 1.2,
              }}
            >
              {t('browse.whatsIncluded')}
            </h2>
            <p
              className="font-lato"
              style={{
                textAlign: 'center',
                fontSize: 16,
                color: '#363737',
                opacity: 0.7,
                maxWidth: 560,
                margin: '0 auto 20px',
              }}
            >
              {t('browse.inclusionsSubtitle')}
            </p>
            <div
              className="font-lato flex flex-wrap items-center justify-center gap-x-10 gap-y-3"
              style={{ marginBottom: 40 }}
            >
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-teal-brand">
                <img src={tickIcon} alt="" className="h-5 w-5 shrink-0 object-contain" width={20} height={20} />
                {t('browse.included')}
              </span>
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-charcoal-brand/75">
                <img src={pesoIcon} alt="" className="h-5 w-5 shrink-0 object-contain" width={20} height={20} />
                {t('browse.optionalExtra')}
              </span>
            </div>
          </div>
          <InclusionMarquee
            iconSize={86}
            knockOutIconWhiteMatte={false}
            includedBadgeSrc={tickIcon}
            optionalBadgeSrc={pesoIcon}
            items={INCLUSION_ITEMS}
            speed={45}
          />
        </section>
      </FadeUpSection>

      <div style={{ marginTop: -2, marginBottom: -2 }}>
        <SectionDivider variant="dash" flip />
      </div>

      <FadeUpSection>
        <ReviewsSection />
      </FadeUpSection>

      <div className="fixed bottom-28 left-4 right-4 z-[60] flex flex-col-reverse items-stretch gap-2 md:bottom-8 md:left-auto md:right-8 md:items-end">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-toast-slide-up rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${
              toast.type === 'success' ? 'bg-teal-brand text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.msg}
          </div>
        ))}
      </div>
    </PageLayout>
  );
}
