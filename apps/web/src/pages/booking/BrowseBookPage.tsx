import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { SearchBar } from '../../components/booking/SearchBar.js';
import { VehicleCard } from '../../components/booking/VehicleCard.js';
import { HoldCountdown } from '../../components/booking/HoldCountdown.js';

import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import logo from '../../assets/Lolas Original Logo.svg';
import pawPrint from '../../assets/Paw Print.svg';

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
    return () => { document.getElementById(id)?.remove(); };
  }, []);
}

interface AvailableModel {
  modelId: string;
  modelName: string;
  availableCount: number;
}

interface QuoteData {
  dailyRate: number;
  securityDeposit: number;
}

interface Toast { msg: string; type: 'success' | 'error'; id: number }

const STORES = [
  { id: 'store-lolas', name: "Lola's Rentals (General Luna)" },
  { id: 'store-bass', name: 'Bass Bikes (Cloud 9)' },
];

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
      className="relative min-h-screen overflow-x-hidden font-body"
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
          <Link to="/browse-book" className="font-bold text-gold-brand">Reserve</Link>
          <Link to="/paw-card" className="text-white/80 transition-colors hover:text-white">Paw Card</Link>
        </div>
        <Link
          to="/basket"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/20 text-white transition-colors hover:bg-white/10"
        >
          🛒
          {basket.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold-brand text-[10px] font-black text-charcoal-brand">
              {basket.length}
            </span>
          )}
        </Link>
      </header>

      <main className="relative mx-auto min-h-screen max-w-7xl px-4 pb-32 pt-28 md:px-8">
        {/* Search Bar */}
        <section className="relative z-10 mb-12">
          <SearchBar stores={STORES} onSearch={handleSearch} searching={isLoading} />
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

        {/* Divider */}
        {isSearched && (
          <div className="my-12 flex justify-center">
            <img src={pawPrint} alt="" className="h-10 w-10 opacity-10" />
          </div>
        )}

        {/* Vehicle grid */}
        {isSearched && (
          <section className="relative z-10">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="font-headline text-3xl font-black tracking-tight text-teal-brand">
                Available Fleet{' '}
                <span className="text-gold-brand">Siargao</span>
              </h2>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="animate-pulse rounded-4xl bg-sand-brand">
                    <div className="h-64 rounded-t-4xl bg-sand-brand" />
                    <div className="space-y-3 p-6">
                      <div className="h-6 w-2/3 rounded bg-cream-brand" />
                      <div className="h-4 w-1/3 rounded bg-cream-brand" />
                      <div className="h-12 w-full rounded-3xl bg-cream-brand" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !availableModels || availableModels.length === 0 ? (
              <div className="rounded-4xl bg-cream-brand px-8 py-16 text-center">
                <p className="mb-2 text-lg font-bold text-charcoal-brand">
                  No vehicles available for these dates.
                </p>
                <p className="text-sm text-charcoal-brand/70">
                  Try adjusting your dates or{' '}
                  <a
                    href="https://wa.me/639171234567"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-teal-brand underline"
                  >
                    contact us on WhatsApp
                  </a>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {availableModels.map((m) => (
                  <VehicleCard
                    key={m.modelId}
                    modelId={m.modelId}
                    modelName={m.modelName}
                    availableCount={m.availableCount}
                    dailyRate={quotes[m.modelId]?.dailyRate ?? null}
                    securityDeposit={quotes[m.modelId]?.securityDeposit ?? null}
                    onToast={pushToast}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full bg-sand-brand">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-10 py-16 md:flex-row">
          <div className="max-w-sm space-y-4">
            <span className="font-headline text-2xl font-black text-teal-brand">Lola's Rentals</span>
            <p className="text-sm leading-relaxed text-charcoal-brand/70">
              © {new Date().getFullYear()} Lola's Rentals. Supporting Siargao Dog Rescue &amp; Local Reforestation.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-4">
            <a href="#" className="text-sm font-bold text-charcoal-brand/60 transition-all hover:text-teal-brand">Island Safety</a>
            <a href="#" className="text-sm font-bold text-charcoal-brand/60 transition-all hover:text-teal-brand">Dog Rescue NGO</a>
            <a href="#" className="text-sm font-bold text-charcoal-brand/60 transition-all hover:text-teal-brand">Rentals FAQ</a>
            <a href="#" className="text-sm font-bold text-charcoal-brand/60 transition-all hover:text-teal-brand">Sustainability</a>
          </div>
        </div>
      </footer>

      {/* Bottom mobile nav */}
      <nav className="fixed bottom-0 left-0 z-50 flex h-24 w-full items-center justify-around rounded-t-5xl bg-cream-brand px-4 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] md:hidden">
        <Link to="/" className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50">
          <span className="text-lg">🏠</span>Home
        </Link>
        <Link to="/browse-book" className="flex scale-110 flex-col items-center gap-0.5 rounded-3xl bg-[#D1E7E4] px-6 py-2 text-xs font-black text-teal-brand">
          <span className="text-lg">🏍️</span>Reserve
        </Link>
        <Link to="/paw-card" className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50">
          <span className="text-lg">🐾</span>Paw Card
        </Link>
      </nav>

      {/* WhatsApp FAB */}
      <div className="fixed bottom-28 right-6 z-40 md:bottom-12 md:right-12">
        <a
          href="https://wa.me/639171234567"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] text-3xl text-white shadow-xl transition-all hover:scale-110 active:scale-95"
        >
          💬
        </a>
      </div>

      {/* Toast notifications */}
      <div className="fixed right-4 top-20 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-slide-up rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${
              t.type === 'success'
                ? 'bg-teal-brand text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
