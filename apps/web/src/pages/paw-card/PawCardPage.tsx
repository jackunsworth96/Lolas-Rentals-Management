import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PawCardLoginPanel, type PawCardAccess } from './PawCardLoginPanel.js';
import { PawCardSavingsForm } from './PawCardSavingsForm.js';
import { PawCardDashboard } from './PawCardDashboard.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { PageHeader } from '../../components/public/PageHeader.js';
import BorderGlow from '../../components/home/BorderGlow.js';
import InclusionMarquee from '../../components/home/InclusionMarquee.js';

import separatorSvg from '../../assets/Original Assests/separator.svg';
import flower4 from '../../assets/Original Assests/flower-4.svg';
import aboutUsLowerRight from '../../assets/Original Assests/about-us-lower-right.svg';

// Eagerly load all partner logo URLs via Vite glob import
const _logoRaw = import.meta.glob(
  '../../assets/paw_card_partner_logos/*.svg',
  { eager: true, as: 'url' },
) as Record<string, string>;

const PARTNER_LOGOS = Object.entries(_logoRaw)
  .sort(([a], [b]) => {
    const n = (p: string) => parseInt(p.match(/(\d+)\.svg$/)?.[1] ?? '0', 10);
    return n(a) - n(b);
  })
  .map(([, url]) => ({ icon: url, label: '' }));

export default function PawCardPage() {
  const qc = useQueryClient();
  const [pawAccess, setPawAccess] = useState<PawCardAccess | null>(null);

  const displayFirstName =
    pawAccess?.customerName
      ? (pawAccess.customerName.split(' ')[0] ?? pawAccess.customerName).replace(/\b\w/g, (c) => c.toUpperCase())
      : (pawAccess?.email.split('@')[0]?.replace(/[._-]/g, ' ').trim().split(' ')[0]?.replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Member');

  const displayFullName =
    pawAccess?.customerName?.replace(/\b\w/g, (c) => c.toUpperCase())
    ?? pawAccess?.email.split('@')[0]?.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    ?? 'Member';

  const handleLogged = () => { qc.invalidateQueries({ queryKey: ['paw-card'] }); };
  const customerIdForSubmit = pawAccess?.customerId ?? pawAccess?.email ?? '';

  return (
    <PageLayout title="Paw Card | Lola's Rentals" showFloralLeft={false} showFloralRight={false} fullBleed>

      {/* ── Welcome back animation (visible only when logged in) ── */}
      {pawAccess && (
        <div className="pt-8 pb-2 text-center">
          <motion.div
            className="font-headline text-3xl text-teal-brand md:text-4xl"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.04 } },
            }}
          >
            {"Welcome back, ".split('').map((char, i) => (
              <motion.span
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
                }}
                style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : 'normal' }}
              >
                {char}
              </motion.span>
            ))}
            {displayFirstName.split('').map((char, i) => (
              <motion.span
                key={`name-${i}`}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: {
                    opacity: 1, y: 0,
                    transition: { duration: 0.4, ease: 'easeOut', delay: "Welcome back, ".length * 0.04 + i * 0.04 },
                  },
                }}
                style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : 'normal' }}
                className="italic text-gold-brand"
              >
                {char}
              </motion.span>
            ))}
            {"!".split('').map((char, i) => (
              <motion.span
                key={`end-${i}`}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: {
                    opacity: 1, y: 0,
                    transition: { duration: 0.4, ease: 'easeOut', delay: ("Welcome back, ".length + displayFirstName.length) * 0.04 + i * 0.04 },
                  },
                }}
                style={{ display: 'inline-block' }}
              >
                {char}
              </motion.span>
            ))}
          </motion.div>
        </div>
      )}

      {/* ── Page heading ── */}
      <PageHeader
        eyebrow="Paw Card Community"
        headingMain="Log Your"
        headingAccent="Savings"
        subheading="Every peso saved at our partner businesses goes toward spay, neuter and vaccination initiatives for animals on Siargao."
        className="px-6 pt-20 pb-6 text-center"
      />

      {/* ── Inline login form / log-out link ── */}
      {!pawAccess ? (
        <div className="mx-auto w-full max-w-xs px-4 pb-8">
          <PawCardLoginPanel
            compact
            access={pawAccess}
            onAccessGranted={(access) => {
              setPawAccess(access);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      ) : (
        <div className="py-2 text-center">
          <button
            onClick={() => {
              setPawAccess(null);
              qc.invalidateQueries({ queryKey: ['paw-card'] });
            }}
            className="font-lato text-xs text-charcoal-brand/50 underline underline-offset-2 hover:text-charcoal-brand transition-colors"
          >
            Log out
          </button>
        </div>
      )}

      {/* ── Partner logos marquee ── */}
      <div className="pb-2 pt-4">
        <InclusionMarquee
          items={PARTNER_LOGOS}
          speed={90}
          iconSize={96}
          knockOutIconWhiteMatte={false}
        />
      </div>

      {/* ── Fixed floral decorations (portal to body so they float above all sections) ── */}
      {createPortal(
        <>
          <img src={flower4} alt="" aria-hidden="true" className="pointer-events-none fixed left-0 top-1/3 w-24 object-contain opacity-60 md:w-40" style={{ zIndex: 15 }} />
          <img src={aboutUsLowerRight} alt="" aria-hidden="true" className="pointer-events-none fixed right-0 top-1/2 w-24 object-contain opacity-60 md:w-40" style={{ zIndex: 15 }} />
        </>,
        document.body,
      )}

      {/* ── Sand band: savings form + dashboard (logged-in only) ── */}
      {pawAccess && (
        <div className="relative isolate z-0 overflow-x-hidden">
          <div className="pointer-events-none absolute inset-0 z-0 bg-sand-brand" aria-hidden />
          <div className="relative z-10">

            {/* Compact savings form */}
            <section className="px-6 py-10">
              <div className="mx-auto max-w-lg">
                <BorderGlow backgroundColor="#ffffff" borderRadius={16} glowIntensity={0.8} className="shadow-lg">
                  <div className="p-8">
                    <PawCardSavingsForm
                      accessEmail={pawAccess.email}
                      customerIdForSubmit={customerIdForSubmit}
                      displayFullName={displayFullName}
                      onLogged={handleLogged}
                    />
                  </div>
                </BorderGlow>
              </div>
            </section>

            <div style={{ width: '100%', overflow: 'hidden', lineHeight: 0, marginTop: -4, marginBottom: -4 }}>
              <img src={separatorSvg} alt="" style={{ width: '100%', height: 'auto', display: 'block', minWidth: 800 }} />
            </div>

            <section id="dashboard">
              <PawCardDashboard accessEmail={pawAccess.email} displayFullName={displayFullName} />
            </section>

          </div>
        </div>
      )}

    </PageLayout>
  );
}
