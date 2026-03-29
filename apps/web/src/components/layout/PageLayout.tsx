import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBookingStore } from '../../stores/bookingStore.js';
import { FadeUpSection } from '../public/FadeUpSection.js';

import logo from '../../assets/Lolas Original Logo.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';

function useFonts() {
  useEffect(() => {
    const id = 'page-layout-fonts';
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

export interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  showFloralLeft?: boolean;
  showFloralRight?: boolean;
  floralPosition?: 'fixed' | 'absolute';
  showBasketIcon?: boolean;
}

const NAV_LINKS = [
  { to: '/book', label: 'Home' },
  { to: '/book/reserve', label: 'Reserve' },
  { to: '/book/paw-card', label: 'Paw Card' },
  { to: '/book/repairs', label: 'Repairs' },
  { to: '/book/about', label: 'About' },
];

const BOTTOM_NAV = [
  { to: '/book', icon: '🏠', label: 'Home' },
  { to: '/book/reserve', icon: '🏍️', label: 'Reserve' },
  { to: '/book/paw-card', icon: '🐾', label: 'Paw Card' },
  { to: '/book/repairs', icon: '🔧', label: 'Repairs' },
];

const linkBase = 'min-h-[44px] flex items-center transition-opacity duration-200 hover:opacity-80';
const linkActive = `${linkBase} font-bold text-gold-brand`;
const linkInactive = `${linkBase} text-white/80 hover:text-white`;

export function PageLayout({
  children,
  title,
  showFloralLeft = true,
  showFloralRight = true,
  floralPosition = 'fixed',
  showBasketIcon = false,
}: PageLayoutProps) {
  useFonts();
  const { pathname } = useLocation();
  const basketCount = useBookingStore((s) => s.basket.length);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const isActive = (to: string) => (to === '/book' ? pathname === '/book' : pathname.startsWith(to));

  return (
    <div
      className="relative min-h-screen overflow-x-hidden font-body animate-page-fade-in"
      style={{ background: '#FAF6F0' }}
    >
      {showFloralLeft && (
        <img
          src={flowerLeft}
          alt=""
          className={`pointer-events-none ${floralPosition} left-0 top-0 z-0 w-32 object-contain md:w-48`}
        />
      )}
      {showFloralRight && (
        <img
          src={flowerRight}
          alt=""
          className={`pointer-events-none ${floralPosition} bottom-0 right-0 z-0 w-32 object-contain md:w-48`}
        />
      )}

      <header className="fixed left-0 top-0 z-50 flex w-full items-center justify-between bg-teal-brand px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center text-2xl text-white md:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            ☰
          </button>
          <Link to="/book" onClick={() => setMenuOpen(false)}>
            <img src={logo} alt="Lola's Rentals" className="h-8 w-auto brightness-0 invert" />
          </Link>
        </div>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((n) => (
            <Link key={n.to} to={n.to} className={isActive(n.to) ? linkActive : linkInactive}>
              {n.label}
            </Link>
          ))}
        </nav>

        {showBasketIcon ? (
          <Link
            to="/book/basket"
            className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-2 border-white/20 text-white transition-all duration-300 hover:bg-white/10"
          >
            🛒
            {basketCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold-brand text-[10px] font-black text-charcoal-brand">
                {basketCount}
              </span>
            )}
          </Link>
        ) : (
          <div className="w-10" />
        )}
      </header>

      {menuOpen && (
        <div className="fixed inset-x-0 top-[72px] z-40 flex flex-col gap-2 bg-teal-brand px-6 py-4 shadow-lg md:hidden">
          {NAV_LINKS.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`min-h-[44px] flex items-center py-2 font-bold ${isActive(n.to) ? 'text-gold-brand' : 'text-white'}`}
              onClick={() => setMenuOpen(false)}
            >
              {n.label}
            </Link>
          ))}
        </div>
      )}

      <main className="relative z-10 overflow-x-hidden px-4 pb-32 pt-20">{children}</main>

      <FadeUpSection>
        <footer className="w-full border-t border-sand-brand bg-cream-brand pb-32 pt-16 md:pb-16">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-12 px-6 md:flex-row">
            <div className="max-w-xs space-y-4">
              <span className="font-headline text-2xl font-black italic text-teal-brand">
                Lola&apos;s Rentals
              </span>
              <p className="text-sm leading-relaxed text-charcoal-brand/60">
                © {new Date().getFullYear()} Lola&apos;s Rentals &amp; Tours Inc. Supporting BePawsitive animal welfare on
                Siargao Island.
              </p>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                <Link to="/book/repairs" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">
                  Island Safety
                </Link>
                <a href="https://bepawsitive.com" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">
                  BePawsitive NGO
                </a>
                <a href="https://wa.me/639694443413" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">
                  Contact Us
                </a>
                <Link to="/book/privacy" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">
                  Privacy
                </Link>
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

      <nav className="fixed bottom-0 left-0 z-50 flex h-20 w-full items-center justify-around rounded-t-[3rem] bg-cream-brand px-4 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] md:hidden">
        {BOTTOM_NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className={`flex min-h-[44px] flex-col items-center gap-0.5 py-2 text-xs font-black transition-all duration-200 ${
              isActive(n.to)
                ? 'scale-110 rounded-3xl bg-[#D1E7E4] px-6 text-teal-brand'
                : 'px-5 text-charcoal-brand/50 hover:opacity-80'
            }`}
          >
            <span className="text-lg">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
