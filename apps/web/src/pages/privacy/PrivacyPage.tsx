import { Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon } from '../../components/public/customerContactIcons.js';

export default function PrivacyPage() {
  return (
    <>
      <SEO
        noIndex={false}
        title="Privacy Policy | Lola's Rentals Siargao"
        description="How Lola's Rentals & Tours collects, uses, and protects your personal information."
      />
    <PageLayout title="Privacy Policy | Lola's Rentals">
      <article className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="mb-2 font-headline text-3xl font-black text-teal-brand md:text-4xl">Privacy Policy</h1>
        <p className="mb-10 text-sm text-charcoal-brand/50">Last updated: March 2026</p>

        <div className="space-y-8 text-charcoal-brand/80 leading-relaxed [&_h2]:mb-3 [&_h2]:font-headline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-charcoal-brand">
          <section>
            <h2>Who we are</h2>
            <p>
              Lola&apos;s Rentals is a scooter and vehicle rental service based in Siargao, Philippines.
              We also run the Paw Card loyalty programme. This policy explains how we handle the personal
              information you share with us when you make a booking or join the Paw Card programme.
            </p>
          </section>

          <section>
            <h2>What we collect</h2>
            <p>When you book a vehicle or sign up for a Paw Card, we collect:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Your name</li>
              <li>Email address</li>
              <li>Phone / mobile number</li>
              <li>Nationality</li>
              <li>Booking details (dates, vehicle, add-ons, transfer preferences)</li>
              <li>Flight information (if you request an airport transfer)</li>
            </ul>
            <p className="mt-3">
              We do not collect payment card numbers directly. Payments are processed through
              third-party providers who handle card data under their own security policies.
            </p>
          </section>

          <section>
            <h2>How we use your information</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>To confirm and manage your vehicle booking</li>
              <li>To arrange airport or accommodation transfers</li>
              <li>To operate the Paw Card loyalty programme (tracking stamps and rewards)</li>
              <li>To contact you about your rental (pickup reminders, extensions, returns)</li>
              <li>To improve our service based on booking patterns</li>
            </ul>
            <p className="mt-3">
              We will never sell your personal information to third parties or send you marketing
              emails unless you have specifically opted in.
            </p>
          </section>

          <section>
            <h2>How long we keep it</h2>
            <p>
              We retain your booking information for up to 12 months after your rental ends. This lets
              us handle any follow-up queries, process security deposit refunds, and maintain your
              Paw Card stamp history. After 12 months, personal data is anonymised or deleted.
            </p>
            <p className="mt-3">
              Paw Card members&apos; information is kept for as long as the account is active. If you
              haven&apos;t used your Paw Card for 24 months, we&apos;ll reach out before removing
              your account.
            </p>
          </section>

          <section>
            <h2>Who can see your data</h2>
            <p>
              Your information is only accessible to the Lola&apos;s Rentals team who need it to
              manage your booking. We do not share it with other businesses, except:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Payment processors (to handle transactions securely)</li>
              <li>Transfer drivers (name and pickup details only, for airport transfers)</li>
            </ul>
          </section>

          <section>
            <h2>Your rights</h2>
            <p>You can ask us at any time to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>See what personal information we hold about you</li>
              <li>Correct any details that are wrong</li>
              <li>Delete your data (subject to any active booking obligations)</li>
              <li>Get a copy of your data in a portable format</li>
            </ul>
          </section>

          <section>
            <h2>Contact us</h2>
            <p>
              If you have any questions about your data or want to exercise your rights, get in touch:
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
                  Message us on WhatsApp
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
            className="inline-block rounded-full bg-teal-brand px-8 py-3 font-headline font-bold text-white shadow-md transition-all hover:opacity-90"
          >
            ← Back to Home
          </Link>
        </div>
      </article>
    </PageLayout>
    </>
  );
}
