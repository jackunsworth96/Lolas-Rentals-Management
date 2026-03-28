import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { BookingLookupForm } from '../../components/extend/BookingLookupForm.js';
import { ActiveRentalCard } from '../../components/extend/ActiveRentalCard.js';
import { ExtendCalendar } from '../../components/extend/ExtendCalendar.js';
import { ExtensionSummary } from '../../components/extend/ExtensionSummary.js';

import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import logo from '../../assets/Lolas Original Logo.svg';
import pawPrint from '../../assets/Paw Print.svg';
import lolaFace from '../../assets/Lola Face Cartoon.svg';

function useFonts() {
  useEffect(() => {
    const id = 'extend-fonts';
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

interface OrderData {
  orderReference: string;
  vehicleModelName: string;
  vehicleModelId: string;
  storeId: string;
  currentDropoffDatetime: string;
  pickupLocationName: string;
  originalTotal: number;
  rentalDays: number;
}

type PageState = 'lookup' | 'rental' | 'confirmed';

const DEFAULT_TIME = '16:45';

export default function ExtendPage() {
  useFonts();
  const [pageState, setPageState] = useState<PageState>('lookup');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState(DEFAULT_TIME);
  const [extensionCost, setExtensionCost] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmedDropoff, setConfirmedDropoff] = useState('');
  const [confirmedBalance, setConfirmedBalance] = useState(0);
  const [lookupEmail, setLookupEmail] = useState('');

  const handleLookup = useCallback(async (email: string, orderReference: string) => {
    setLookupLoading(true); setLookupError(null); setLookupEmail(email);
    try {
      const res = await api.post<{ found: boolean; order?: OrderData }>('/public/extend/lookup', { email, orderReference });
      if (res.found && res.order) { setOrder(res.order); setPageState('rental'); }
      else setLookupError("We couldn't find that booking. Double-check your reference or");
    } catch { setLookupError("Something went wrong. Please try again or"); }
    finally { setLookupLoading(false); }
  }, []);

  // Fetch extension quote when date changes
  useEffect(() => {
    if (!order || !selectedDate) { setExtensionCost(null); return; }
    const newDropoff = `${selectedDate}T${selectedTime}:00`;
    let cancelled = false;
    setQuoteLoading(true);
    setExtensionCost(null);

    (async () => {
      try {
        const q = await api.get<{ rentalSubtotal: number }>(
          `/public/booking/quote?storeId=${order.storeId}&vehicleModelId=${order.vehicleModelId}&pickupDatetime=${encodeURIComponent(order.currentDropoffDatetime)}&dropoffDatetime=${encodeURIComponent(newDropoff)}&pickupLocationId=1&dropoffLocationId=1`,
        );
        if (!cancelled) setExtensionCost(q.rentalSubtotal);
      } catch {
        if (!cancelled) setExtensionCost(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order, selectedDate, selectedTime]);

  const extensionDays = selectedDate && order
    ? Math.max(1, Math.ceil((new Date(selectedDate).getTime() - new Date(order.currentDropoffDatetime).getTime()) / 86400000))
    : 0;

  async function handleConfirm() {
    if (!order || !selectedDate) return;
    setConfirmLoading(true);
    const newDropoff = `${selectedDate}T${selectedTime}:00`;
    try {
      const res = await api.post<{ success: boolean; newDropoffDatetime?: string; extensionCost?: number; reason?: string }>(
        '/public/extend/confirm',
        { orderReference: order.orderReference, email: lookupEmail, newDropoffDatetime: newDropoff },
      );
      if (res.success) {
        setConfirmedDropoff(res.newDropoffDatetime ?? newDropoff);
        setConfirmedBalance(res.extensionCost ?? extensionCost ?? 0);
        setPageState('confirmed');
      } else {
        setLookupError(res.reason ?? 'Extension failed. Please try again.');
      }
    } catch {
      setLookupError('Something went wrong. Please try again.');
    } finally {
      setConfirmLoading(false);
    }
  }

  function handleReset() {
    setPageState('lookup');
    setOrder(null);
    setSelectedDate(null);
    setExtensionCost(null);
    setLookupError(null);
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden font-body animate-page-fade-in" style={{ background: '#FAF6F0' }}>
      <img src={flowerLeft} alt="" className="pointer-events-none fixed left-0 top-1/2 z-0 w-32 -translate-y-1/2 object-contain md:w-56" />
      <img src={flowerRight} alt="" className="pointer-events-none fixed right-0 top-1/4 z-0 w-28 object-contain md:w-48" />

      {/* Header */}
      <header className="fixed left-0 top-0 z-50 flex w-full items-center justify-between bg-teal-brand px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Lola's Rentals" className="h-8 w-auto brightness-0 invert" />
        </div>
        <div className="hidden items-center gap-8 md:flex">
          <Link to="/browse-book" className="text-white/80 transition-opacity duration-200 hover:text-white hover:opacity-80">Reserve</Link>
          <Link to="/extend" className="font-bold text-gold-brand transition-opacity duration-200 hover:opacity-80">My Rentals</Link>
          <Link to="/paw-card" className="text-white/80 transition-opacity duration-200 hover:text-white hover:opacity-80">Paw Card</Link>
        </div>
        <Link to="/basket" className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/20 text-white transition-all duration-300 hover:bg-white/10">🛒</Link>
      </header>

      <main className="relative z-10 mx-auto max-w-xl px-4 pb-32 pt-24">
        {/* Hero */}
        <div className="mb-10 text-center">
          <h1 className="mb-4 font-headline text-4xl font-black leading-tight text-teal-brand md:text-5xl">
            Extend Your Island Time
          </h1>
          <p className="px-4 font-medium text-charcoal-brand/70">
            Not ready to leave yet? We understand. Use the form below to find your rental and choose a new return date.
          </p>
        </div>

        {pageState === 'confirmed' ? (
          <ConfirmedView dropoff={confirmedDropoff} balance={confirmedBalance} />
        ) : (
          <div className="space-y-6">
            {pageState === 'lookup' && (
              <FadeUpSection>
                <BookingLookupForm
                  loading={lookupLoading}
                  onSubmit={handleLookup}
                  error={lookupError}
                  onFound={() => {}}
                  onNotFound={() => {}}
                />
              </FadeUpSection>
            )}

            {pageState === 'rental' && order && (
              <>
                <div className="flex justify-center py-4">
                  <img src={pawPrint} alt="" className="h-12 w-12 bg-transparent opacity-10" />
                </div>

                <FadeUpSection>
                  <ActiveRentalCard
                    vehicleModelName={order.vehicleModelName}
                    pickupLocationName={order.pickupLocationName}
                    currentDropoffDatetime={order.currentDropoffDatetime}
                  />
                </FadeUpSection>

                <FadeUpSection>
                  <ExtendCalendar
                    currentDropoff={order.currentDropoffDatetime}
                    selectedDate={selectedDate}
                    selectedTime={selectedTime}
                    onSelectDate={setSelectedDate}
                    onSelectTime={setSelectedTime}
                  />
                </FadeUpSection>

                {selectedDate && (
                  <FadeUpSection>
                    <ExtensionSummary
                      originalTotal={order.originalTotal}
                      extensionCost={extensionCost}
                      extensionDays={extensionDays}
                      originalDays={order.rentalDays}
                      loading={confirmLoading || quoteLoading}
                      onConfirm={handleConfirm}
                      onCancel={handleReset}
                    />
                  </FadeUpSection>
                )}

                {lookupError && (
                  <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
                    {lookupError}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 z-50 flex h-24 w-full items-center justify-around rounded-t-5xl bg-cream-brand px-4 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] md:hidden">
        {[{ to: '/', icon: '🏠', label: 'Home' }, { to: '/browse-book', icon: '🏍️', label: 'Reserve' }, { to: '/extend', icon: '📅', label: 'Rentals', active: true }, { to: '/paw-card', icon: '🐾', label: 'Paw Card' }].map((n) => (
          <Link key={n.to} to={n.to} className={`flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black ${n.active ? 'scale-110 rounded-3xl bg-[#D1E7E4] px-6 text-teal-brand' : 'text-charcoal-brand/50'}`}>
            <span className="text-lg">{n.icon}</span>{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function ConfirmedView({ dropoff, balance }: { dropoff: string; balance: number }) {
  const formatted = new Date(dropoff).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  return (
    <FadeUpSection>
      <div className="space-y-8 text-center">
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-gold-brand/20">
          <img src={lolaFace} alt="Lola" className="h-20 w-20 animate-bounce rounded-full object-cover" style={{ animationDuration: '3s' }} />
        </div>
        <div className="inline-block rounded-full bg-teal-brand px-5 py-2 text-sm font-black text-white">
          Extension Confirmed!
        </div>
        <h2 className="font-headline text-3xl font-black text-teal-brand">Enjoy the extra time!</h2>

        <div className="rounded-4xl bg-cream-brand p-8 shadow-[0_10px_30px_-5px_rgba(26,122,110,0.1)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-teal-brand/60">New Return Date</p>
          <p className="mt-2 text-2xl font-black text-teal-brand">{formatted}</p>

          {balance > 0 && (
            <div className="mt-6 border-t-2 border-sand-brand pt-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-gold-brand/60">Balance Due</p>
              <p className="mt-1 text-3xl font-black text-gold-brand">
                ₱{balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs font-bold text-charcoal-brand/50">Please settle at return</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Link to="/browse-book">
            <PrimaryCtaButton className="flex w-full items-center justify-center gap-2 py-5 text-lg">
              Back to Browse
            </PrimaryCtaButton>
          </Link>
          <a
            href="https://wa.me/639171234567"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-bold text-teal-brand underline transition-opacity hover:opacity-80"
          >
            Need help? Chat with Lola's Team
          </a>
        </div>
      </div>
    </FadeUpSection>
  );
}
