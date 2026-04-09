import type { ReactNode } from 'react';
import { PageLayout } from '../../components/layout/PageLayout.js';
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
  return (
    <PageLayout title="Refund & Returns Policy | Lola's Rentals">
      <article className="mx-auto max-w-3xl px-4 py-12 md:px-6">
        <FadeUpSection onlyAnimateOnMobile>
          <h1 className="mb-2 font-headline text-3xl font-black text-teal-brand md:text-4xl">
            Refund &amp; Returns Policy
          </h1>
          <p className="mb-10 font-lato text-sm text-charcoal-brand/50">Last updated: April 2026</p>
        </FadeUpSection>

        <section className="mb-6 rounded-xl border border-charcoal-brand/10 bg-white p-6">
          <h2 className="mb-3 font-headline text-xl text-teal-brand">Early Returns</h2>
          <p className="mb-4 font-lato text-base text-charcoal-brand/80 leading-relaxed">
            Lola&apos;s Rentals operates a strict no-refund policy on early returns, regardless of notice given. We make
            exceptions only in the following circumstances:
          </p>
          <ul className="list-none space-y-3 pl-0">
            <BulletItem>
              Medical emergency — a doctor&apos;s note or hospital documentation is required
            </BulletItem>
            <BulletItem>
              Unforeseen flight change — official written confirmation from the airline is required, and at least 24
              hours notice of your new return time must be given
            </BulletItem>
          </ul>
          <p className="mt-4 font-lato text-base text-charcoal-brand/80 leading-relaxed">
            If a refund is approved and your shortened rental falls into a lower pricing bracket, your total will be
            recalculated accordingly. Card convenience fees (5%) are non-refundable in all circumstances.
          </p>
        </section>

        <hr className="my-8 border-charcoal-brand/10" />

        <section className="mb-6 rounded-xl border border-charcoal-brand/10 bg-white p-6">
          <h2 className="mb-3 font-headline text-xl text-teal-brand">Faulty or Defective Vehicle</h2>
          <p className="mb-4 font-lato text-base text-charcoal-brand/80 leading-relaxed">
            In the unlikely event your vehicle develops a fault during your rental, we will work as quickly as possible
            to resolve the issue:
          </p>
          <ul className="list-none space-y-3 pl-0">
            <BulletItem>If a replacement vehicle is available, we will swap it during operational hours</BulletItem>
            <BulletItem>If no replacement is available, our team will carry out on-site repairs</BulletItem>
            <BulletItem>
              If repairs exceed 3 hours during operational hours, compensation will be considered
            </BulletItem>
            <BulletItem>
              Faults reported outside operational hours will be addressed within 3 hours of our next opening time
            </BulletItem>
          </ul>
        </section>

        <hr className="my-8 border-charcoal-brand/10" />

        <section className="mb-6 rounded-xl border border-charcoal-brand/10 bg-white p-6">
          <h2 className="mb-3 font-headline text-xl text-teal-brand">Cancellations</h2>
          <p className="font-lato text-base text-charcoal-brand/80 leading-relaxed">
            Bookings cancelled before the rental period begins are non-refundable. We recommend purchasing travel
            insurance that covers trip cancellations and vehicle rental.
          </p>
        </section>

        <hr className="my-8 border-charcoal-brand/10" />

        <section className="mb-6 rounded-xl border border-charcoal-brand/10 bg-white p-6">
          <h2 className="mb-3 font-headline text-xl text-teal-brand">Contact Us</h2>
          <p className="font-lato text-base text-charcoal-brand/80 leading-relaxed">
            If you have any questions about this policy, please reach out to our team via{' '}
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-teal-brand underline-offset-2 hover:underline"
            >
              WhatsApp
            </a>{' '}
            or visit us in store in General Luna, Siargao Island.
          </p>
        </section>
      </article>
    </PageLayout>
  );
}
