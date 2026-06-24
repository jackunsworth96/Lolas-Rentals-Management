import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, CreditCard, MessageCircle } from 'lucide-react';
import { api, ApiError } from '../../api/client.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { WHATSAPP_URL } from '../../config/contact.js';
import { formatCurrency } from '../../utils/currency.js';

interface ExtensionPaymentSummary {
  found: boolean;
  orderReference: string;
  pendingAmount: number;
  paymentAvailable: boolean;
  provider: 'xendit';
  message: string;
}

export default function ExtensionPaymentPage() {
  const [searchParams] = useSearchParams();
  const ref = useMemo(() => searchParams.get('ref')?.trim() ?? '', [searchParams]);

  const { data, isLoading, error } = useQuery<ExtensionPaymentSummary>({
    queryKey: ['extension-payment-summary', ref],
    queryFn: () => api.get(`/public/extend/payment-summary?ref=${encodeURIComponent(ref)}`),
    enabled: !!ref,
    retry: false,
  });

  const notFound =
    !ref ||
    (error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR'));

  return (
    <PageLayout title="Extension Payment | Lola's Rentals" showFloralRight={false}>
      <SEO
        title="Extension Payment | Lola's Rentals"
        description="Review your rental extension balance."
        noIndex={true}
      />

      <div className="mx-auto flex min-h-[64vh] max-w-xl flex-col justify-center px-4 py-12 sm:px-6">
        <FadeUpSection>
          <Link
            to="/book/extend"
            className="mb-6 inline-flex items-center gap-2 text-sm font-black text-teal-brand transition-colors hover:text-teal-brand/80"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to extensions
          </Link>

          <div className="rounded-[28px] border border-teal-brand/15 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-brand/10 text-teal-brand">
              <CreditCard className="h-6 w-6" />
            </div>

            <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-gold-brand">
              Extension payment
            </p>
            <h1 className="mt-2 font-headline text-4xl font-black leading-tight text-charcoal-brand sm:text-5xl">
              Online payment is coming soon
            </h1>

            {isLoading && (
              <div className="mt-8 flex items-center gap-3 rounded-2xl bg-sand-brand/70 px-4 py-3 text-sm font-bold text-charcoal-brand/70">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-brand border-t-transparent" />
                Checking extension balance
              </div>
            )}

            {notFound && !isLoading && (
              <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                We could not find an extension balance for this booking reference.
              </p>
            )}

            {data && !isLoading && (
              <>
                <div className="mt-6 rounded-2xl bg-sand-brand/70 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-widest text-charcoal-brand/40">
                    Booking reference
                  </p>
                  <p className="mt-1 text-lg font-black text-charcoal-brand">{data.orderReference}</p>

                  <div className="mt-4 border-t border-charcoal-brand/10 pt-4">
                    <p className="text-xs font-black uppercase tracking-widest text-charcoal-brand/40">
                      Pending extension balance
                    </p>
                    <p className="mt-1 font-headline text-4xl font-black text-teal-brand">
                      {formatCurrency(data.pendingAmount)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex gap-3 rounded-2xl border border-gold-brand/20 bg-gold-brand/10 px-4 py-4">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold-brand" />
                  <p className="text-sm font-semibold leading-relaxed text-charcoal-brand/70">
                    Xendit checkout is not live yet. You can still pay this balance when you return your rental.
                  </p>
                </div>
              </>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled
                className="inline-flex flex-1 cursor-not-allowed items-center justify-center rounded-2xl bg-charcoal-brand/20 px-5 py-3 text-sm font-black text-white"
              >
                Pay online soon
              </button>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-green-500 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-green-600"
              >
                <MessageCircle className="h-4 w-4" />
                Message the team
              </a>
            </div>
          </div>
        </FadeUpSection>
      </div>
    </PageLayout>
  );
}
