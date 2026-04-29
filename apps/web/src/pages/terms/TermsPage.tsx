import { Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon } from '../../components/public/customerContactIcons.js';

export default function TermsPage() {
  return (
    <>
      <SEO
        noIndex={false}
        title="Terms & Conditions | Lola's Rentals Siargao"
        description="The terms and conditions governing use of the Lola's Rentals & Tours website and booking services."
      />
      <PageLayout title="Terms & Conditions | Lola's Rentals Siargao">
        <article className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="mb-2 font-headline text-3xl font-black text-teal-brand md:text-4xl">Terms &amp; Conditions</h1>
          <p className="mb-10 text-sm text-charcoal-brand/50">Last updated: April 2025</p>

          <div className="space-y-8 text-charcoal-brand/80 leading-relaxed [&_h2]:mb-3 [&_h2]:font-headline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-charcoal-brand">
            <section>
              <h2>1. Introduction</h2>
              <p>
                This website is operated by <strong>Lola's Rentals &amp; Tours Inc.</strong>, a company
                registered in the Philippines with its principal place of business at Tourism Road,
                Catangnan, General Luna, Siargao Island, Philippines. By accessing or using this website
                you agree to be bound by these Terms &amp; Conditions. If you do not agree, please do not
                use the site.
              </p>
            </section>

            <section>
              <h2>2. Use of This Website</h2>
              <p>
                You may use this website only for lawful purposes and in a manner consistent with all
                applicable laws and regulations. In particular, you agree that you will not:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>
                  Scrape, crawl, or otherwise extract content or data from the site by automated means
                  without our prior written consent.
                </li>
                <li>
                  Impersonate Lola's Rentals &amp; Tours Inc., any of our staff, or any other person or
                  entity, or misrepresent your affiliation with any person or entity.
                </li>
                <li>
                  Use the site to transmit unsolicited commercial communications, malicious code, or
                  content that is unlawful, defamatory, or otherwise harmful.
                </li>
                <li>
                  Attempt to gain unauthorised access to any part of the site, our servers, or any
                  database connected to the site.
                </li>
              </ul>
              <p className="mt-3">
                We reserve the right to restrict or terminate access to the website at any time for
                any user who we reasonably believe has violated these terms.
              </p>
            </section>

            <section>
              <h2>3. Intellectual Property</h2>
              <p>
                All content published on this website — including but not limited to text, photographs,
                graphics, illustrations, logos, brand names, and the overall look and feel of the site —
                is owned by or licensed to <strong>Lola's Rentals &amp; Tours Inc.</strong> and is
                protected by Philippine and international copyright and intellectual property law. You
                may not reproduce, distribute, modify, or create derivative works from any part of this
                website without our express written permission. Personal, non-commercial use (such as
                printing a single page for reference) is permitted provided that copyright notices are
                retained in full.
              </p>
            </section>

            <section>
              <h2>4. Bookings and Contracts</h2>
              <p>
                A legally binding contract between you and Lola's Rentals &amp; Tours Inc. is formed at
                the moment a booking is confirmed — either by our written confirmation sent to the email
                address you provided, or by payment of a deposit or full rental amount, whichever
                occurs first. Prior to that point, any quotation or availability check is indicative
                only and does not constitute an offer capable of acceptance.
              </p>
              <p className="mt-3">
                The specific terms governing the rental itself — including your responsibilities as a
                rider, our liability limitations, and the conditions of any damage waiver — are set
                out in the{' '}
                <Link
                  to="/book/waiver-agreement"
                  className="font-bold text-teal-brand underline underline-offset-4 hover:opacity-80"
                >
                  Rental Agreement and Waiver
                </Link>
                , which you will be asked to sign before taking possession of any vehicle. In the event
                of any conflict between these Terms &amp; Conditions and the Rental Agreement and
                Waiver, the Rental Agreement and Waiver shall prevail in respect of the rental itself.
              </p>
            </section>

            <section>
              <h2>5. Limitation of Liability</h2>
              <p>
                The information on this website is provided on an "as-is" basis without any warranty,
                express or implied. While we make every reasonable effort to keep information accurate
                and up to date, we do not warrant that the site will be uninterrupted, error-free, or
                free of viruses or other harmful components. To the fullest extent permitted by
                Philippine law, Lola's Rentals &amp; Tours Inc. excludes all liability for any direct,
                indirect, incidental, or consequential loss or damage arising from your use of, or
                inability to use, this website.
              </p>
              <p className="mt-3">
                This website may contain links to third-party websites or services. Those sites are
                outside our control and we are not responsible for their content, privacy practices,
                or any loss or damage that may arise from your use of them. The inclusion of any link
                does not imply endorsement by Lola's Rentals &amp; Tours Inc.
              </p>
            </section>

            <section>
              <h2>6. Governing Law</h2>
              <p>
                These Terms &amp; Conditions are governed by and construed in accordance with the laws
                of the <strong>Republic of the Philippines</strong>. Any dispute arising out of or in
                connection with these terms, including any question regarding their existence, validity,
                or termination, shall be subject to the exclusive jurisdiction of the competent courts
                of the Philippines.
              </p>
            </section>

            <section>
              <h2>7. Changes to These Terms</h2>
              <p>
                We may revise these Terms &amp; Conditions at any time by updating this page. The
                revised terms will take effect as soon as they are posted. We encourage you to review
                this page periodically so that you are aware of any changes. Your continued use of this
                website after any update constitutes your acceptance of the revised terms.
              </p>
            </section>

            <section>
              <h2>8. Contact</h2>
              <p>
                If you have any questions about these Terms &amp; Conditions, please get in touch with
                us through any of the following channels:
              </p>
              <ul className="mt-2 space-y-1 pl-2">
                <li>
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-bold text-teal-brand underline underline-offset-4 hover:opacity-80"
                  >
                    <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain" width={16} height={16} />
                    WhatsApp: +63 969 444 3413
                  </a>
                </li>
                <li>
                  Email:{' '}
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
              Back to Home
            </Link>
          </div>
        </article>
      </PageLayout>
    </>
  );
}
