import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Mail,
  MessageCircle,
} from 'lucide-react';
import { api, ApiError } from '../../api/client.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { WHATSAPP_URL } from '../../config/contact.js';
import { formatCurrency } from '../../utils/currency.js';

interface ExtensionPaymentSummary {
  found: boolean;
  orderReference: string;
  principalAmountPHP: number;
  surchargeAmountPHP: number;
  surchargePercent: number;
  totalAmountPHP: number;
  paymentAvailable: boolean;
  provider: 'xendit';
  message: string;
}

interface XenditSessionResult {
  sessionId: string;
  checkoutUrl: string;
  expiresAt: string;
  amountPHP: number;
}

interface XenditSessionStatus {
  status: 'creating' | 'active' | 'completed' | 'expired' | 'cancelled' | 'failed' | 'reconciliation_required';
  amount_php: number;
  currency: string;
  completed_at: string | null;
  expires_at: string | null;
}

function storageKey(reference: string): string {
  return `extension_payment_email_${reference}`;
}

export default function ExtensionPaymentPage() {
  const [searchParams] = useSearchParams();
  const ref = useMemo(() => searchParams.get('ref')?.trim() ?? '', [searchParams]);
  const returnState = searchParams.get('payment');
  const paymentSessionId = searchParams.get('paymentSession')?.trim() ?? '';
  const paymentState = searchParams.get('paymentState')?.trim() ?? '';
  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref) return;
    const savedEmail = sessionStorage.getItem(storageKey(ref)) ?? '';
    setEmail(savedEmail);
    setVerifiedEmail(savedEmail);
  }, [ref]);

  const summaryQuery = useQuery<ExtensionPaymentSummary>({
    queryKey: ['extension-payment-summary', ref, verifiedEmail],
    queryFn: () => api.post('/public/extend/payment-summary', {
      orderReference: ref,
      email: verifiedEmail,
    }),
    enabled: !!ref && !!verifiedEmail,
    retry: false,
  });

  const statusQuery = useQuery<XenditSessionStatus>({
    queryKey: ['extension-payment-session-status', paymentSessionId],
    queryFn: () => api.get(`/public/payments/xendit/sessions/${encodeURIComponent(paymentSessionId)}/status?state=${encodeURIComponent(paymentState)}`),
    enabled: returnState === 'processing' && !!paymentSessionId && !!paymentState,
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const status = query.state.data?.status;
      return status && !['creating', 'active'].includes(status) ? false : 2000;
    },
  });

  const paymentCompleted = statusQuery.data?.status === 'completed';
  const paymentReconciliationRequired = statusQuery.data?.status === 'reconciliation_required';
  const paymentFailed = statusQuery.data
    ? ['expired', 'cancelled', 'failed'].includes(statusQuery.data.status)
    : false;
  const paymentVerificationRequired = paymentReconciliationRequired || Boolean(statusQuery.error);

  useEffect(() => {
    if (paymentCompleted) void summaryQuery.refetch();
  }, [paymentCompleted, summaryQuery.refetch]);

  function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !ref) return;
    sessionStorage.setItem(storageKey(ref), normalizedEmail);
    setCheckoutError(null);
    setVerifiedEmail(normalizedEmail);
  }

  async function handlePayOnline() {
    if (!ref || !verifiedEmail) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const session = await api.post<XenditSessionResult>(
        '/public/payments/xendit/extension-sessions',
        { orderReference: ref, email: verifiedEmail },
      );
      window.location.assign(session.checkoutUrl);
    } catch (error) {
      setCheckoutError(
        error instanceof ApiError
          ? error.message
          : 'We could not start online payment. Please try again or message the team.',
      );
      setCheckoutLoading(false);
    }
  }

  const lookupNotFound = summaryQuery.error instanceof ApiError
    && ['NOT_FOUND', 'VALIDATION_ERROR'].includes(summaryQuery.error.code ?? '');

  return (
    <PageLayout title="Extension Payment | Lola's Rentals" showFloralRight={false}>
      <SEO
        title="Extension Payment | Lola's Rentals"
        description="Review and pay your rental extension balance."
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
              {paymentCompleted ? <CheckCircle2 className="h-6 w-6" /> : <CreditCard className="h-6 w-6" />}
            </div>

            <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-gold-brand">
              Extension payment
            </p>
            <h1 className="mt-2 font-headline text-4xl font-black leading-tight text-charcoal-brand sm:text-5xl">
              {paymentCompleted
                ? 'Payment received'
                : paymentReconciliationRequired
                  ? 'Payment verification required'
                : verifiedEmail
                  ? 'Pay your extension'
                  : 'Verify your booking'}
            </h1>

            {!ref && (
              <div className="mt-6 flex gap-3 rounded-2xl bg-red-50 px-4 py-4 text-red-700">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm font-bold">This payment link is missing a booking reference.</p>
              </div>
            )}

            {ref && !verifiedEmail && (
              <form className="mt-6 space-y-4" onSubmit={handleVerify}>
                <p className="text-sm font-semibold leading-relaxed text-charcoal-brand/70">
                  Enter the email used for booking {ref} to view its extension balance.
                </p>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-widest text-charcoal-brand/50">
                    Booking email
                  </span>
                  <span className="mt-2 flex items-center gap-3 rounded-xl border border-charcoal-brand/15 px-4 py-3 focus-within:border-teal-brand">
                    <Mail className="h-4 w-4 shrink-0 text-charcoal-brand/40" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-charcoal-brand outline-none"
                      placeholder="you@example.com"
                    />
                  </span>
                </label>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-teal-brand px-5 py-3 text-sm font-black text-white transition-colors hover:bg-teal-brand/90"
                >
                  View extension balance
                </button>
              </form>
            )}

            {summaryQuery.isLoading && (
              <div className="mt-8 flex items-center gap-3 rounded-2xl bg-sand-brand/70 px-4 py-3 text-sm font-bold text-charcoal-brand/70">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-brand border-t-transparent" />
                Checking extension balance
              </div>
            )}

            {summaryQuery.error && !summaryQuery.isLoading && (
              <div className="mt-6 rounded-2xl bg-red-50 px-4 py-4 text-sm font-bold text-red-700">
                {lookupNotFound
                  ? 'We could not find an active extension balance for that booking reference and email.'
                  : 'We could not load the extension balance. Please try again.'}
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem(storageKey(ref));
                    setVerifiedEmail('');
                    setEmail('');
                  }}
                  className="mt-3 block text-xs font-black uppercase text-red-700 underline"
                >
                  Use another email
                </button>
              </div>
            )}

            {returnState === 'cancelled' && !paymentCompleted && (
              <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">Payment was cancelled. Your extension remains confirmed and unpaid.</p>
              </div>
            )}

            {returnState === 'processing' && !paymentCompleted && !paymentFailed && !paymentVerificationRequired && (
              <div className="mt-5 flex gap-3 rounded-2xl border border-gold-brand/20 bg-gold-brand/10 px-4 py-4">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold-brand" />
                <p className="text-sm font-semibold leading-relaxed text-charcoal-brand/70">
                  We are confirming your payment. Do not start another payment while this check is running.
                </p>
              </div>
            )}

            {paymentReconciliationRequired && (
              <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">
                  Your payment needs manual verification. Keep your Xendit receipt and message the team. Do not start another payment.
                </p>
              </div>
            )}

            {(paymentFailed || (statusQuery.error && !paymentReconciliationRequired)) && (
              <div className="mt-5 flex gap-3 rounded-2xl bg-red-50 px-4 py-4 text-red-700">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">
                  We could not confirm this payment session. Check your Xendit receipt before retrying, or message the team for help.
                </p>
              </div>
            )}

            {summaryQuery.data && !summaryQuery.isLoading && (
              <>
                <div className="mt-6 rounded-2xl bg-sand-brand/70 px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-widest text-charcoal-brand/40">
                    Booking reference
                  </p>
                  <p className="mt-1 text-lg font-black text-charcoal-brand">
                    {summaryQuery.data.orderReference}
                  </p>

                  <dl className="mt-4 space-y-2 border-t border-charcoal-brand/10 pt-4 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="font-semibold text-charcoal-brand/60">Pending extensions</dt>
                      <dd className="font-black text-charcoal-brand">
                        {formatCurrency(summaryQuery.data.principalAmountPHP)}
                      </dd>
                    </div>
                    {summaryQuery.data.surchargeAmountPHP > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <dt className="font-semibold text-charcoal-brand/60">
                          Online payment fee ({summaryQuery.data.surchargePercent}%)
                        </dt>
                        <dd className="font-black text-charcoal-brand">
                          {formatCurrency(summaryQuery.data.surchargeAmountPHP)}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-end justify-between gap-4 border-t border-charcoal-brand/10 pt-3">
                      <dt className="text-xs font-black uppercase tracking-widest text-charcoal-brand/40">Total</dt>
                      <dd className="font-headline text-4xl font-black text-teal-brand">
                        {formatCurrency(summaryQuery.data.totalAmountPHP)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {summaryQuery.data.principalAmountPHP <= 0 && (
                  <div className="mt-5 flex gap-3 rounded-2xl bg-emerald-50 px-4 py-4 text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-semibold">There is no unpaid extension balance for this booking.</p>
                  </div>
                )}

                {summaryQuery.data.principalAmountPHP > 0 && !summaryQuery.data.paymentAvailable && (
                  <div className="mt-5 flex gap-3 rounded-2xl border border-gold-brand/20 bg-gold-brand/10 px-4 py-4">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold-brand" />
                    <p className="text-sm font-semibold leading-relaxed text-charcoal-brand/70">
                      Online payment is temporarily unavailable. You can still pay when you return your rental.
                    </p>
                  </div>
                )}

                {checkoutError && (
                  <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                    {checkoutError}
                  </p>
                )}

                {summaryQuery.data.paymentAvailable
                  && summaryQuery.data.principalAmountPHP > 0
                  && !paymentCompleted
                  && !paymentVerificationRequired
                  && (returnState !== 'processing' || paymentFailed) && (
                    <button
                      type="button"
                      onClick={handlePayOnline}
                      disabled={checkoutLoading}
                      className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-brand px-5 py-3 text-sm font-black text-white transition-colors hover:bg-teal-brand/90 disabled:cursor-wait disabled:opacity-60"
                    >
                      <CreditCard className="h-4 w-4" />
                      {checkoutLoading ? 'Opening secure checkout' : `Pay ${formatCurrency(summaryQuery.data.totalAmountPHP)}`}
                    </button>
                  )}
              </>
            )}

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-green-500 px-5 py-3 text-sm font-black text-green-700 transition-colors hover:bg-green-50"
            >
              <MessageCircle className="h-4 w-4" />
              Message the team
            </a>
          </div>
        </FadeUpSection>
      </div>
    </PageLayout>
  );
}
