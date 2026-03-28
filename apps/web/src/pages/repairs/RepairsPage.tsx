import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { WhatToDoSection } from '../../components/repairs/WhatToDoSection.js';
import { EmergencyContactsSection } from '../../components/repairs/EmergencyContactsSection.js';
import { CommonIssuesSection } from '../../components/repairs/CommonIssuesSection.js';
import { RepairCostsSection } from '../../components/repairs/RepairCostsSection.js';
import { SafetyTipsSection } from '../../components/repairs/SafetyTipsSection.js';

import logo from '../../assets/Lolas Original Logo.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import pawPrint from '../../assets/Paw Print.svg';

function useFonts() {
  useEffect(() => {
    const id = 'repairs-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Epilogue:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
    return () => { document.getElementById(id)?.remove(); };
  }, []);
}

function PawDivider() {
  return (
    <div className="flex justify-center py-12">
      <img src={pawPrint} alt="" className="h-12 w-12 bg-transparent opacity-20" />
    </div>
  );
}

export default function RepairsPage() {
  useFonts();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-x-hidden font-body animate-page-fade-in" style={{ background: '#FAF6F0' }}>
      <header className="fixed left-0 top-0 z-50 flex w-full items-center justify-between bg-teal-brand px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-2xl text-white md:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            ☰
          </button>
          <img src={logo} alt="Lola's Rentals" className="h-8 w-auto brightness-0 invert" />
        </div>
        <div className="hidden items-center gap-8 md:flex">
          <Link to="/" className="text-white/80 transition-opacity duration-200 hover:text-white hover:opacity-80">Home</Link>
          <Link to="/browse-book" className="text-white/80 transition-opacity duration-200 hover:text-white hover:opacity-80">Reserve</Link>
          <Link to="/repairs" className="font-bold text-gold-brand transition-opacity duration-200 hover:opacity-80">Repairs</Link>
          <Link to="/paw-card" className="text-white/80 transition-opacity duration-200 hover:text-white hover:opacity-80">Paw Card</Link>
        </div>
        <Link to="/basket" className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/20 text-white transition-all duration-300 hover:bg-white/10">🛒</Link>
      </header>

      {menuOpen && (
        <div className="fixed inset-x-0 top-[72px] z-40 flex flex-col gap-2 bg-teal-brand px-6 py-4 shadow-lg md:hidden">
          <Link to="/" className="py-2 font-bold text-white" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link to="/browse-book" className="py-2 font-bold text-white" onClick={() => setMenuOpen(false)}>Reserve</Link>
          <Link to="/repairs" className="py-2 font-bold text-gold-brand" onClick={() => setMenuOpen(false)}>Repairs</Link>
          <Link to="/paw-card" className="py-2 font-bold text-white" onClick={() => setMenuOpen(false)}>Paw Card</Link>
        </div>
      )}

      <main className="relative z-10 pb-32 pt-16">
        <section className="relative overflow-hidden px-6 py-16 text-center md:py-24">
          <img src={flowerLeft} alt="" className="pointer-events-none absolute left-0 top-1/2 w-24 -translate-y-1/2 opacity-40 md:w-48 md:opacity-100" />
          <img src={flowerRight} alt="" className="pointer-events-none absolute right-0 top-1/2 w-24 -translate-y-1/2 opacity-40 md:w-48 md:opacity-100" />
          <div className="relative z-10 mx-auto max-w-3xl space-y-6">
            <h1 className="font-headline text-5xl font-black leading-tight tracking-tight text-teal-brand md:text-7xl">
              We&apos;ve Got You Covered
            </h1>
            <p className="mx-auto max-w-2xl text-xl font-medium text-charcoal-brand/80 md:text-2xl">
              Broke down on the road? Don&apos;t stress — here&apos;s everything you need.
            </p>
            <div className="pt-8">
              <PrimaryCtaButton href="tel:09694443413" className="mx-auto inline-flex gap-3 px-8 py-4 text-lg shadow-[0_20px_40px_rgba(62,73,70,0.06)]">
                📞 Call Hotline Now
              </PrimaryCtaButton>
            </div>
          </div>
        </section>

        <PawDivider />
        <WhatToDoSection />
        <PawDivider />
        <EmergencyContactsSection />
        <PawDivider />
        <CommonIssuesSection />
        <PawDivider />
        <RepairCostsSection />
        <PawDivider />
        <SafetyTipsSection />
      </main>

      <FadeUpSection>
        <footer className="w-full border-t border-sand-brand bg-cream-brand pb-32 pt-16 md:pb-16">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-12 px-6 md:flex-row">
            <div className="max-w-xs space-y-4">
              <span className="font-headline text-2xl font-black italic text-teal-brand">Lola&apos;s Rentals</span>
              <p className="text-sm leading-relaxed text-charcoal-brand/60">
                © 2025 Lola&apos;s Rentals &amp; Tours Inc. Supporting BePawsitive animal welfare on Siargao Island.
              </p>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                <Link to="/repairs" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">Island Safety</Link>
                <a href="https://bepawsitive.com" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">BePawsitive NGO</a>
                <a href="https://wa.me/639694443413" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">Contact Us</a>
                <Link to="/privacy" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">Privacy</Link>
              </div>
              <div className="flex items-center gap-5">
                <a href="https://instagram.com/lolasrentals" target="_blank" rel="noopener noreferrer" className="text-lg text-charcoal-brand/50 transition-colors hover:text-teal-brand" aria-label="Instagram">📸</a>
                <a href="https://wa.me/639694443413" target="_blank" rel="noopener noreferrer" className="text-lg text-charcoal-brand/50 transition-colors hover:text-teal-brand" aria-label="WhatsApp">💬</a>
                <a href="https://goo.gl/maps/ZA5n6BxzQRMnjFdp9" target="_blank" rel="noopener noreferrer" className="text-lg text-charcoal-brand/50 transition-colors hover:text-teal-brand" aria-label="Google Maps">📍</a>
              </div>
            </div>
          </div>
        </footer>
      </FadeUpSection>

      <nav className="fixed bottom-0 left-0 z-50 flex h-24 w-full items-center justify-around rounded-t-5xl bg-cream-brand px-4 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] md:hidden">
        <Link to="/" className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50">
          <span className="text-lg">🏠</span>Home
        </Link>
        <Link to="/browse-book" className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50">
          <span className="text-lg">🏍️</span>Reserve
        </Link>
        <Link to="/repairs" className="flex scale-110 flex-col items-center gap-0.5 rounded-3xl bg-[#D1E7E4] px-6 py-2 text-xs font-black text-teal-brand">
          <span className="text-lg">🔧</span>Repairs
        </Link>
        <Link to="/paw-card" className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50">
          <span className="text-lg">🐾</span>Paw Card
        </Link>
      </nav>
    </div>
  );
}
