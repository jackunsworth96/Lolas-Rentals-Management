import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { normalizeApiBase } from '../../api/normalize-api-base.js';

type Phase = 'loading' | 'success' | 'error';

function apiBase(): string {
  return normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);
}

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setPhase('error');
      return;
    }

    fetch(`${apiBase()}/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.ok) {
          setPhase('success');
        } else {
          setPhase('error');
        }
      })
      .catch(() => setPhase('error'));
  }, [searchParams]);

  return (
    <>
      <SEO
        noIndex={true}
        title="Unsubscribe | Lola's Rentals Siargao"
        description="Manage your email preferences with Lola's Rentals."
      />
      <PageLayout title="Email Preferences">
        <article className="mx-auto max-w-2xl px-4 py-12">
          <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
            {phase === 'loading' && (
              <>
                <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
                <p className="text-charcoal-brand/70">Processing your request...</p>
              </>
            )}

            {phase === 'success' && (
              <>
                <div className="mb-4 text-4xl">✅</div>
                <h1 className="mb-3 font-headline text-2xl font-bold text-charcoal-brand">
                  You've been unsubscribed.
                </h1>
                <p className="mb-8 text-charcoal-brand/70 leading-relaxed">
                  You won't receive follow-up emails from us.
                </p>
                <Link
                  to="/book"
                  className="inline-block rounded-full bg-teal-brand px-8 py-3 font-headline font-bold !text-white shadow-md transition-all hover:opacity-90"
                >
                  Back to Homepage
                </Link>
              </>
            )}

            {phase === 'error' && (
              <>
                <div className="mb-4 text-4xl">⚠️</div>
                <h1 className="mb-3 font-headline text-2xl font-bold text-charcoal-brand">
                  Invalid link
                </h1>
                <p className="mb-8 text-charcoal-brand/70 leading-relaxed">
                  This unsubscribe link is invalid or has already been used.
                </p>
                <Link
                  to="/book"
                  className="inline-block rounded-full bg-teal-brand px-8 py-3 font-headline font-bold !text-white shadow-md transition-all hover:opacity-90"
                >
                  Back to Homepage
                </Link>
              </>
            )}
          </div>
        </article>
      </PageLayout>
    </>
  );
}
