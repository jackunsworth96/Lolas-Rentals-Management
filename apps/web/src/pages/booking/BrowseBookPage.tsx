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
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';
import { WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon } from '../../components/public/customerContactIcons.js';
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
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl transition-all duration-300 ease-in-out hover:scale-110 hover:brightness-110 active:scale-95"
          aria-label="Chat with us on WhatsApp"
        >
          <img src={phoneIcon} alt="" className="h-9 w-9 object-contain brightness-0 invert" width={36} height={36} />
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
