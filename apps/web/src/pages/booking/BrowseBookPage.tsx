import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { SearchBar } from '../../components/booking/SearchBar.js';
import { HoldCountdown } from '../../components/booking/HoldCountdown.js';
import { BrowseBookVehicleSection } from './BrowseBookVehicleSection.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';

import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import logo from '../../assets/Lolas Original Logo.svg';

function useBrowseBookFonts() {
  useEffect(() => {
    const id = 'browse-book-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Epilogue:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);
}

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

interface Toast { msg: string; type: 'success' | 'error'; id: number }


export default function BrowseBookPage() {
  useBrowseBookFonts();

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

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((msg: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { msg, type, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

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

  // Availability query
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
    if (!storeId || !pickupDatetime || !dropoffDatetime) return;
    setSearching(true);
    setSearchParams({ storeId, pickup: pickupDatetime, dropoff: dropoffDatetime });
    await refetchAvailability();
    setSearching(false);
  }

  // Per-model quotes
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  useEffect(() => {
    if (!availableModels || !searchParams || pickupLocationId == null || dropoffLocationId == null) return;
    const load = async () => {
      const newQuotes: Record<string, QuoteData> = {};
      await Promise.all(
        availableModels.map(async (m) => {
          try {
            const q = await api.get<QuoteData>(
              `/public/booking/quote?storeId=${searchParams.storeId}&vehicleModelId=${m.modelId}&pickupDatetime=${encodeURIComponent(searchParams.pickup)}&dropoffDatetime=${encodeURIComponent(searchParams.dropoff)}&pickupLocationId=${pickupLocationId}&dropoffLocationId=${dropoffLocationId}`,
            );
            newQuotes[m.modelId] = q;
          } catch { /* skip */ }
        }),
      );
      setQuotes(newQuotes);
    };
    load();
  }, [availableModels, searchParams, pickupLocationId, dropoffLocationId]);

  // Server reconciliation every 30s
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
      } catch { /* ignore */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [basket, sessionToken, removeFromBasket, pushToast]);

  const isSearched = !!searchParams;
  const isLoading = searching || availFetching;

  return (
    <div
      className="relative min-h-screen overflow-x-hidden font-body animate-page-fade-in"
      style={{ background: '#FAF6F0' }}
    >
      {/* Floral decor */}
      <img src={flowerLeft} alt="" className="pointer-events-none fixed left-0 top-0 z-0 h-48 w-48 object-contain" />
      <img src={flowerRight} alt="" className="pointer-events-none fixed bottom-0 right-0 z-0 h-64 w-64 object-contain" />

      {/* Header */}
      <header className="fixed left-0 top-0 z-50 flex w-full items-center justify-between bg-teal-brand px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Lola's Rentals" className="h-8 w-auto brightness-0 invert" />
        </div>
        <div className="hidden items-center gap-8 md:flex">
          <Link
            to="/browse-book"
            className="font-bold text-gold-brand transition-opacity duration-200 hover:opacity-80"
          >
            Reserve
          </Link>
          <Link
            to="/paw-card"
            className="text-white/80 transition-opacity duration-200 hover:opacity-80 hover:text-white"
          >
            Paw Card
          </Link>
        </div>
        <Link
          to="/basket"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/20 text-white transition-all duration-300 ease-in-out hover:bg-white/10"
        >
          🛒
          {basket.length > 0 && (
            <span
              className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold-brand text-[10px] font-black text-charcoal-brand ${badgeBump ? 'animate-badge-pop' : ''}`}
            >
              {basket.length}
            </span>
          )}
        </Link>
      </header>

      <main className="relative mx-auto min-h-screen max-w-7xl px-4 pb-32 pt-28 md:px-8">
        {/* Search Bar */}
        <section className="relative z-10 mb-12">
          <SearchBar onSearch={handleSearch} searching={isLoading} />
        </section>

        {/* Basket hold timers */}
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
      </main>

      <FadeUpSection>
      <footer className="w-full bg-sand-brand">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-10 py-16 md:flex-row">
          <div className="max-w-sm space-y-4">
            <span className="font-headline text-2xl font-black text-teal-brand">Lola's Rentals</span>
            <p className="text-sm leading-relaxed text-charcoal-brand/70">
              © {new Date().getFullYear()} Lola's Rentals. Supporting Siargao Dog Rescue &amp; Local Reforestation.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-4">
            <a href="#" className="text-sm font-bold text-charcoal-brand/60 transition-all duration-300 hover:text-teal-brand">
              Island Safety
            </a>
            <a href="#" className="text-sm font-bold text-charcoal-brand/60 transition-all duration-300 hover:text-teal-brand">
              Dog Rescue NGO
            </a>
            <a href="#" className="text-sm font-bold text-charcoal-brand/60 transition-all duration-300 hover:text-teal-brand">
              Rentals FAQ
            </a>
            <a href="#" className="text-sm font-bold text-charcoal-brand/60 transition-all duration-300 hover:text-teal-brand">
              Sustainability
            </a>
          </div>
        </div>
      </footer>
      </FadeUpSection>

      <nav className="fixed bottom-0 left-0 z-50 flex h-24 w-full items-center justify-around rounded-t-5xl bg-cream-brand px-4 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] md:hidden">
        <Link
          to="/"
          className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50 transition-opacity duration-200 hover:opacity-80"
        >
          <span className="text-lg">🏠</span>Home
        </Link>
        <Link
          to="/browse-book"
          className="flex scale-110 flex-col items-center gap-0.5 rounded-3xl bg-[#D1E7E4] px-6 py-2 text-xs font-black text-teal-brand transition-opacity duration-200 hover:opacity-90"
        >
          <span className="text-lg">🏍️</span>Reserve
        </Link>
        <Link
          to="/paw-card"
          className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50 transition-opacity duration-200 hover:opacity-80"
        >
          <span className="text-lg">🐾</span>Paw Card
        </Link>
      </nav>

      <div className="fixed bottom-28 right-6 z-40 md:bottom-12 md:right-12">
        <a
          href="https://wa.me/639171234567"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] text-3xl text-white shadow-xl transition-all duration-300 ease-in-out hover:scale-110 hover:brightness-110 active:scale-95"
        >
          💬
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
    </div>
  );
}
