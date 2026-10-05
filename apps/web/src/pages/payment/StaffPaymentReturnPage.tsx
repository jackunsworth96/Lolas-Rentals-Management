import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock3, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';

type PaymentStatus = { status: 'creating' | 'active' | 'completed' | 'expired' | 'cancelled' | 'failed' | 'reconciliation_required' };

export default function StaffPaymentReturnPage() {
  const { reference = '' } = useParams();
  const [params] = useSearchParams();
  const sessionId = params.get('paymentSession') ?? '';
  const state = params.get('paymentState') ?? '';
  const status = useQuery<PaymentStatus>({
    queryKey: ['staff-payment-return', sessionId, state],
    enabled: !!sessionId && !!state,
    queryFn: () => api.get(`/public/payments/xendit/sessions/${encodeURIComponent(sessionId)}/status?state=${encodeURIComponent(state)}`),
    retry: false,
    refetchInterval: (query) => query.state.error || !['creating', 'active'].includes(query.state.data?.status ?? 'active')
      ? false : 2000,
  });

  const confirmed = status.data?.status === 'completed';
  const needsReview = !sessionId || !state
    || status.data?.status === 'reconciliation_required' || Boolean(status.error);
  const closed = ['expired', 'cancelled', 'failed'].includes(status.data?.status ?? '');
  const title = confirmed ? 'Payment confirmed'
    : needsReview ? 'Payment is being verified'
      : closed ? 'Payment not completed' : 'Payment processing';
  const message = confirmed
    ? 'Your payment has been confirmed. The team will update your booking.'
    : needsReview
      ? 'The team needs to verify this payment. Please do not pay again until they contact you.'
      : closed
        ? 'This checkout did not complete. Your booking remains open; contact the team for a new payment link.'
        : 'We are waiting for payment confirmation. You can leave this page while the team checks the status.';
  const Icon = confirmed ? CheckCircle2 : needsReview || closed ? AlertTriangle : Clock3;

  return (
    <PageLayout title={`${title} | Lola's Rentals`} showFloralRight={false}>
      <SEO title={`${title} | Lola's Rentals`} description="Payment status for your booking." noIndex={true} />
      <main className="mx-auto max-w-xl px-4 py-20 sm:px-6">
        <Icon className="h-10 w-10 text-teal-brand" aria-hidden="true" />
        <h1 className="mt-5 font-headline text-3xl font-bold text-charcoal-brand">{title}</h1>
        <p className="mt-3 text-base text-gray-700">{message}</p>
        {reference && <p className="mt-5 text-sm text-gray-600">Booking reference: <strong>{reference}</strong></p>}
        <Link className="mt-8 inline-block text-sm font-semibold text-teal-brand underline" to="/book">Lola's Rentals</Link>
      </main>
    </PageLayout>
  );
}
