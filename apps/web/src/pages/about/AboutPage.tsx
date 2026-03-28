import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { BrandStorySection } from '../../components/about/BrandStorySection.js';
import { ValuesSection } from '../../components/about/ValuesSection.js';
import { BePawsitiveSection } from '../../components/about/BePawsitiveSection.js';
import { TimelineSection } from '../../components/about/TimelineSection.js';
import { TeamSection } from '../../components/about/TeamSection.js';

import logo from '../../assets/Lolas Original Logo.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import pawPrint from '../../assets/Paw Print.svg';

function useFonts() {
  useEffect(() => {
    const id = 'about-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Epilogue:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);
}

function PawDivider() {
  return (
    <div className="flex justify-center py-12">
      <img src={pawPrint} alt="" className="h-8 w-8 bg-transparent opacity-20" />
    </div>
  );
}

export default function AboutPage() {
  useFonts();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLink = 'text-white/80 transition-opacity duration-200 hover:text-white hover:opacity-80';
  const navActive = 'font-bold text-gold-brand transition-opacity duration-200 hover:opacity-80';

  return (
    <div
      className="relative min-h-screen overflow-x-hidden font-body animate-page-fade-in"
      style={{ background: '#FAF6F0' }}
    >
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
          <Link to="/" onClick={() => setMenuOpen(false)}>
            <img src={logo} alt="Lola's Rentals" className="h-8 w-auto brightness-0 invert" />
          </Link>
        </div>
        <div className="hidden items-center gap-8 md:flex">
          <Link to="/" className={navLink}>
            Home
          </Link>
          <Link to="/browse-book" className={navLink}>
            Reserve
          </Link>
          <Link to="/about" className={navActive}>
            About
          </Link>
          <Link to="/repairs" className={navLink}>
            Repairs
          </Link>
        </div>
        <Link
          to="/basket"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/20 text-white transition-all duration-300 hover:bg-white/10"
        >
          🛒
        </Link>
      </header>

      {menuOpen && (
        <div className="fixed inset-x-0 top-[72px] z-40 flex flex-col gap-2 bg-teal-brand px-6 py-4 shadow-lg md:hidden">
          <Link to="/" className="py-2 font-bold text-white" onClick={() => setMenuOpen(false)}>
            Home
          </Link>
          <Link to="/browse-book" className="py-2 font-bold text-white" onClick={() => setMenuOpen(false)}>
            Reserve
          </Link>
          <Link to="/about" className="py-2 font-bold text-gold-brand" onClick={() => setMenuOpen(false)}>
            About
          </Link>
          <Link to="/repairs" className="py-2 font-bold text-white" onClick={() => setMenuOpen(false)}>
            Repairs
          </Link>
        </div>
      )}

      <main className="relative z-10 pb-32 pt-16">
        <section className="relative mx-auto flex max-w-5xl flex-col items-center overflow-visible px-6 py-20 text-center md:py-32">
          <img
            src={flowerLeft}
            alt=""
            className="pointer-events-none absolute -left-12 top-0 w-32 -rotate-12 opacity-80 md:w-48"
          />
          <img
            src={flowerRight}
            alt=""
            className="pointer-events-none absolute -right-12 bottom-12 w-32 rotate-12 opacity-80 md:w-48"
          />
          <h1 className="relative z-10 mb-6 font-headline text-5xl leading-[0.95] tracking-tighter text-charcoal-brand md:text-7xl">
            A Small Island Business <br />
            <span className="italic text-teal-brand">With a Big Heart</span>
          </h1>
          <p className="relative z-10 max-w-2xl text-lg font-medium text-charcoal-brand/80 md:text-2xl">
            Born on Siargao, built around community.
          </p>
        </section>

        <PawDivider />
        <BrandStorySection />
        <PawDivider />
        <ValuesSection />
        <BePawsitiveSection />
        <PawDivider />
        <TimelineSection />
        <TeamSection />
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
                <a
                  href="https://bepawsitive.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand"
                >
                  BePawsitive Partnership
                </a>
                <a
                  href="https://wa.me/639694443413"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand"
                >
                  WhatsApp Support
                </a>
                <Link
                  to="/repairs"
                  className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand"
                >
                  Island Guide
                </Link>
                <Link
                  to="/privacy"
                  className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand"
                >
                  Privacy
                </Link>
              </div>
              <div className="flex items-center gap-5">
                <a
                  href="https://instagram.com/lolasrentals"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg text-charcoal-brand/50 transition-colors hover:text-teal-brand"
                  aria-label="Instagram"
                >
                  📸
                </a>
                <a
                  href="https://wa.me/639694443413"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg text-charcoal-brand/50 transition-colors hover:text-teal-brand"
                  aria-label="WhatsApp"
                >
                  💬
                </a>
                <a
                  href="https://goo.gl/maps/ZA5n6BxzQRMnjFdp9"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg text-charcoal-brand/50 transition-colors hover:text-teal-brand"
                  aria-label="Google Maps"
                >
                  📍
                </a>
              </div>
            </div>
          </div>
        </footer>
      </FadeUpSection>

      <nav className="fixed bottom-0 left-0 z-50 flex h-24 w-full items-center justify-around rounded-t-5xl bg-cream-brand px-4 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] md:hidden">
        <Link
          to="/"
          className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50"
        >
          <span className="text-lg">🏠</span>Home
        </Link>
        <Link
          to="/browse-book"
          className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50"
        >
          <span className="text-lg">🏍️</span>Reserve
        </Link>
        <Link
          to="/about"
          className="flex scale-110 flex-col items-center gap-0.5 rounded-3xl bg-[#D1E7E4] px-6 py-2 text-xs font-black text-teal-brand"
        >
          <span className="text-lg">💚</span>About
        </Link>
        <Link
          to="/paw-card"
          className="flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-black text-charcoal-brand/50"
        >
          <span className="text-lg">🐾</span>Paw Card
        </Link>
      </nav>
    </div>
  );
}
