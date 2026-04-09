import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon } from '../public/customerContactIcons.js';
import searchIcon from '../../assets/Original Assests/search_icon.svg';

interface Props {
  onFound: (order: Record<string, unknown>) => void;
  onNotFound: () => void;
  loading: boolean;
  onSubmit: (email: string, orderReference: string) => void;
  error: string | null;
}

export function BookingLookupForm({ loading, onSubmit, error }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [email, setEmail] = useState('');
  const [orderRef, setOrderRef] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !orderRef.trim()) return;
    onSubmit(email.trim(), orderRef.trim());
  }

  const inputClass =
    'w-full rounded-full bg-sand-brand px-3 py-2 text-sm font-medium text-charcoal-brand outline-none transition-all duration-200 focus:scale-[1.01] focus:ring-2 focus:ring-teal-brand placeholder:text-charcoal-brand/40 sm:px-5 sm:py-2.5 sm:text-base';

  const isDisabled = loading || !email.trim() || !orderRef.trim();

  return (
    <section className="rounded-3xl bg-cream-brand px-4 py-3 shadow-[0_10px_30px_-5px_rgba(26,122,110,0.1)] sm:rounded-4xl sm:px-10 sm:py-4">
      <h2 className="mb-2 flex items-center gap-2 font-headline text-lg font-black text-teal-brand sm:mb-3 sm:gap-3 sm:text-2xl">
        <img
          src={searchIcon}
          alt=""
          className="h-5 w-5 shrink-0 object-contain sm:h-7 sm:w-7"
          width={28}
          height={28}
          aria-hidden
        />
        Find Your Booking
      </h2>

      <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <div className="min-w-0 space-y-1 sm:space-y-1.5">
            <label htmlFor="extend-lookup-email" className="ml-0 block text-[11px] font-bold text-teal-brand sm:ml-2 sm:text-sm">
              <span className="sm:hidden">Email</span>
              <span className="hidden sm:inline">Email Address</span>
            </label>
            <input
              id="extend-lookup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="aloha@island.com"
              autoComplete="email"
              required
              className={inputClass}
            />
          </div>

          <div className="min-w-0 space-y-1 sm:space-y-1.5">
            <label htmlFor="extend-lookup-ref" className="ml-0 block text-[11px] font-bold text-teal-brand sm:ml-2 sm:text-sm">
              <span className="sm:hidden">Reference</span>
              <span className="hidden sm:inline">Order Reference</span>
            </label>
            <input
              id="extend-lookup-ref"
              type="text"
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
              placeholder="LR-0329-A1B2"
              required
              className={inputClass}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-sand-brand px-3 py-2 text-xs font-bold text-charcoal-brand/70 sm:px-4 sm:py-3 sm:text-sm">
            {error}{' '}
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-black text-teal-brand underline"
            >
              <img src={phoneIcon} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" width={14} height={14} />
              WhatsApp us
            </a>
          </div>
        )}

        <button
          type="submit"
          disabled={isDisabled}
          className="w-full rounded-[6px] border-2 border-charcoal-brand bg-gold-brand px-4 py-2 font-lato text-xs font-extrabold uppercase tracking-[0.05em] text-charcoal-brand transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 sm:px-6 sm:py-2.5 sm:text-sm"
          style={{ boxShadow: isDisabled ? 'none' : '4px 4px 0 #363737' }}
          onMouseEnter={(e) => {
            if (!prefersReducedMotion && !isDisabled) (e.currentTarget as HTMLButtonElement).style.boxShadow = '2px 2px 0 #363737';
          }}
          onMouseLeave={(e) => {
            if (!prefersReducedMotion && !isDisabled) (e.currentTarget as HTMLButtonElement).style.boxShadow = '4px 4px 0 #363737';
          }}
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
              Searching…
            </span>
          ) : 'Locate Rental'}
        </button>
      </form>
    </section>
  );
}
