import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { WHATSAPP_URL } from '../../config/contact.js';

function BulletItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 font-lato text-base text-charcoal-brand/80 leading-relaxed">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-brand" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

export default function RefundPolicyPage() {
  const { t } = useTranslation();
  return (
    <PageLayout title={t('refundPolicy.title')}>
      <SEO
        title="Refund Policy | Lola's Rentals Siargao"
        description="Clear, fair refund and cancellation policy for all Lola's Rentals bookings."
        canonical="/refund-policy"
      />
      <article className="mx-auto max-w-3xl px-4 py-12 md:px-6">
        <FadeUpSection onlyAnimateOnMobile>
          <h1 className="mb-2 font-headline text-3xl font-black text-teal-brand md:text-4xl">
            {t('refundPolicy.title')}
          </h1>
          <p className="mb-10 font-lato text-sm text-charcoal-brand/50">{t('refundPolicy.lastUpdated')}</p>
        </FadeUpSection>

        <section className="mb-6 rounded-xl border border-charcoal-brand/10 bg-white p-6">
          <h2 className="mb-3 font-headline text-xl text-teal-brand">{t('refundPolicy.sec1Title')}</h2>
          <p className="mb-4 font-lato text-base text-charcoal-brand/80 leading-relaxed">
            {t('refundPolicy.sec1Body')}
          </p>
          <ul className="list-none space-y-3 pl-0">
            <BulletItem>{t('refundPolicy.sec1Item1')}</BulletItem>
            <BulletItem>{t('refundPolicy.sec1Item2')}</BulletItem>
          </ul>
          <p className="mt-4 font-lato text-base text-charcoal-brand/80 leading-relaxed">
            {t('refundPolicy.sec1Footer')}
          </p>
        </section>

        <hr className="my-8 border-charcoal-brand/10" />

        <section className="mb-6 rounded-xl border border-charcoal-brand/10 bg-white p-6">
          <h2 className="mb-3 font-headline text-xl text-teal-brand">{t('refundPolicy.sec2Title')}</h2>
          <p className="mb-4 font-lato text-base text-charcoal-brand/80 leading-relaxed">
            {t('refundPolicy.sec2Body')}
          </p>
          <ul className="list-none space-y-3 pl-0">
            <BulletItem>{t('refundPolicy.sec2Item1')}</BulletItem>
            <BulletItem>{t('refundPolicy.sec2Item2')}</BulletItem>
            <BulletItem>{t('refundPolicy.sec2Item3')}</BulletItem>
            <BulletItem>{t('refundPolicy.sec2Item4')}</BulletItem>
          </ul>
        </section>

        <hr className="my-8 border-charcoal-brand/10" />

        <section className="mb-6 rounded-xl border border-charcoal-brand/10 bg-white p-6">
          <h2 className="mb-3 font-headline text-xl text-teal-brand">{t('refundPolicy.sec3Title')}</h2>
          <p className="font-lato text-base text-charcoal-brand/80 leading-relaxed">
            {t('refundPolicy.sec3Body')}
          </p>
        </section>

        <hr className="my-8 border-charcoal-brand/10" />

        <section className="mb-6 rounded-xl border border-charcoal-brand/10 bg-white p-6">
          <h2 className="mb-3 font-headline text-xl text-teal-brand">{t('refundPolicy.sec4Title')}</h2>
          <p className="font-lato text-base text-charcoal-brand/80 leading-relaxed">
            {t('refundPolicy.sec4Body')}{' '}
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-teal-brand underline-offset-2 hover:underline"
            >
              {t('refundPolicy.sec4Whatsapp')}
            </a>{' '}
            {t('refundPolicy.sec4BodySuffix')}
          </p>
        </section>
      </article>
    </PageLayout>
  );
}
