import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PawCardLoginPanel, type PawCardAccess } from './PawCardLoginPanel.js';
import { PawCardSavingsForm } from './PawCardSavingsForm.js';
import { PawCardDashboard } from './PawCardDashboard.js';
import { PrimaryCtaLink } from '../../components/public/PrimaryCtaLink.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';

import logo from '../../assets/Lolas Original Logo.svg';
import discountCard from '../../assets/Discount Card.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import handOnHeart from '../../assets/Hand on Heart.svg';
import pawPrint from '../../assets/Paw Print.svg';
import cloud from '../../assets/Cloud.svg';

function usePawCardFonts() {
  useEffect(() => {
    const id = 'paw-card-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Epilogue:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
    return () => { document.getElementById(id)?.remove(); };
  }, []);
}

export default function PawCardPage() {
  usePawCardFonts();
  const qc = useQueryClient();
  const [pawAccess, setPawAccess] = useState<PawCardAccess | null>(null);
  const logRef = useRef<HTMLElement>(null);
  const dashRef = useRef<HTMLElement>(null);

  const displayFullName =
    pawAccess?.email.split('@')[0]?.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ??
    'Member';

  const handleLogged = () => {
    qc.invalidateQueries({ queryKey: ['paw-card'] });
  };

  const customerIdForSubmit = pawAccess?.customerId ?? pawAccess?.email ?? '';

  return (
    <div
      className="min-h-screen relative overflow-x-hidden animate-page-fade-in"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", background: '#FFF8F1' }}
    >
      <img src={flowerLeft} alt="" className="fixed left-0 top-1/2 -translate-y-1/2 w-36 md:w-56 h-auto opacity-60 pointer-events-none z-0" />
      <img src={flowerRight} alt="" className="fixed right-0 top-1/2 -translate-y-1/2 w-36 md:w-56 h-auto opacity-60 pointer-events-none z-0" />

      <header className="fixed top-0 w-full z-50 shadow-sm" style={{ background: 'rgba(250,246,240,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex justify-between items-center px-6 py-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Lola's Rentals" className="h-8 w-auto" />
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-semibold">
            <a href="#hero" className="transition-opacity duration-200 hover:opacity-80" style={{ color: '#1A7A6E' }}>
              Home
            </a>
            <a href="#log-saving" className="transition-opacity duration-200 hover:opacity-80" style={{ color: '#3D3D3D' }}>
              Log Saving
            </a>
            <a href="#dashboard" className="transition-opacity duration-200 hover:opacity-80" style={{ color: '#3D3D3D' }}>
              Leaderboard
            </a>
          </nav>
          {pawAccess && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: '#1A7A6E' }}>
                {displayFullName[0]?.toUpperCase() ?? '?'}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="pt-14 relative">
        <section id="hero" className="relative px-6 py-16 md:py-24 overflow-hidden text-center">
          <div className="absolute inset-0 -z-10 opacity-30" style={{ background: 'linear-gradient(135deg, rgba(157,242,227,0.3), rgba(245,183,49,0.1))' }} />
          <img src={cloud} alt="" className="absolute top-4 right-8 w-28 md:w-44 opacity-20 pointer-events-none -z-10" />
          <img src={cloud} alt="" className="absolute bottom-8 left-4 w-20 md:w-32 opacity-15 pointer-events-none -z-10" />
          <div className="max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6" style={{ background: '#F5B731', color: '#271900' }}>
              <img src={pawPrint} alt="" className="w-4 h-4 bg-transparent" />
              Paw Card Exclusive
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tighter mb-4" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1A7A6E' }}>
              Every Peso <span className="italic" style={{ color: '#F5B731' }}>Wags</span> a Tail
            </h1>
            <p className="text-lg md:text-xl max-w-2xl mx-auto mb-8 leading-relaxed" style={{ color: '#3e4946' }}>
              Log your savings at partner businesses. Every peso you save, <span className="font-bold" style={{ color: '#1A7A6E' }}>Lola's matches as a donation</span> to Be Pawsitive NGO.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <PrimaryCtaLink href="#log-saving" className="px-8 py-3.5 text-lg shadow-lg">
                Start Logging
              </PrimaryCtaLink>
              <a
                href="#dashboard"
                className="px-8 py-3.5 rounded-full font-bold text-lg transition-all duration-300 ease-in-out hover:scale-105"
                style={{ background: '#eae1d2', color: '#1A7A6E' }}
              >
                View Impact
              </a>
            </div>
            <img src={handOnHeart} alt="Every peso helps" className="mx-auto mt-10 w-32 md:w-44 h-auto opacity-90 bg-transparent" />
          </div>
        </section>

        <section id="paw-card-login" className="px-6 py-10" style={{ background: 'rgba(246,237,221,0.6)' }}>
          <div className="max-w-md mx-auto">
            <div className="bg-white p-8 md:p-10 rounded-2xl shadow-lg">
              <PawCardLoginPanel
                access={pawAccess}
                onAccessGranted={setPawAccess}
                onSignOut={() => {
                  setPawAccess(null);
                  qc.invalidateQueries({ queryKey: ['paw-card'] });
                }}
              />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-center gap-6 py-6 opacity-25 max-w-xs mx-auto">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
          <img src={pawPrint} alt="" className="w-7 h-7 opacity-60 grayscale bg-transparent" />
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
        </div>

        <section ref={logRef} id="log-saving" className="px-6 py-12 max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-start">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-4xl font-bold" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1A7A6E' }}>Log a Saving</h2>
              <img src={discountCard} alt="" className="w-10 h-10 bg-transparent" />
            </div>
            <p className="text-lg mb-6 leading-relaxed" style={{ color: '#3e4946' }}>
              Visited one of our partners? Upload your receipt and we&apos;ll match it peso for peso as a donation to Be Pawsitive.
            </p>
            <div className="p-5 rounded-lg" style={{ background: 'rgba(245,183,49,0.15)' }}>
              <h4 className="font-bold text-sm mb-1" style={{ color: '#5e4200' }}>Receipt Guidelines</h4>
              <p className="text-xs" style={{ color: 'rgba(94,66,0,0.8)' }}>
                Make sure the date, business name, and total amount are clearly visible in your photo.
              </p>
            </div>
          </div>

          <div className="p-8 rounded-2xl shadow-lg" style={{ background: '#fcf2e3' }}>
            {!pawAccess ? (
              <div className="text-center py-8">
                <p className="text-sm font-medium" style={{ color: '#6e7976' }}>Enter your email above to log a saving.</p>
                <PrimaryCtaLink href="#paw-card-login" className="mt-3 inline-flex px-6 py-2 text-sm font-bold">
                  Go to access
                </PrimaryCtaLink>
              </div>
            ) : (
              <PawCardSavingsForm
                accessEmail={pawAccess.email}
                customerIdForSubmit={customerIdForSubmit}
                displayFullName={displayFullName}
                onLogged={handleLogged}
              />
            )}
          </div>
        </section>

        <div className="flex items-center justify-center gap-6 py-6 opacity-25 max-w-xs mx-auto">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
          <img src={pawPrint} alt="" className="w-7 h-7 opacity-60 grayscale bg-transparent" />
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
        </div>

        <section ref={dashRef} id="dashboard">
          {pawAccess ? (
            <PawCardDashboard accessEmail={pawAccess.email} displayFullName={displayFullName} />
          ) : (
            <div className="px-6 py-16 text-center max-w-md mx-auto">
              <p className="text-sm font-medium" style={{ color: '#6e7976' }}>Enter your email above to see your impact, community totals, and the leaderboard.</p>
              <PrimaryCtaLink href="#paw-card-login" className="mt-4 inline-flex px-6 py-2 text-sm font-bold">
                Go to access
              </PrimaryCtaLink>
            </div>
          )}
        </section>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-end px-4 pb-4 pt-3 shadow-lg rounded-t-3xl" style={{ background: '#FAF6F0' }}>
        <a
          href="#hero"
          className="flex flex-col items-center gap-0.5 text-xs font-semibold uppercase tracking-wider transition-opacity duration-200 hover:opacity-80"
          style={{ color: 'rgba(61,61,61,0.6)' }}
        >
          <span className="text-lg">🏠</span>Home
        </a>
        <a
          href="#log-saving"
          className="relative flex flex-col items-center gap-0.5 text-xs font-bold uppercase tracking-wider transition-opacity duration-200 hover:opacity-80"
          style={{ color: '#1f1b12' }}
        >
          <span className="text-lg">➕</span>Log Saving
          <div className="absolute -bottom-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full" style={{ background: '#F5B731' }} />
        </a>
        <a
          href="#dashboard"
          className="flex flex-col items-center gap-0.5 text-xs font-semibold uppercase tracking-wider transition-opacity duration-200 hover:opacity-80"
          style={{ color: 'rgba(61,61,61,0.6)' }}
        >
          <span className="text-lg">📊</span>Stats
        </a>
      </nav>

      <FadeUpSection>
        <footer
          className="relative z-10 flex w-full flex-col items-center gap-4 px-8 py-8 pb-24 text-center md:pb-10"
          style={{ background: '#E8DFD0' }}
        >
          <div className="flex items-center gap-2">
            <img src={pawPrint} alt="" className="h-5 w-5 bg-transparent" />
            <img src={logo} alt="Lola's Rentals" className="h-6 w-auto" />
          </div>
          <p className="text-xs" style={{ color: 'rgba(61,61,61,0.6)' }}>
            &copy; {new Date().getFullYear()} Lola&apos;s Rentals x BePawsitive NGO
          </p>
        </footer>
      </FadeUpSection>
    </div>
  );
}
