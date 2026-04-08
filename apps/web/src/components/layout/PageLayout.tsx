import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBookingStore } from '../../stores/bookingStore.js';
import { FadeUpSection } from '../public/FadeUpSection.js';
import TopNav from './TopNav.js';
import ClickSpark from '../home/ClickSpark.js';
import { instaIcon, phoneIcon, locationIcon } from '../public/customerContactIcons.js';
import { GOOGLE_MAPS_PLACE_URL } from '../../config/maps.js';

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
      className="relative min-h-screen overflow-x-clip font-body animate-page-fade-in"
      style={{ background: '#f1e6d6' }}
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

      {/* Reserve the same vertical space as the fixed nav (h-16) so content is not hidden underneath */}
      <div className="h-16 shrink-0" aria-hidden="true" />

      <main className={`relative z-10 overflow-x-hidden pb-8 ${fullBleed ? '' : 'px-4 pt-20'}`}>{children}</main>

      <FadeUpSection>
        <footer className="w-full border-t border-sand-brand bg-cream-brand pb-32 pt-16 md:pb-16">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-12 px-6 md:flex-row">
            <div className="max-w-xs space-y-4">
              <span className="font-headline text-2xl font-black italic text-teal-brand">
                Lola&apos;s Rentals
              </span>
              <p className="text-sm leading-relaxed text-charcoal-brand/60">
                © 2026 Lola&apos;s Rentals and Tours Inc. | Built in-house
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
                <a
                  href="https://wa.me/639694443413"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand"
                >
                  <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain opacity-80" width={16} height={16} />
                  Contact Us
                </a>
                <Link to="/book/privacy" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">
                  Privacy
                </Link>
              </div>
              <div className="flex items-center gap-5">
                <a
                  href="https://instagram.com/lolasrentals"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-charcoal-brand/80 transition-opacity hover:opacity-90"
                  aria-label="Instagram"
                >
                  <img src={instaIcon} alt="" className="h-7 w-7 object-contain" width={28} height={28} />
                </a>
                <a
                  href="https://wa.me/639694443413"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-charcoal-brand/80 transition-opacity hover:opacity-90"
                  aria-label="WhatsApp"
                >
                  <img src={phoneIcon} alt="" className="h-7 w-7 object-contain" width={28} height={28} />
                </a>
                <a
                  href={GOOGLE_MAPS_PLACE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-charcoal-brand/80 transition-opacity hover:opacity-90"
                  aria-label="Google Maps"
                >
                  <img src={locationIcon} alt="" className="h-7 w-7 object-contain" width={28} height={28} />
                </a>
              </div>
            </div>
          </div>
        </footer>
      </FadeUpSection>

      <ClickSpark sparkColor="#FCBC5A" sparkSize={10} sparkRadius={14} sparkCount={8} duration={400} easing="ease-out" extraScale={1} />

    </div>
  );
}
