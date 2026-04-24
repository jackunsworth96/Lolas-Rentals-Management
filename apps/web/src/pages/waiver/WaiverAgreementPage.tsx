import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { WaiverLegalContent } from '../../components/waiver/WaiverLegalContent.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';

export default function WaiverAgreementPage() {
  const { t } = useTranslation();
  return (
    <PageLayout title="Rental Agreement & Waiver | Lola's Rentals">
      <article className="mx-auto max-w-2xl px-4 py-12">
        <FadeUpSection onlyAnimateOnMobile>
          <h1 className="mb-2 font-headline text-3xl font-black text-teal-brand md:text-4xl">
            {t('waiverAgreement.title')}
          </h1>
          <p className="mb-6 font-lato text-sm text-charcoal-brand/60">
            {t('waiverAgreement.subtitle')}
          </p>
        </FadeUpSection>

        {/* Legal notice shown in user's language; body text stays in English */}
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="font-lato text-sm text-amber-800">{t('waiver.legalNotice')}</p>
        </div>

        <div className="rounded-xl border border-charcoal-brand/10 bg-white p-5 md:p-6">
          <WaiverLegalContent />
        </div>
        <p className="mt-8 text-center">
          <Link
            to="/book"
            className="font-lato text-sm font-semibold text-teal-brand underline-offset-2 hover:underline"
          >
            {t('waiverAgreement.backToHome')}
          </Link>
        </p>
      </article>
    </PageLayout>
  );
}
