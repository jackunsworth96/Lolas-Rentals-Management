import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { WHATSAPP_URL } from '../../config/contact.js';

type CancelPhase = 'confirming' | 'loading' | 'success' | 'error';

interface ErrorInfo {
  code: string;
  message: string;
}

function apiBase(): string {
  const raw = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim() || '/api';
  const base = raw.replace(/\/+$/, '');
  if (base.startsWith('http')) return base.endsWith('/api') ? base : `${base}/api`;
  return base || '/api';
}

function errorDisplay(err: ErrorInfo) {
  switch (err.code) {
    case 'ALREADY_PROCESSED':
      return {
        icon: '⚠️',
        title: 'Already Processed',
        body: 'This booking has already been processed and cannot be cancelled.',
      };
    case 'INVALID_TOKEN':
    case 'UNAUTHORIZED':
      return {
        icon: '🔒',
        title: 'Invalid Link',
        body: 'Invalid cancellation link. Please use the link from your booking confirmation email.',
      };
    case 'NOT_FOUND':
      return {
        icon: '🔍',
        title: 'Not Found',
        body: 'Booking not found.',
      };
    default:
      return {
        icon: '❌',
        title: 'Something Went Wrong',
        body: 'Something went wrong. Please contact us on WhatsApp.',
      };
  }
}

export default function CancelBookingPage() {
  const { orderReference } = useParams<{ orderReference: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [phase, setPhase] = useState<CancelPhase>(!token ? 'error' : 'confirming');
  const [error, setError] = useState<ErrorInfo | null>(
    !token ? { code: 'INVALID_TOKEN', message: 'Invalid cancellation link.' } : null,
  );

  async function handleCancel() {
    setPhase('loading');
    try {
      const res = await fetch(
        `${apiBase()}/public/booking/cancel/${encodeURIComponent(orderReference!)}?token=${encodeURIComponent(token!)}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' } },
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setPhase('success');
      } else {
        setPhase('error');
        setError(json.error ?? { code: 'UNKNOWN', message: 'Something went wrong.' });
      }
    } catch {
      setPhase('error');
      setError({ code: 'NETWORK', message: 'Something went wrong. Please try again.' });
    }
  }

  return (
    <PageLayout title="Cancel Booking | Lola's Rentals" showFloralRight={false}>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">

        {/* ── STATE 1: Confirming ── */}
        {phase === 'confirming' && (
          <>
            <span className="mb-4 text-5xl">🗓️</span>
            <h2 className="mb-2 font-headline text-3xl font-black text-charcoal-brand">
              Cancel Booking
            </h2>
            <p
              className="mb-1 font-lato text-xs font-bold uppercase tracking-widest text-charcoal-brand/50"
            >
              Reference
            </p>
            <p
              className="mb-6 font-lato text-2xl font-black text-charcoal-brand"
              style={{ letterSpacing: '0.12em', borderBottom: '4px solid #FCBC5A', paddingBottom: 4 }}
            >
              {orderReference}
            </p>
            <div className="mb-8 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
              <p className="font-lato text-sm font-semibold text-red-700">
                This action cannot be undone. Your booking will be permanently cancelled.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="mb-3 w-full rounded-xl bg-teal-brand py-4 font-headline text-lg font-black text-white shadow-md transition-all duration-300 hover:brightness-110 active:scale-[0.98]"
            >
              Yes, Cancel My Booking
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="w-full rounded-xl border-2 border-charcoal-brand/20 bg-white py-4 font-headline text-lg font-black text-charcoal-brand transition-all duration-300 hover:bg-sand-brand"
            >
              Keep My Booking
            </button>
          </>
        )}

        {/* ── STATE 2: Loading ── */}
        {phase === 'loading' && (
          <>
            <div className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
            <p className="font-lato text-sm text-charcoal-brand/60">
              Cancelling your booking…
            </p>
          </>
        )}

        {/* ── STATE 3a: Success ── */}
        {phase === 'success' && (
          <>
            <span className="mb-4 text-5xl">✅</span>
            <h2 className="mb-2 font-headline text-3xl font-black text-charcoal-brand">
              Booking Cancelled
            </h2>
            <p className="mb-1 font-lato text-xs font-bold uppercase tracking-widest text-charcoal-brand/50">
              Reference
            </p>
            <p
              className="mb-6 font-lato text-xl font-black text-charcoal-brand/60"
              style={{ letterSpacing: '0.12em' }}
            >
              {orderReference}
            </p>
            <p className="mb-8 font-lato text-sm leading-relaxed text-charcoal-brand/60">
              Your booking has been cancelled. A confirmation email has been sent to your inbox.
            </p>
            <Link
              to="/"
              className="w-full rounded-xl bg-teal-brand py-4 text-center font-headline text-lg font-black text-white shadow-md transition-all duration-300 hover:brightness-110"
            >
              Back to Home
            </Link>
          </>
        )}

        {/* ── STATE 3b: Error ── */}
        {phase === 'error' && error && (() => {
          const info = errorDisplay(error);
          return (
            <>
              <span className="mb-4 text-5xl">{info.icon}</span>
              <h2 className="mb-2 font-headline text-3xl font-black text-charcoal-brand">
                {info.title}
              </h2>
              <p className="mb-8 font-lato text-sm leading-relaxed text-charcoal-brand/60">
                {info.body}
              </p>
              {error.code !== 'INVALID_TOKEN' && error.code !== 'UNAUTHORIZED' && (
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-4 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 font-lato font-bold text-white shadow-md transition-all duration-300 hover:brightness-110"
                >
                  💬 Chat with Lola's Team
                </a>
              )}
              <Link
                to="/"
                className="font-lato text-sm font-semibold text-teal-brand underline decoration-2 underline-offset-4 transition-opacity hover:opacity-80"
              >
                Back to Home
              </Link>
            </>
          );
        })()}

      </div>
    </PageLayout>
  );
}
