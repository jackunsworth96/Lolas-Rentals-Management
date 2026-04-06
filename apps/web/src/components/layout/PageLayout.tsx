import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBookingStore } from '../../stores/bookingStore.js';
import { FadeUpSection } from '../public/FadeUpSection.js';
import TopNav from './TopNav.js';
import ClickSpark from '../home/ClickSpark.js';

import logo from '../../assets/Lolas Original Logo.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';

export interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  showFloralLeft?: boolean;
  showFloralRight?: boolean;
  floralPosition?: 'fixed' | 'absolute';
  showBasketIcon?: boolean;
  /** Strip top-padding and horizontal padding from <main> so a hero can sit flush under the nav */
  fullBleed?: boolean;
}

const NAV_ITEMS = [
  { label: 'Home', href: '/book' },
  { label: 'Reserve', href: '/book/reserve' },
  { label: 'Transfers', href: '/book/transfers' },
  { label: 'Repairs', href: '/book/repairs' },
  { label: 'About', href: '/book/about' },
  {
    label: 'My Rental',
    href: '/book/paw-card',
    isDropdown: true,
    dropdownItems: [
      { label: 'Log Paw Card Savings', href: '/book/paw-card' },
      { label: 'Extend My Rental', href: '/book/extend' },
    ],
  },
];

const BOTTOM_NAV = [
  { to: '/book', icon: '🏠', label: 'Home' },
  { to: '/book/reserve', icon: '🏍️', label: 'Reserve' },
  { to: '/book/transfers', icon: '🚐', label: 'Transfers' },
  { to: '/book/extend', icon: '📋', label: 'My Rental' },
  { to: '/book/repairs', icon: '🔧', label: 'Repairs' },
];


export function PageLayout({
  children,
  title,
  showFloralLeft = true,
  showFloralRight = true,
  floralPosition = 'fixed',
  showBasketIcon = false,
  fullBleed = false,
}: PageLayoutProps) {
  const { pathname } = useLocation();
  const basketCount = useBookingStore((s) => s.basket.length);

  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  const isActive = (to: string) => (to === '/book' ? pathname === '/book' : pathname.startsWith(to));

  return (
    <div
      className="relative min-h-screen font-body animate-page-fade-in"
      style={{ background: '#f1e6d6', overflowX: 'hidden' }}
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

      <TopNav
        logo={logo}
        logoAlt="Lola's Rentals"
        items={NAV_ITEMS}
        rightSlot={
          showBasketIcon ? (
            <Link
              to="/book/basket"
              className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-2 border-charcoal-brand/30 text-charcoal-brand transition-all duration-300 hover:bg-charcoal-brand/10"
            >
              🛒
              {basketCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold-brand text-[10px] font-black text-charcoal-brand">
                  {basketCount}
                </span>
              )}
            </Link>
          ) : undefined
        }
      />

      <main className={`relative z-10 overflow-x-hidden pb-32 ${fullBleed ? '' : 'px-4 pt-20'}`}>{children}</main>

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

      <ClickSpark sparkColor="#FCBC5A" sparkSize={10} sparkRadius={14} sparkCount={8} duration={400} easing="ease-out" extraScale={1} />

      <nav className="fixed bottom-0 left-0 z-50 flex h-20 w-full items-center justify-around bg-cream-brand px-4 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] md:hidden">
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
