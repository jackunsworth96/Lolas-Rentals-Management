import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon } from '../../components/public/customerContactIcons.js';

export default function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <>
      <SEO
        noIndex={false}
        title="Privacy Policy | Lola's Rentals Siargao"
        description="How Lola's Rentals & Tours collects, uses, and protects your personal information."
      />
    <PageLayout title={t('privacy.title')}>
      <article className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="mb-2 font-headline text-3xl font-black text-teal-brand md:text-4xl">{t('privacy.title')}</h1>
        <p className="mb-10 text-sm text-charcoal-brand/50">{t('privacy.lastUpdated')}</p>

        <div className="space-y-8 text-charcoal-brand/80 leading-relaxed [&_h2]:mb-3 [&_h2]:font-headline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-charcoal-brand">
          <section>
            <h2>{t('privacy.sec1Title')}</h2>
            <p>{t('privacy.sec1Body')}</p>
          </section>

          <section>
            <h2>{t('privacy.sec2Title')}</h2>
            <p>{t('privacy.sec2Intro')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>{t('privacy.sec2Item1')}</li>
              <li>{t('privacy.sec2Item2')}</li>
              <li>{t('privacy.sec2Item3')}</li>
              <li>{t('privacy.sec2Item4')}</li>
              <li>{t('privacy.sec2Item5')}</li>
              <li>{t('privacy.sec2Item6')}</li>
            </ul>
            <p className="mt-3">{t('privacy.sec2Footer')}</p>
          </section>

          <section>
            <h2>{t('privacy.sec3Title')}</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>{t('privacy.sec3Item1')}</li>
              <li>{t('privacy.sec3Item2')}</li>
              <li>{t('privacy.sec3Item3')}</li>
              <li>{t('privacy.sec3Item4')}</li>
              <li>{t('privacy.sec3Item5')}</li>
            </ul>
            <p className="mt-3">{t('privacy.sec3Footer')}</p>
          </section>

          <section>
            <h2>{t('privacy.sec4Title')}</h2>
            <p>{t('privacy.sec4Body1')}</p>
            <p className="mt-3">{t('privacy.sec4Body2')}</p>
          </section>

          <section>
            <h2>{t('privacy.sec5Title')}</h2>
            <p>{t('privacy.sec5Intro')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>{t('privacy.sec5Item1')}</li>
              <li>{t('privacy.sec5Item2')}</li>
            </ul>
          </section>

          <section>
            <h2>{t('privacy.sec6Title')}</h2>
            <p>{t('privacy.sec6Intro')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>{t('privacy.sec6Item1')}</li>
              <li>{t('privacy.sec6Item2')}</li>
              <li>{t('privacy.sec6Item3')}</li>
              <li>{t('privacy.sec6Item4')}</li>
            </ul>
          </section>

          <section>
            <h2>{t('privacy.sec7Title')}</h2>
            <p>{t('privacy.sec7Intro')}</p>
            <ul className="mt-2 space-y-1 pl-2">
              <li>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-bold text-teal-brand underline underline-offset-4 hover:opacity-80"
                >
                  <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain" width={16} height={16} />
                  {t('privacy.sec7Whatsapp')}
                </a>
              </li>
              <li>
                {t('privacy.sec7Email')}{' '}
                <a
                  href="mailto:hello@lolasrentals.com"
                  className="font-bold text-teal-brand underline underline-offset-4 hover:opacity-80"
                >
                  hello@lolasrentals.com
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-12 border-t border-charcoal-brand/10 pt-8 text-center">
          <Link
            to="/book"
            className="inline-block rounded-full bg-teal-brand px-8 py-3 font-headline font-bold !text-white shadow-md transition-all hover:opacity-90"
          >
            {t('privacy.backToHome')}
          </Link>
        </div>
      </article>
    </PageLayout>
    </>
  );
}
