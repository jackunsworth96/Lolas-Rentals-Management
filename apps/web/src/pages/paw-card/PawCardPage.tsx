import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PawCardLoginPanel, type PawCardAccess } from './PawCardLoginPanel.js';
import { PawCardSavingsForm } from './PawCardSavingsForm.js';
import { PawCardDashboard } from './PawCardDashboard.js';
import { PrimaryCtaLink } from '../../components/public/PrimaryCtaLink.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';

import discountCard from '../../assets/Discount Card.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import handOnHeart from '../../assets/Hand on Heart.svg';
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
      <div className="relative -mx-4 -mt-20 overflow-x-hidden pt-20" style={{ background: '#FFF8F1' }}>
        <img src={flowerLeft} alt="" className="pointer-events-none fixed left-0 top-1/2 z-0 w-36 -translate-y-1/2 opacity-60 md:w-56" />
        <img src={flowerRight} alt="" className="pointer-events-none fixed right-0 top-1/2 z-0 w-36 -translate-y-1/2 opacity-60 md:w-56" />

        <section id="hero" className="relative overflow-hidden px-6 py-16 text-center md:py-24">
          <div className="absolute inset-0 -z-10 opacity-30" style={{ background: 'linear-gradient(135deg, rgba(157,242,227,0.3), rgba(245,183,49,0.1))' }} />
          <HeroFloatingClouds variant="editorial" />
          <div className="relative z-10 mx-auto max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest" style={{ background: '#F5B731', color: '#271900' }}>
              <img src={pawPrint} alt="" className="h-4 w-4 bg-transparent" />
              Paw Card Exclusive
            </div>
            <h1 className="mb-4 font-headline text-5xl font-black leading-tight tracking-tighter md:text-7xl" style={{ color: '#1A7A6E' }}>
              Every Peso <span className="italic" style={{ color: '#F5B731' }}>Wags</span> a Tail
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed md:text-xl" style={{ color: '#3e4946' }}>
              Log your savings at partner businesses. Every peso you save, <span className="font-bold" style={{ color: '#1A7A6E' }}>Lola&apos;s matches as a donation</span> to Be Pawsitive NGO.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <PrimaryCtaLink href="#log-saving" className="min-h-[44px] px-8 py-3.5 text-lg shadow-lg">
                Start Logging
              </PrimaryCtaLink>
              <a href="#dashboard" className="min-h-[44px] rounded-full px-8 py-3.5 text-lg font-bold transition-all duration-300 ease-in-out hover:scale-105" style={{ background: '#eae1d2', color: '#1A7A6E' }}>
                View Impact
              </a>
            </div>
            <img src={handOnHeart} alt="Every peso helps" className="mx-auto mt-10 h-auto w-32 bg-transparent opacity-90 md:w-44" />
          </div>
        </section>

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
              <h2 className="text-4xl font-bold" style={{ color: '#1A7A6E' }}>Log a Saving</h2>
              <img src={discountCard} alt="" className="h-10 w-10 bg-transparent" />
            </div>
            <p className="mb-6 text-lg leading-relaxed" style={{ color: '#3e4946' }}>
              Visited one of our partners? Upload your receipt and we&apos;ll match it peso for peso as a donation to Be Pawsitive.
            </p>
            <div className="rounded-lg p-5" style={{ background: 'rgba(245,183,49,0.15)' }}>
              <h4 className="mb-1 text-sm font-bold" style={{ color: '#5e4200' }}>Receipt Guidelines</h4>
              <p className="text-xs" style={{ color: 'rgba(94,66,0,0.8)' }}>
                Make sure the date, business name, and total amount are clearly visible in your photo.
              </p>
            </div>
          </div>
          <div className="rounded-2xl p-8 shadow-lg" style={{ background: '#fcf2e3' }}>
            {!pawAccess ? (
              <div className="py-8 text-center">
                <p className="text-sm font-medium" style={{ color: '#6e7976' }}>Enter your email above to log a saving.</p>
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
              <p className="text-sm font-medium" style={{ color: '#6e7976' }}>Enter your email above to see your impact, community totals, and the leaderboard.</p>
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
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
      <img src={pawPrint} alt="" className="h-7 w-7 bg-transparent opacity-60 grayscale" />
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
    </div>
  );
}
