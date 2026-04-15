import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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
import { WHATSAPP_URL } from '../../config/contact.js';
import chatIcon from '../../assets/Buttons/chat icon.svg';
import { hasBookingDatetimeWithTime } from '../../utils/booking-datetime.js';

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

  const isSearched = !!searchParams;
  const isLoading = searching || availFetching || quotesLoading;

  return (
    <PageLayout title="Browse & Book | Lola's Rentals" showBasketIcon>
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
      <div className="relative mx-auto max-w-7xl overflow-hidden pt-4 md:px-4">
        <HeroFloatingClouds variant="functional" />
        <section className="relative z-10 mb-6">
          <SearchBar onSearch={handleSearch} searching={isLoading} />
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

        <BrowseBookVehicleSection
          isSearched={isSearched}
          isLoading={isLoading}
          availableModels={availableModels}
          quotes={quotes}
          pushToast={pushToast}
        />
      </div>

      <div className="fixed bottom-28 right-6 z-40 md:bottom-12 md:right-12">
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-cream-brand shadow-xl ring-2 ring-charcoal-brand/15 transition-all duration-300 ease-in-out hover:scale-110 hover:opacity-95 active:scale-95"
          aria-label="Chat with us on WhatsApp"
        >
          <img src={chatIcon} alt="" className="h-12 w-12 object-contain" width={48} height={48} />
        </a>
      </div>

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
    </PageLayout>
  );
}
