import { useState } from 'react';
import lolaFace from '../../assets/Lola Face Icon.svg';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { WHATSAPP_URL } from '../../config/contact.js';
import { useReducedMotion } from 'framer-motion';
import { api } from '../../api/client.js';

export type PawCardAccess = {
  email: string;
  customerId: string | null;
  customerName: string | null;
};

type LookupResponse =
  | { found: false }
  | { found: true; customerId: string | null; customerName: string | null };

const WHATSAPP_HREF = WHATSAPP_URL;

type Props = {
  access: PawCardAccess | null;
  onAccessGranted: (access: PawCardAccess) => void;
  /** Hides the Lola icon, "Welcome" heading and description — for inline/embedded placement */
  compact?: boolean;
};

export function PawCardLoginPanel({ access, onAccessGranted, compact = false }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [notRecognised, setNotRecognised] = useState(false);
  const [requestError, setRequestError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotRecognised(false);
    setRequestError('');
    setLoading(true);
    try {
      const data = await api.post<LookupResponse>('/public/paw-card/lookup', {
        email: email.trim(),
      });
      if (data.found) {
        onAccessGranted({
          email: email.trim().toLowerCase(),
          customerId: data.customerId,
          customerName: data.customerName,
        });
      } else {
        setNotRecognised(true);
      }
    } catch {
      setRequestError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (access) return null;

  return (
    <div className="font-lato">
      {!compact && (
        <>
          <img
            src={lolaFace}
            alt="Lola"
            className="mx-auto mb-3 h-16 w-16 rounded-full border-4 border-amber-200/40 bg-transparent p-1 object-contain"
          />
          <h3
            className="font-headline mb-1 text-center text-2xl font-bold"
            style={{ color: '#1f1b12' }}
          >
            Welcome
          </h3>
          <p className="mb-6 text-center text-sm" style={{ color: '#3e4946' }}>
            Enter the email you used when you rented with us to access your Paw Card
          </p>
        </>
      )}

      <form onSubmit={handleSubmit} className={`space-y-3 ${compact ? 'text-center' : 'text-left'}`}>
        <div>
          <label className={`mb-1.5 block text-sm font-semibold ${compact ? 'text-center' : 'ml-1 text-left'}`}>
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hello@siargao.com"
            className="w-full rounded-lg px-4 py-3 transition-all duration-200 focus:scale-[1.01] focus:ring-2 focus:ring-teal-brand/40"
            style={{ background: '#ffffff', border: '2px solid #d4c4ae', outlineColor: '#1A7A6E' }}
          />
        </div>
        {compact ? (
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[6px] border-2 border-charcoal-brand bg-gold-brand px-6 py-4 font-lato text-sm font-extrabold uppercase tracking-[0.05em] text-charcoal-brand transition-all duration-150 disabled:pointer-events-none disabled:opacity-50"
            style={{
              boxShadow: prefersReducedMotion ? 'none' : '4px 4px 0 #363737',
            }}
            onMouseEnter={(e) => {
              if (!prefersReducedMotion) (e.currentTarget as HTMLButtonElement).style.boxShadow = '2px 2px 0 #363737';
            }}
            onMouseLeave={(e) => {
              if (!prefersReducedMotion) (e.currentTarget as HTMLButtonElement).style.boxShadow = '4px 4px 0 #363737';
            }}
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
                Checking…
              </span>
            ) : (
              'Access My Paw Card'
            )}
          </button>
        ) : (
          <PrimaryCtaButton type="submit" disabled={loading} className="w-full py-3.5 font-bold">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
                Checking…
              </span>
            ) : (
              'Access My Paw Card'
            )}
          </PrimaryCtaButton>
        )}
        {requestError && (
          <p className="text-center text-sm text-red-600">{requestError}</p>
        )}
        {notRecognised && (
          <div className="rounded-lg p-4 text-left text-sm leading-relaxed" style={{ background: 'rgba(245,183,49,0.12)', color: '#3e4946' }}>
            <p className="mb-3">
              We don&apos;t recognise that email. Only customers who have rented with us can access the Paw Card.
              Questions? Message us on WhatsApp.
            </p>
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex font-bold underline transition-opacity duration-200 hover:opacity-80"
              style={{ color: '#1A7A6E' }}
            >
              Message us on WhatsApp
            </a>
          </div>
        )}
      </form>
    </div>
  );
}
