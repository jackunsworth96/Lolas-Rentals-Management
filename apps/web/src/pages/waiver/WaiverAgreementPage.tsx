import { Link } from 'react-router-dom';
import { WaiverLegalContent } from '../../components/waiver/WaiverLegalContent.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';

export default function WaiverAgreementPage() {
  return (
    <PageLayout title="Rental Agreement & Waiver | Lola's Rentals">
      <article className="mx-auto max-w-2xl px-4 py-12">
        <FadeUpSection onlyAnimateOnMobile>
          <h1 className="mb-2 font-headline text-3xl font-black text-teal-brand md:text-4xl">
            Rental Agreement &amp; Waiver
          </h1>
          <p className="mb-6 font-lato text-sm text-charcoal-brand/60">
            This is the full text of our rental agreement and waiver for your reference. To sign a waiver for your
            booking, use the link you received after booking (or ask our team).
          </p>
        </FadeUpSection>
        <div className="rounded-xl border border-charcoal-brand/10 bg-white p-5 md:p-6">
          <WaiverLegalContent />
        </div>
        <p className="mt-8 text-center">
          <Link
            to="/book"
            className="font-lato text-sm font-semibold text-teal-brand underline-offset-2 hover:underline"
          >
            ← Back to home
          </Link>
        </p>
      </article>
    </PageLayout>
  );
}
