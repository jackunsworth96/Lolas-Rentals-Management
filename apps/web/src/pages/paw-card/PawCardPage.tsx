import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PawCardLoginPanel, type PawCardAccess } from './PawCardLoginPanel.js';
import { PawCardSavingsForm } from './PawCardSavingsForm.js';
import { PawCardDashboard } from './PawCardDashboard.js';
import { PrimaryCtaLink } from '../../components/public/PrimaryCtaLink.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { PageHeader } from '../../components/public/PageHeader.js';

import discountCard from '../../assets/Discount Card.svg';
import pawPrint from '../../assets/Paw Print.svg';

export default function PawCardPage() {
  const qc = useQueryClient();
  const [pawAccess, setPawAccess] = useState<PawCardAccess | null>(null);
  const logRef = useRef<HTMLElement>(null);
  const dashRef = useRef<HTMLElement>(null);

  const displayFullName =
    pawAccess?.email.split('@')[0]?.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Member';

  const handleLogged = () => { qc.invalidateQueries({ queryKey: ['paw-card'] }); };
  const customerIdForSubmit = pawAccess?.customerId ?? pawAccess?.email ?? '';

  return (
    <PageLayout title="Paw Card | Lola's Rentals" showFloralLeft={false} showFloralRight={false}>
      <PageHeader
        eyebrow="Paw Card Community"
        headingMain="Log Your"
        headingAccent="Savings"
        subheading="Every peso saved at our partner businesses goes toward feeding and neutering street animals on Siargao."
      />

      <div className="relative overflow-x-hidden" style={{ background: '#FFF8F1' }}>
        <div className="flex flex-col items-center justify-center gap-4 py-8 px-6 text-center sm:flex-row" style={{ backgroundColor: '#f1e6d6' }}>
          <PrimaryCtaLink href="#log-saving" className="min-h-[44px] px-8 py-3.5 text-lg shadow-lg">
            Start Logging
          </PrimaryCtaLink>
          <a
            href="#dashboard"
            className="font-lato min-h-[44px] rounded-full px-8 py-3.5 text-lg font-bold text-teal-brand transition-all duration-300 ease-in-out hover:scale-105"
            style={{ background: '#f1e6d6' }}
          >
            View Impact
          </a>
        </div>

        <section id="paw-card-login" className="px-6 py-10" style={{ background: 'rgba(246,237,221,0.6)' }}>
          <div className="mx-auto max-w-md">
            <div className="rounded-2xl bg-white p-8 shadow-lg md:p-10">
              <PawCardLoginPanel
                access={pawAccess}
                onAccessGranted={setPawAccess}
                onSignOut={() => { setPawAccess(null); qc.invalidateQueries({ queryKey: ['paw-card'] }); }}
              />
            </div>
          </div>
        </section>

        <PawCardDivider />

        <section ref={logRef} id="log-saving" className="mx-auto grid max-w-5xl items-start gap-10 px-6 py-12 md:grid-cols-2">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="font-headline text-4xl font-bold text-teal-brand">Log a Saving</h2>
              <img src={discountCard} alt="" className="h-10 w-10 bg-transparent" />
            </div>
            <p className="font-lato mb-6 text-lg leading-relaxed text-charcoal-brand/70">
              Visited one of our partners? Upload your receipt and we&apos;ll match it peso for peso as a donation to Be Pawsitive.
            </p>
            <div className="rounded-lg p-5" style={{ background: 'rgba(245,183,49,0.15)' }}>
              <h4 className="font-headline mb-1 text-sm font-bold text-charcoal-brand">Receipt Guidelines</h4>
              <p className="font-lato text-xs text-charcoal-brand/60">
                Make sure the date, business name, and total amount are clearly visible in your photo.
              </p>
            </div>
          </div>
          <div className="rounded-2xl p-8 shadow-lg" style={{ background: '#fcf2e3' }}>
            {!pawAccess ? (
              <div className="py-8 text-center">
                <p className="font-lato text-sm font-medium text-charcoal-brand/60">Enter your email above to log a saving.</p>
                <PrimaryCtaLink href="#paw-card-login" className="mt-3 inline-flex px-6 py-2 text-sm font-bold">Go to access</PrimaryCtaLink>
              </div>
            ) : (
              <PawCardSavingsForm accessEmail={pawAccess.email} customerIdForSubmit={customerIdForSubmit} displayFullName={displayFullName} onLogged={handleLogged} />
            )}
          </div>
        </section>

        <PawCardDivider />

        <section ref={dashRef} id="dashboard">
          {pawAccess ? (
            <PawCardDashboard accessEmail={pawAccess.email} displayFullName={displayFullName} />
          ) : (
            <div className="mx-auto max-w-md px-6 py-16 text-center">
              <p className="font-lato text-sm font-medium text-charcoal-brand/60">Enter your email above to see your impact, community totals, and the leaderboard.</p>
              <PrimaryCtaLink href="#paw-card-login" className="mt-4 inline-flex px-6 py-2 text-sm font-bold">Go to access</PrimaryCtaLink>
            </div>
          )}
        </section>
      </div>
    </PageLayout>
  );
}

function PawCardDivider() {
  return (
    <div className="mx-auto flex max-w-xs items-center justify-center gap-6 py-6 opacity-25">
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #00577C, transparent)' }} />
      <img src={pawPrint} alt="" className="h-7 w-7 bg-transparent opacity-60 grayscale" />
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #00577C, transparent)' }} />
    </div>
  );
}
