import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { PageHeader } from '../../components/public/PageHeader.js';
import { BookingLookupForm } from '../../components/extend/BookingLookupForm.js';
import { ActiveRentalCard } from '../../components/extend/ActiveRentalCard.js';
import { ExtendCalendar } from '../../components/extend/ExtendCalendar.js';
import { ExtensionSummary } from '../../components/extend/ExtensionSummary.js';

import { DEFAULT_STORE_ID } from '@lolas/shared';
import lolaFace from '../../assets/Lola Face Cartoon.svg';
import { WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon } from '../../components/public/customerContactIcons.js';
import { formatCurrency } from '../../utils/currency.js';

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
  const defaultLocId = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Array<{ id: number }>>(`/public/booking/locations?storeId=${DEFAULT_STORE_ID}`)
      .then((locs) => {
        if (!cancelled && locs.length > 0) defaultLocId.current = locs[0].id;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleLookup = useCallback(async (email: string, orderReference: string) => {
    setLookupLoading(true); setLookupError(null); setLookupEmail(email);
    try {
      const res = await api.post<{ found: boolean; order?: OrderData }>('/public/extend/lookup', { email, orderReference });
      if (res.found && res.order) { setOrder(res.order); setPageState('rental'); }
      else setLookupError("We couldn't find that booking. Double-check your reference or contact us on WhatsApp for help.");
    } catch { setLookupError("Something went wrong. Please try again or contact us on WhatsApp for help."); }
    finally { setLookupLoading(false); }
  }, []);

  useEffect(() => {
    if (!order || !selectedDate) { setExtensionCost(null); return; }
    const locId = defaultLocId.current ?? 1;
    const newDropoff = `${selectedDate}T${selectedTime}:00`;
    let cancelled = false;
    setQuoteLoading(true);
    setExtensionCost(null);
    (async () => {
      try {
        const q = await api.get<{ rentalSubtotal: number }>(
          `/public/booking/quote?storeId=${order.storeId}&vehicleModelId=${order.vehicleModelId}&pickupDatetime=${encodeURIComponent(order.currentDropoffDatetime)}&dropoffDatetime=${encodeURIComponent(newDropoff)}&pickupLocationId=${locId}&dropoffLocationId=${locId}`,
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
    } finally { setConfirmLoading(false); }
  }

  function handleReset() {
    setPageState('lookup'); setOrder(null); setSelectedDate(null);
    setExtensionCost(null); setLookupError(null);
  }

  return (
    <PageLayout title="Extend My Rental | Lola's Rentals" fullBleed>
      <PageHeader
        eyebrow="Need More Time?"
        headingMain="Extend Your"
        headingAccent="Rental"
        subheading="Loving Siargao? We get it. Extend your rental in just a few clicks."
        className="px-6 pt-6 pb-4 text-center"
      />
      <div className="relative mx-auto max-w-xl overflow-hidden px-4 pt-2 pb-4">
        <div className="relative z-10">

          {pageState === 'confirmed' ? (
          <ConfirmedView dropoff={confirmedDropoff} balance={confirmedBalance} />
        ) : (
          <div className="space-y-6">
            {pageState === 'lookup' && (
              <FadeUpSection>
                <BookingLookupForm loading={lookupLoading} onSubmit={handleLookup} error={lookupError} onFound={() => {}} onNotFound={() => {}} />
              </FadeUpSection>
            )}
            {pageState === 'rental' && order && (
              <>
                <PawDivider size="sm" opacity={0.1} />
                <FadeUpSection>
                  <ActiveRentalCard vehicleModelName={order.vehicleModelName} pickupLocationName={order.pickupLocationName} currentDropoffDatetime={order.currentDropoffDatetime} />
                </FadeUpSection>
                <FadeUpSection>
                  <ExtendCalendar currentDropoff={order.currentDropoffDatetime} selectedDate={selectedDate} selectedTime={selectedTime} onSelectDate={setSelectedDate} onSelectTime={setSelectedTime} />
                </FadeUpSection>
                {selectedDate && (
                  <FadeUpSection>
                    <ExtensionSummary originalTotal={order.originalTotal} extensionCost={extensionCost} extensionDays={extensionDays} originalDays={order.rentalDays} loading={confirmLoading || quoteLoading} onConfirm={handleConfirm} onCancel={handleReset} />
                  </FadeUpSection>
                )}
                {lookupError && (
                  <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
                    {lookupError}{' '}
                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-brand underline"
                    >
                      <img src={phoneIcon} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" width={14} height={14} />
                      WhatsApp us
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
          )}
        </div>
      </div>
    </PageLayout>
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
        <div className="font-lato inline-block rounded-full bg-teal-brand px-5 py-2 text-sm font-black text-white">Extension Confirmed!</div>
        <h2 className="font-headline text-3xl font-black text-teal-brand">Enjoy the extra time!</h2>
        <div className="rounded-4xl bg-cream-brand p-8 shadow-[0_10px_30px_-5px_rgba(26,122,110,0.1)]">
          <p className="font-lato text-[10px] font-black uppercase tracking-widest text-teal-brand/60">New Return Date</p>
          <p className="font-lato mt-2 text-2xl font-black text-teal-brand">{formatted}</p>
          {balance > 0 && (
            <div className="mt-6 border-t-2 border-sand-brand pt-6">
              <p className="font-lato text-[10px] font-black uppercase tracking-widest text-gold-brand/60">Balance Due</p>
              <p className="font-lato mt-1 text-3xl font-black text-gold-brand">{formatCurrency(balance)}</p>
              <p className="font-lato mt-1 text-xs font-bold text-charcoal-brand/50">Please settle at return</p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Link to="/book/reserve">
            <PrimaryCtaButton className="flex min-h-[44px] w-full items-center justify-center gap-2 py-5 text-lg">Back to Browse</PrimaryCtaButton>
          </Link>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-lato inline-flex items-center justify-center gap-2 text-sm font-bold text-teal-brand underline transition-opacity hover:opacity-80"
          >
            <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain" width={16} height={16} />
            Need help? Chat with Lola&apos;s Team
          </a>
        </div>
      </div>
    </FadeUpSection>
  );
}
