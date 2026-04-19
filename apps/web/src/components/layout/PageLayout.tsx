import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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
import basketIcon from '../../assets/Buttons/basket icon.svg';

export interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  showFloralLeft?: boolean;
  showFloralRight?: boolean;
  floralPosition?: 'fixed' | 'absolute';
  showBasketIcon?: boolean;
  /** Strip top-padding and horizontal padding from <main> so a hero can sit flush under the nav */
  fullBleed?: boolean;
  /**
   * When set (e.g. About page): florals sit above main content and drift with scroll until the
   * referenced element’s top crosses a viewport threshold, then their offset stays fixed.
   */
  floralScrollFreezeRef?: RefObject<HTMLElement | null>;
  /** Page shell behind nav + main (nav stays sand-brand). Default matches legacy sand. */
  contentBackground?: 'sand' | 'cream' | 'light-cream';
  /** Paint florals above main content (pointer-events-none; light opacity for readability). */
  elevateFlorals?: boolean;
  /**
   * Reserve / similar: shell stops clipping horizontal overflow; florals stay at modest z-index,
   * while main uses z-[30] so the whole page layer (incl. fixed chat) stacks above both flowers.
   * (Left flower art can extend toward the bottom-right; if it were z-20 with main z-10 it would
   * cover third-party chat.)
   */
  unclipLeftFloral?: boolean;
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
      { label: 'Partner Discounts', href: '/paw-card/partners' },
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
  floralScrollFreezeRef,
  contentBackground = 'sand',
  elevateFlorals = false,
  unclipLeftFloral = false,
}: PageLayoutProps) {
  const { pathname } = useLocation();
  const basketCount = useBookingStore((s) => s.basket.length);

  const floralParallaxLocked = useRef<number | null>(null);
  const [floralShift, setFloralShift] = useState(0);
  const [showBackTop, setShowBackTop] = useState(false);

  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  useEffect(() => {
    const onScroll = () => {
      setShowBackTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!floralScrollFreezeRef) return;

    const FREEZE_TOP_PX = 140;
    const PARALLAX = 0.11;

    const update = () => {
      const freezeEl = floralScrollFreezeRef.current;
      const y = window.scrollY;
      const shift = y * PARALLAX;

      if (!freezeEl) {
        floralParallaxLocked.current = null;
        setFloralShift(shift);
        return;
      }

      const top = freezeEl.getBoundingClientRect().top;

      if (top <= FREEZE_TOP_PX) {
        if (floralParallaxLocked.current === null) {
          floralParallaxLocked.current = shift;
        }
        setFloralShift(floralParallaxLocked.current);
      } else {
        floralParallaxLocked.current = null;
        setFloralShift(shift);
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    const ro = new ResizeObserver(() => update());
    if (floralScrollFreezeRef.current) ro.observe(floralScrollFreezeRef.current);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      ro.disconnect();
    };
  }, [floralScrollFreezeRef]);

  const isActive = (to: string) => (to === '/book' ? pathname === '/book' : pathname.startsWith(to));

  const floralOnTop = Boolean(floralScrollFreezeRef);
  /** Parallax / freeze only when ref is set; elevateFlorals only raises z-index + opacity. */
  const floralZ = floralScrollFreezeRef ? 'z-[10]' : elevateFlorals ? 'z-[25]' : 'z-0';
  const leftFloralZ = unclipLeftFloral ? 'z-10' : floralZ;
  const rightFloralZ = unclipLeftFloral ? 'z-0' : floralZ;
  const mainZ = unclipLeftFloral
    ? 'z-[30]'
    : floralScrollFreezeRef
      ? 'z-20'
      : elevateFlorals
        ? 'z-0'
        : 'z-10';
  const leftFloralStyle = floralOnTop
    ? { transform: `translate3d(0, ${floralShift}px, 0)`, willChange: 'transform' as const }
    : undefined;
  const rightFloralStyle = floralOnTop
    ? { transform: `translate3d(0, ${-floralShift * 0.65}px, 0)`, willChange: 'transform' as const }
    : undefined;

  const shellBgStyle =
    contentBackground === 'sand' ? { backgroundColor: '#f1e6d6' as const } : undefined;

  return (
    <div
      className={`relative min-h-screen font-body animate-page-fade-in ${
        unclipLeftFloral ? 'overflow-x-visible' : 'overflow-x-clip'
      } ${
        contentBackground === 'light-cream'
          ? 'bg-[#FAF6F0]'
          : contentBackground === 'cream'
            ? 'bg-cream-brand'
            : ''
      }`}
      style={shellBgStyle}
    >
      <TopNav
        logo={logo}
        logoAlt="Lola's Rentals"
        items={NAV_ITEMS}
        rightSlot={
          showBasketIcon ? (
            <Link
              to="/book/basket"
              aria-label="Basket"
              className="relative flex min-h-[44px] min-w-[44px] items-center justify-center text-charcoal-brand transition-opacity duration-300 hover:opacity-75"
            >
              <img src={basketIcon} alt="" className="h-[1.65rem] w-[1.65rem] object-contain" width={27} height={27} />
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

      <main
        className={`relative pb-8 ${fullBleed ? '' : 'px-4 pt-20'} ${mainZ}`}
      >
        {children}
      </main>

      {/* After <main> in the tree so fixed florals paint above the page layer (see floralZ). */}
      {showFloralLeft && (
        <img
          src={flowerLeft}
          alt=""
          className={`pointer-events-none ${floralPosition} left-0 top-0 ${leftFloralZ} w-32 object-contain md:w-48 ${
            floralOnTop || elevateFlorals ? 'opacity-[0.42]' : ''
          }`}
          style={leftFloralStyle}
        />
      )}
      {showFloralRight && (
        <img
          src={flowerRight}
          alt=""
          className={`pointer-events-none ${floralPosition} bottom-0 right-0 ${rightFloralZ} w-32 object-contain md:w-48 ${
            floralOnTop || elevateFlorals ? 'opacity-[0.42]' : ''
          }`}
          style={rightFloralStyle}
        />
      )}

      <FadeUpSection
        className={
          floralScrollFreezeRef ? 'relative z-[48]' : elevateFlorals ? 'relative z-[35]' : ''
        }
      >
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
                <Link to="/book/bepawsitive" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">
                  Be Pawsitive NGO
                </Link>
                <a
                  href="https://wa.me/639694443413"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand"
                >
                  Contact Us
                </a>
                <Link to="/book/privacy" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">
                  Privacy
                </Link>
                <Link
                  to="/book/waiver-agreement"
                  className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand"
                >
                  Waiver Agreement
                </Link>
                <Link to="/refund-policy" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">
                  Refund Policy
                </Link>
                <Link
                  to="/peace-of-mind"
                  className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand"
                >
                  Peace of Mind Cover
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

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 z-50 md:hidden flex items-center justify-center w-11 h-11 rounded-full bg-teal-brand text-white shadow-md transition-opacity duration-300"
        style={{
          opacity: showBackTop ? 1 : 0,
          pointerEvents: showBackTop ? 'auto' : 'none',
        }}
        aria-label="Back to top"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 12V4M4 8l4-4 4 4" />
        </svg>
      </button>

      <ClickSpark sparkColor="#FCBC5A" sparkSize={10} sparkRadius={14} sparkCount={8} duration={400} easing="ease-out" extraScale={1} />

    </div>
  );
}
