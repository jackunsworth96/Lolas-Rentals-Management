import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { WHATSAPP_URL } from '../../config/contact.js';

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
    'w-full rounded-full bg-sand-brand px-5 py-3 font-medium text-charcoal-brand outline-none transition-all duration-200 focus:scale-[1.01] focus:ring-2 focus:ring-teal-brand placeholder:text-charcoal-brand/40';

  const isDisabled = loading || !email.trim() || !orderRef.trim();

  return (
    <section className="rounded-4xl bg-cream-brand p-6 shadow-[0_10px_30px_-5px_rgba(26,122,110,0.1)]">
      <h2 className="mb-4 flex items-center gap-3 font-headline text-2xl font-black text-teal-brand">
        <span className="text-xl">🔍</span>
        Find Your Booking
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="ml-2 text-sm font-bold text-teal-brand">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="aloha@island.com"
            autoComplete="email"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="ml-2 text-sm font-bold text-teal-brand">Order Reference</label>
          <input
            type="text"
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
            placeholder="LR-0329-A1B2"
            required
            className={inputClass}
          />
        </div>

        {error && (
          <div className="rounded-2xl bg-sand-brand px-4 py-3 text-sm font-bold text-charcoal-brand/70">
            {error}{' '}
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-black text-teal-brand underline">
              WhatsApp us
            </a>
          </div>
        )}

        <button
          type="submit"
          disabled={isDisabled}
          className="w-full rounded-[6px] border-2 border-charcoal-brand bg-gold-brand font-lato text-sm font-extrabold uppercase tracking-[0.05em] text-charcoal-brand transition-all duration-150 disabled:pointer-events-none disabled:opacity-40"
          style={{ padding: '14px 24px', boxShadow: isDisabled ? 'none' : '4px 4px 0 #363737' }}
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
