import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { HeroSection } from '../../components/home/HeroSection.js';
import { FleetPreviewSection } from '../../components/home/FleetPreviewSection.js';
import { HowItWorksSection } from '../../components/home/HowItWorksSection.js';
import { PawCardCallout } from '../../components/home/PawCardCallout.js';
import { ReviewsSection } from '../../components/home/ReviewsSection.js';

import logo from '../../assets/Lolas Original Logo.svg';
import pawPrint from '../../assets/Paw Print.svg';

function useFonts() {
  useEffect(() => {
    const id = 'home-fonts';
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
    <div className="flex justify-center py-8">
      <img src={pawPrint} alt="" className="h-12 w-12 bg-transparent opacity-20" />
    </div>
  );
}

export default function HomePage() {
  useFonts();

  return (
    <div className="relative min-h-screen overflow-x-hidden font-body animate-page-fade-in" style={{ background: '#FAF6F0' }}>
      {/* Header */}
      <header className="fixed left-0 top-0 z-50 flex w-full items-center justify-between bg-teal-brand px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Lola's Rentals" className="h-8 w-auto brightness-0 invert" />
        </div>
        <div className="hidden items-center gap-8 md:flex">
          <Link to="/" className="font-bold text-gold-brand transition-opacity duration-200 hover:opacity-80">Home</Link>
          <Link to="/browse-book" className="text-white/80 transition-opacity duration-200 hover:text-white hover:opacity-80">Reserve</Link>
          <Link to="/paw-card" className="text-white/80 transition-opacity duration-200 hover:text-white hover:opacity-80">Paw Card</Link>
        </div>
        <Link to="/basket" className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/20 text-white transition-all duration-300 hover:bg-white/10">🛒</Link>
      </header>

      <main className="pt-16">
        <HeroSection />

        <PawDivider />

        {/* Store location card */}
        <section className="px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 flex items-center justify-center gap-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold-brand text-sm text-white">🐾</span>
              <h3 className="text-2xl font-bold text-charcoal-brand">Choose Your Starting Point</h3>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold-brand text-sm text-white">🐾</span>
            </div>
            <div className="mx-auto max-w-md">
              <div className="group relative overflow-hidden rounded-4xl bg-cream-brand p-8 shadow-[0_4px_20px_rgba(61,61,61,0.05)]">
                <div className="mb-6 flex items-start justify-between">
                  <span className="text-3xl text-teal-brand">📍</span>
                  <span className="rounded-full bg-gold-brand px-3 py-1 text-[10px] font-black uppercase tracking-wider text-charcoal-brand">
                    PRIMARY HUB
                  </span>
                </div>
                <h4 className="mb-2 text-xl font-bold text-charcoal-brand">Lola's Rentals (General Luna)</h4>
                <p className="mb-6 text-sm text-charcoal-brand/70">Heart of the island, steps away from Cloud 9.</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-brand">
                  <div className="h-full w-full bg-teal-brand" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <PawDivider />

        <FadeUpSection>
          <FleetPreviewSection />
        </FadeUpSection>

        <PawDivider />

        <FadeUpSection>
          <HowItWorksSection />
        </FadeUpSection>

        <FadeUpSection>
          <PawCardCallout />
        </FadeUpSection>

        <FadeUpSection>
          <ReviewsSection />
        </FadeUpSection>
      </main>

      {/* Footer */}
      <FadeUpSection>
        <footer className="w-full border-t border-sand-brand bg-cream-brand pb-32 pt-16 md:pb-16">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-12 px-6 md:flex-row">
            <div className="max-w-xs space-y-4">
              <span className="font-headline text-2xl font-black italic text-teal-brand">Lola's Rentals</span>
              <p className="text-sm leading-relaxed text-charcoal-brand/60">
                © 2025 Lola's Rentals &amp; Tours Inc. Supporting BePawsitive animal welfare on Siargao Island.
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

      {/* Mobile Nav */}
      <nav className="fixed bottom-0 left-0 z-50 flex h-24 w-full items-center justify-around rounded-t-5xl bg-cream-brand px-4 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] md:hidden">
        <Link to="/" className="flex scale-110 flex-col items-center gap-0.5 rounded-3xl bg-[#D1E7E4] px-6 py-2 text-xs font-black text-teal-brand">
          <span className="text-lg">🏠</span>Home
        </Link>
        <Link to="/browse-book" className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50">
          <span className="text-lg">🏍️</span>Reserve
        </Link>
        <Link to="/paw-card" className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50">
          <span className="text-lg">🐾</span>Paw Card
        </Link>
      </nav>
    </div>
  );
}
