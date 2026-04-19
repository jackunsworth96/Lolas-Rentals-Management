import { useState, useEffect, useRef, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { useToast } from '../../hooks/useToast.js';
import { SearchBar } from '../../components/booking/SearchBar.js';
import { HoldCountdown } from '../../components/booking/HoldCountdown.js';
import { BrowseBookVehicleSection } from './BrowseBookVehicleSection.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';
import LolasChat from '../../components/chat/LolasChat.js';
import { hasBookingDatetimeWithTime } from '../../utils/booking-datetime.js';
import SectionDivider from '../../components/home/SectionDivider.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import InclusionMarquee from '../../components/home/InclusionMarquee.js';
import { ReviewsSection } from '../../components/home/ReviewsSection.js';
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

/** Same source as Be Pawsitive meter on other pages — public charity impact total. */
const CHARITY_IMPACT_ENDPOINT = '/api/public/booking/charity-impact';

interface CharityImpactPayload {
  totalRaised: number;
}

/** Match `CountUp` integer formatting (thousands separator `,`). */
function formatCharityTotalRaised(n: number): string {
  const rounded = parseFloat(n.toFixed(0));
  const parts = rounded.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/** Public reserve/browse page only — does not replace API store id or location row names. */
const RESERVE_PAGE_STORE_DISPLAY_NAME = "Lola's Rentals Siargao";

const INCLUSION_ITEMS = [
  { icon: iconHelmet,      label: 'Helmet' },
  { icon: iconFuel,        label: 'Full Tank' },
  { icon: iconPawCard,     label: 'Paw Card' },
  { icon: iconCoat,        label: 'Rain Coat' },
  { icon: iconFirstAid,    label: 'First Aid' },
  { icon: iconRepairKit,   label: 'Repair Kit' },
  { icon: iconPhoneMount,  label: 'Phone Mount' },
  { icon: iconCloth,       label: 'Seat Cloth' },
  { icon: iconDryBag,      label: '5L Dry Bag' },
  { icon: iconLesson,      label: 'Riding Lesson' },
  { icon: iconCrashGuard,  label: 'Crash Armour' },
  { icon: iconPeaceOfMind, label: 'Peace of Mind', isUpgrade: true },
  { icon: iconSurfRack,    label: 'Surf Rack',     isUpgrade: true },
  { icon: iconBungee,      label: 'Bungee Cord',   isUpgrade: true },
  { icon: iconDelivery,    label: 'Delivery/Collection', isUpgrade: true },
  { icon: iconNinePm,      label: 'Late Return',   isUpgrade: true },
];

/** Seven key inclusions shown in the compact strip above the vehicle grid. */
const COMPACT_STRIP_ITEMS = [
  { icon: iconHelmet,      label: 'Helmet' },
  { icon: iconFuel,        label: 'Full Tank' },
  { icon: iconSurfRack,    label: 'Surf Rack' },
  { icon: iconPeaceOfMind, label: 'Damage Protection' },
  { icon: iconDryBag,      label: 'Dry Bag' },
  { icon: iconFirstAid,    label: 'First Aid' },
  { icon: iconPawCard,     label: 'Paw Card' },
];

interface AvailableModel {
  modelId: string;
  modelName: string;
  availableCount: number;
  nextAvailablePickup?: string;
}

interface QuoteData {
  dailyRate: number;
  securityDeposit: number;
}

export default function BrowseBookPage() {
  const storeId = useBookingStore((s) => s.storeId);
  const pickupDatetime = useBookingStore((s) => s.pickupDatetime);
  const dropoffDatetime = useBookingStore((s) => s.dropoffDatetime);
  const pickupLocationId = useBookingStore((s) => s.pickupLocationId);
  const dropoffLocationId = useBookingStore((s) => s.dropoffLocationId);
  const sessionToken = useBookingStore((s) => s.sessionToken);
  const basket = useBookingStore((s) => s.basket);
  const removeFromBasket = useBookingStore((s) => s.removeFromBasket);

  const [searching, setSearching] = useState(false);
  const [searchParams, setSearchParams] = useState<{
    storeId: string; pickup: string; dropoff: string;
  } | null>(null);

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
            if (!cancelled) pushToast(`Failed to load price for ${m.modelName}`, 'error');
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
            pushToast(`${item.modelName} hold expired`, 'error');
          }
        }
      } catch {
        pushToast('Could not verify your holds — check your connection', 'error');
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [basket, sessionToken, removeFromBasket, pushToast]);

  const vehicleGridRef = useRef<HTMLDivElement>(null);

  const isSearched = !!searchParams;
  const isLoading = searching || availFetching || quotesLoading;

  const prevIsLoading = useRef(false);
  useEffect(() => {
    if (prevIsLoading.current && !isLoading && isSearched && availableModels && availableModels.length > 0) {
      vehicleGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevIsLoading.current = isLoading;
  }, [isLoading, isSearched, availableModels]);

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
      <div className="relative z-10 mx-auto max-w-7xl overflow-visible pt-4 md:px-4">
        <HeroFloatingClouds variant="functional" />
        <section className="relative z-10 mb-6">
          <SearchBar
            onSearch={handleSearch}
            searching={isLoading}
            storeDisplayName={RESERVE_PAGE_STORE_DISPLAY_NAME}
          />
          {isSearched && (
            <p className="font-lato mt-2 text-center text-xs italic text-charcoal-brand/60">
              Our vehicles fill up fast — secure yours now
            </p>
          )}
        </section>

        {basket.length > 0 && (
          <div className="relative z-10 mb-8 flex flex-wrap items-center gap-4 rounded-4xl bg-cream-brand p-4 shadow-sm">
            {basket.map((item) => (
              <div key={item.holdId} className="flex items-center gap-2 rounded-full bg-sand-brand px-4 py-2">
                <span className="text-sm font-bold text-charcoal-brand">{item.modelName}</span>
                <HoldCountdown
                  expiresAt={item.expiresAt}
                  onExpired={() => {
                    removeFromBasket(item.holdId);
                    pushToast(`${item.modelName} hold expired`, 'error');
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Compact inclusions strip ── */}
        <div className="relative z-10 mb-6">
          <div className="rounded-2xl border border-teal-brand/20 bg-sand-brand/50 px-5 py-3">
            <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
              {COMPACT_STRIP_ITEMS.map(({ icon, label }, i) => (
                <Fragment key={label}>
                  {i > 0 && (
                    <span className="shrink-0 text-[10px] leading-none text-charcoal-brand/25" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 font-lato text-[12px] font-semibold text-charcoal-brand/80">
                    <img src={icon} alt="" className="h-5 w-5 shrink-0 object-contain" width={20} height={20} />
                    {label}
                  </span>
                </Fragment>
              ))}
            </div>
            <p className="font-lato mx-auto mt-3 max-w-xl border-t border-teal-brand/20 pt-3 text-center text-sm font-semibold leading-snug text-teal-brand sm:text-[15px]">
              {showCharityTotalInTagline
                ? `Book with us now — your rental funds animal welfare on Siargao · ₱${formatCharityTotalRaised(charityTotalRaised)} donated so far 🐾`
                : 'Book with us now — your rental funds animal welfare on Siargao'}
            </p>
          </div>
        </div>

        <div ref={vehicleGridRef} className="relative z-10">
          <BrowseBookVehicleSection
            isSearched={isSearched}
            isLoading={isLoading}
            availableModels={availableModels}
            quotes={quotes}
            pushToast={pushToast}
          />
        </div>
      </div>

      {/* ── Below-fold trust builders ──────────────────────────── */}

      {/* Inclusions strip */}
      <FadeUpSection>
        <section style={{ backgroundColor: SAND, padding: '64px 5%' }}>
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
              Every Scooter Rental
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
              What&apos;s Included
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
              We&apos;re nerds for functionality, ensuring every rental is packed with the island essentials you need
              for total convenience.
            </p>
            <div
              className="font-lato flex flex-wrap items-center justify-center gap-x-10 gap-y-3"
              style={{ marginBottom: 40 }}
            >
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-teal-brand">
                <img src={tickIcon} alt="" className="h-5 w-5 shrink-0 object-contain" width={20} height={20} />
                Included
              </span>
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-charcoal-brand/75">
                <img src={pesoIcon} alt="" className="h-5 w-5 shrink-0 object-contain" width={20} height={20} />
                Optional extra
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

      {/* Reviews */}
      <FadeUpSection>
        <ReviewsSection />
      </FadeUpSection>

      <div className="fixed bottom-28 left-4 right-4 z-[60] flex flex-col-reverse items-stretch gap-2 md:bottom-8 md:left-auto md:right-8 md:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-slide-up rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${
              t.type === 'success' ? 'bg-teal-brand text-white' : 'bg-red-600 text-white'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      <LolasChat />
    </PageLayout>
  );
}
