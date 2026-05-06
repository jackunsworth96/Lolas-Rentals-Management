import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBookingStore } from '../../stores/bookingStore.js';
import { FadeUpSection } from '../public/FadeUpSection.js';
import TopNav from './TopNav.js';
import ClickSpark from '../home/ClickSpark.js';
import { instaIcon, phoneIcon, locationIcon } from '../public/customerContactIcons.js';
import { GOOGLE_MAPS_PLACE_URL } from '../../config/maps.js';
import { CookieNotice } from '../common/CookieNotice.js';
import { usePartnerRefCapture } from '../../hooks/usePartnerRefCapture.js';

import logo from '../../assets/Lolas Original Logo.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import basketIcon from '../../assets/Buttons/basket icon.svg';
import footerDesign from '../../assets/Footer/footer design.svg';
import footerDesignMobile from '../../assets/Footer/footer design mobile.svg';

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

function useNavItems() {
  const { t } = useTranslation();
  return [
    { label: t('nav.home'), href: '/book' },
    { label: t('nav.reserve'), href: '/book/reserve' },
    { label: t('nav.transfers'), href: '/book/transfers' },
    { label: t('nav.repairs'), href: '/book/repairs' },
    { label: t('nav.about'), href: '/book/about' },
    {
      label: t('nav.myRental'),
      href: '/paw-card/partners',
      isDropdown: true,
      dropdownItems: [
        { label: t('nav.partnerDiscounts'), href: '/paw-card/partners' },
        { label: t('nav.extendRental'), href: '/book/extend' },
      ],
    },
  ];
}



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
  const { t } = useTranslation();
  const navItems = useNavItems();
  const basketCount = useBookingStore((s) => s.basket.length);

  // Capture ?ref=<slug> (and resolve the partner benefit) on every customer
  // page. Cached in sessionStorage so subsequent navigations don't re-fetch.
  const { benefit: partnerBenefit } = usePartnerRefCapture();

  // Flash the basket icon (bounce + gold highlight) whenever an item is added.
  const [basketFlash, setBasketFlash] = useState(false);
  const prevBasketCount = useRef(basketCount);
  useEffect(() => {
    if (basketCount > prevBasketCount.current) {
      setBasketFlash(true);
      const t = window.setTimeout(() => setBasketFlash(false), 2000);
      prevBasketCount.current = basketCount;
      return () => window.clearTimeout(t);
    }
    prevBasketCount.current = basketCount;
  }, [basketCount]);

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
  // When unclipLeftFloral (reserve page), shift the right floral up so it clears the chat
  // button zone (chat sits at bottom-28 / bottom-12, h-16 → top at ~176px from viewport bottom).
  const rightFloralStyle: React.CSSProperties | undefined = floralOnTop
    ? { transform: `translate3d(0, ${-floralShift * 0.65}px, 0)`, willChange: 'transform' as const }
    : unclipLeftFloral
      ? { bottom: '12rem' }
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
        items={navItems}
        partnerBenefit={partnerBenefit}
        rightSlot={
          showBasketIcon ? (
            <Link
              to="/book/basket"
              aria-label="Cart"
              className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-charcoal-brand transition-colors duration-300 hover:opacity-75 ${
                basketFlash
                  ? 'bg-gold-brand/30 ring-2 ring-gold-brand/60'
                  : 'bg-transparent'
              }`}
            >
              <img
                src={basketIcon}
                alt=""
                className={`h-8 w-8 object-contain ${basketFlash ? 'animate-basket-bounce' : ''}`}
                width={32}
                height={32}
              />
              {basketCount > 0 && (
                <span className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold-brand text-[10px] font-black text-charcoal-brand ${basketFlash ? 'animate-badge-pop' : ''}`}>
                  {basketCount}
                </span>
              )}
            </Link>
          ) : undefined
        }
      />

      {/* Reserve vertical space for the fixed nav; on mobile also reserve the partner banner height when active */}
      <div
        className={`shrink-0 md:h-16 ${partnerBenefit ? 'h-[104px]' : 'h-16'}`}
        aria-hidden="true"
      />

      <main
        className={`relative pb-8 ${fullBleed ? '' : 'pt-20'} ${mainZ}`}
      >
        {children}
      </main>

      {/* After <main> in the tree so fixed florals paint above the page layer (see floralZ). */}
      {showFloralLeft && (
        <img
          src={flowerLeft}
          alt=""
          className={`pointer-events-none hidden md:block ${floralPosition} left-0 top-0 ${leftFloralZ} w-32 object-contain md:w-48 ${
            floralOnTop || elevateFlorals ? 'opacity-[0.42]' : ''
          }`}
          style={leftFloralStyle}
        />
      )}
      {showFloralRight && (
        <img
          src={flowerRight}
          alt=""
          className={`pointer-events-none hidden md:block ${floralPosition} bottom-0 right-0 ${rightFloralZ} w-32 object-contain md:w-48 ${
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
        {/* Mobile: mobile-optimised SVG illustration, then footer content below */}
        <div className="md:hidden">
          <img
            src={footerDesignMobile}
            alt=""
            className="w-full object-cover leading-[0] block"
            aria-hidden="true"
          />
          <footer className="w-full bg-[#f1e6d6] px-5 pb-28 pt-6">
            {/* Logo + social icons row */}
            <div className="flex items-center justify-between">
              <Link to="/book" aria-label="Lola's Rentals home" className="inline-block">
                <img
                  src={logo}
                  alt="Lola's Rentals"
                  className="h-8 w-auto object-contain"
                  draggable={false}
                />
              </Link>
              <div className="flex items-center gap-4">
                <a href="https://instagram.com/lolasrentals" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="inline-flex text-charcoal-brand/80 transition-opacity hover:opacity-90">
                  <img src={instaIcon} alt="" className="h-6 w-6 object-contain" width={24} height={24} />
                </a>
                <a href="https://wa.me/639694443413" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="inline-flex text-charcoal-brand/80 transition-opacity hover:opacity-90">
                  <img src={phoneIcon} alt="" className="h-6 w-6 object-contain" width={24} height={24} />
                </a>
                <a href={GOOGLE_MAPS_PLACE_URL} target="_blank" rel="noopener noreferrer" aria-label="Google Maps" className="inline-flex text-charcoal-brand/80 transition-opacity hover:opacity-90">
                  <img src={locationIcon} alt="" className="h-6 w-6 object-contain" width={24} height={24} />
                </a>
              </div>
            </div>

            {/* Page links */}
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
              <Link to="/book/repairs" className="text-xs font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.islandSafety')}</Link>
              <Link to="/book/bepawsitive" className="text-xs font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.bePawsitiveNgo')}</Link>
              <a href="https://wa.me/639694443413" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.contactUs')}</a>
              <Link to="/book/privacy" className="text-xs font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.privacy')}</Link>
              <Link to="/book/waiver-agreement" className="text-xs font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.waiverAgreement')}</Link>
              <Link to="/book/terms" className="text-xs font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">Terms &amp; Conditions</Link>
              <Link to="/refund-policy" className="text-xs font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.refundPolicy')}</Link>
              <Link to="/peace-of-mind" className="text-xs font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.peaceOfMindCover')}</Link>
              <Link to="/affiliates" className="text-xs font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.affiliates')}</Link>
            </div>

            <p className="mt-5 text-[10px] leading-relaxed text-charcoal-brand/50">
              {t('footer.copyright')}
            </p>
          </footer>
        </div>

        {/* Desktop: desktop SVG + overlaid footer */}
        <div className="relative leading-[0] hidden md:block">
          <img
            src={footerDesign}
            alt=""
            className="w-full object-cover object-bottom"
            aria-hidden="true"
          />
          <footer className="absolute inset-0 pointer-events-none">
            {/* Left column — logo, copyright, social icons */}
            <div className="pointer-events-auto absolute bottom-[18%] left-6 max-w-xs space-y-4">
              <Link to="/book" aria-label="Lola's Rentals home" className="inline-block">
                <img
                  src={logo}
                  alt="Lola's Rentals"
                  className="h-9 w-auto object-contain md:h-10"
                  draggable={false}
                />
              </Link>
              <p className="text-sm leading-relaxed text-charcoal-brand/60">
                {t('footer.copyright')}
              </p>
              <div className="flex items-center gap-5 pt-1">
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

            {/* Right columns — opening hours + page links */}
            <div className="pointer-events-auto absolute bottom-[10%] right-6 flex items-start gap-12">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-charcoal-brand/70">{t('footer.openingHours')}</p>
                <p className="text-sm text-charcoal-brand/60">{t('footer.hours')}</p>
                <p className="text-sm text-charcoal-brand/60">{t('footer.address1')}</p>
                <p className="text-sm text-charcoal-brand/60">{t('footer.address2')}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                <Link to="/book/repairs" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.islandSafety')}</Link>
                <Link to="/book/bepawsitive" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.bePawsitiveNgo')}</Link>
                <a href="https://wa.me/639694443413" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.contactUs')}</a>
                <Link to="/book/privacy" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.privacy')}</Link>
                <Link to="/book/waiver-agreement" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.waiverAgreement')}</Link>
                <Link to="/book/terms" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">Terms &amp; Conditions</Link>
                <Link to="/refund-policy" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.refundPolicy')}</Link>
                <Link to="/peace-of-mind" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.peaceOfMindCover')}</Link>
                <Link to="/affiliates" className="text-sm font-semibold text-charcoal-brand/70 transition-all duration-300 hover:text-teal-brand">{t('footer.affiliates')}</Link>
              </div>
            </div>
          </footer>
        </div>
      </FadeUpSection>

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 md:hidden flex items-center justify-center h-10 w-10 rounded-full bg-teal-brand text-white shadow-md transition-opacity duration-300"
        style={{
          opacity: showBackTop ? 1 : 0,
          pointerEvents: showBackTop ? 'auto' : 'none',
        }}
        aria-label="Back to top"
      >
        <svg
          width="12"
          height="12"
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

      <CookieNotice />

    </div>
  );
}
