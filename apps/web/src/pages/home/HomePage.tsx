import { AnimatedHeading } from '../../components/public/AnimatedHeading.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import LolasChat from '../../components/chat/LolasChat.js';
import { SEO } from '../../components/seo/SEO.js';
import SectionDivider from '../../components/home/SectionDivider.js';
import { FleetPreviewSection } from '../../components/home/FleetPreviewSection.js';
import TiltedCard from '../../components/home/TiltedCard.js';
import iconCommunity from '../../assets/Hand on Heart.svg';
import iconPeaceOfMind from '../../assets/Home/Peace of Mind.svg';
import iconHelmet from '../../assets/Home/Helmet Icon.svg';
import iconFuel from '../../assets/Home/Fuel Icon.svg';
import iconPawCard from '../../assets/Home/Paw Card Icon.svg';
import iconCoat from '../../assets/Home/Coat Icon.svg';
import iconFirstAid from '../../assets/Home/First Aid Icon.svg';
import iconRepairKit from '../../assets/Home/Repair Kit Icon.svg';
import iconPhoneMount from '../../assets/Home/Phone Mount Icon.svg';
import iconCloth from '../../assets/Home/Cloth Icon.svg';
import iconDryBag from '../../assets/Home/Dry Bag Icon.svg';
import iconLesson from '../../assets/Home/Lesson Icon.svg';
import iconCrashGuard from '../../assets/Home/Crash Guard Icon.svg';
import iconSurfRack from '../../assets/Home/Surf Rack Icon.svg';
import iconBungee from '../../assets/Home/Bungee Cord Icon.svg';
import iconDelivery from '../../assets/Home/Delivery Collection Icon.svg';
import iconNinePm from '../../assets/Home/9PM Return Icon.svg';
import { PawCardCallout } from '../../components/home/PawCardCallout.js';
import { ReviewsSection } from '../../components/home/ReviewsSection.js';
import Stack from '../../components/home/Stack.js';
import CountUp from '../../components/home/CountUp.js';
import BePawsitiveMeter from '../../components/home/BePawsitiveMeter.js';
import Stepper, { Step } from '../../components/home/Stepper.js';
import stepIcon1 from '../../assets/Step_1_How_Paw_Card_Works_-_Paw_Card_Icon.svg';
import stepIcon2 from '../../assets/Step_2_How_Paw_Card_Works_-_Store_Icon.svg';
import stepIcon3 from '../../assets/Step_3_How_Paw_Card_Works_Calculator_Icon.svg';
import stepIcon4 from '../../assets/Step_4_How_Paw_Card_Works_-_Lola_Cartoon_Icon.svg';
import bepawsitiveLogo from '../../assets/Be Pawsitive (blue).svg';
import pawDivider from '../../assets/Paw Divider.svg';
import pesoSignMark from '../../assets/Peso Sign.svg';
import lolasLogo from '../../assets/Lolas Original Logo.svg';
import { CloudinaryImage } from '../../components/ui/CloudinaryImage.js';
import { PesoSign } from '../../components/ui/PesoSign.js';
import { normalizeApiBase } from '../../api/normalize-api-base.js';

const BE_PAW_PUBLIC_IDS = [
  '1_q903kw', '2_ppjkhm', '3_hgnjpm', '4_fpx4je', '5_ittwb7', '6_klj8zq',
  '7_rcpxhw', '8_d5zxti', '9_q80ncx', '10_vhulyr', '11_ymbnen', '12_xlgwhy',
  '13_gugu92', '14_svkea8', '15_ussejg', '16_i5tjci', '17_jyquip', '18_cxkofj',
  '19_k8a2dm', '20_vzajao', '21_qr7rd7', '22_amab1z', '23_dvvjgq', '24_fd47tv',
  '25_acqfde', '26_pamvyd', '27_p9c1yg', '28_dm49i6', '29_b15s72', '30_smef1w',
  '31_vzjory', '32_k4iacn',
];
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { capturePartnerRefFromUrl } from '../../utils/partnerRef.js';
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import flowerLeft from '../../assets/Hero/flower-left.svg';
import flowerRight from '../../assets/Hero/flower-right.svg';
import cloud1 from '../../assets/Hero/cloud-left-to-right-1.svg';
import cloud2 from '../../assets/Hero/cloud-left-to-right-2.svg';
import cloud3 from '../../assets/Hero/cloud-left-to-right-3.svg';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

/** Same sand as `sand-brand` in tailwind.config — inlined here so hero matches section bands without class/CSS drift. */
const HOME_SAND = '#f1e6d6';

/** Google knowledge panel / reviews entry point for Lola's Rentals (opens in new tab from hero trust pill). */
const LOLAS_GOOGLE_REVIEWS_URL =
  'https://www.google.com/search?gs_ssp=eJzj4tVP1zc0LLbMsiyIzyszYLRSNagwNjYwMbA0MDCzTDFJTjJJsTKoMLFINLBINTO3NLQwNbE0T_LizcnPSSxWKErNK0nMKQYAj74TwQ&q=lolas+rentals&rlz=1C1VDKB_en-GBGB1005GB1005&oq=&gs_lcrp=EgZjaHJvbWUqDwgAEC4YJxivARjHARjqAjIPCAAQLhgnGK8BGMcBGOoCMgkIARAjGCcY6gIyCQgCECMYJxjqAjIJCAMQIxgnGOoCMgkIBBAjGCcY6gIyCQgFECMYJxjqAjIJCAYQRRg7GMIDMgkIBxBFGDsYwgPSAQg3OTJqMGoxNagCCLACAfEFJ5Hm-gIi2tLxBSeR5voCItrS&sourceid=chrome&ie=UTF-8';

function HeroSection() {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = !prefersReducedMotion;
  const isTouchDevice = useIsTouchDevice();
  const heroRef = useRef<HTMLElement>(null);

  // ── Live order count (matches DB total; rounds display by 25; poll refreshes) ──
  const ORDER_COUNT_FLOOR = 6300;
  const DISPLAY_ROUND_STEP = 25;
  const ORDER_COUNT_POLL_MS = 2 * 60 * 1000;
  const [totalOrders, setTotalOrders] = useState<number>(ORDER_COUNT_FLOOR);

  const fetchOrderCount = useCallback(() => {
    const apiBase = normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);
    fetch(`${apiBase}/public/stats/order-count`)
      .then((r) => r.json())
      .then((json) => {
        const count = json?.data?.totalOrders;
        if (typeof count === 'number' && !Number.isNaN(count) && count >= 0) {
          setTotalOrders(Math.max(ORDER_COUNT_FLOOR, count));
        }
      })
      .catch(() => { /* keep last value */ });
  }, []);

  useEffect(() => {
    fetchOrderCount();
    const id = setInterval(fetchOrderCount, ORDER_COUNT_POLL_MS);
    return () => clearInterval(id);
  }, [fetchOrderCount]);

  const roundedCustomers = Math.floor(totalOrders / DISPLAY_ROUND_STEP) * DISPLAY_ROUND_STEP;
  const countUpFrom = Math.max(
    ORDER_COUNT_FLOOR - 10 * DISPLAY_ROUND_STEP,
    roundedCustomers - 10 * DISPLAY_ROUND_STEP,
  );

  // ── Per-cloud independent motion values ──────────────────
  // Each cloud has its own raw input and spring config so they
  // respond at different speeds and feel physically separate.

  // Cloud 1 — slowest, heaviest, moves most
  const c1MouseX = useMotionValue(0.5);
  const c1MouseY = useMotionValue(0.5);
  const c1X = useSpring(useTransform(c1MouseX, [0, 1], [-70, 70]), { stiffness: 25, damping: 20, mass: 2.0 });
  const c1Y = useSpring(useTransform(c1MouseY, [0, 1], [-35, 35]), { stiffness: 25, damping: 20, mass: 2.0 });

  // Cloud 2 — medium speed
  const c2MouseX = useMotionValue(0.5);
  const c2MouseY = useMotionValue(0.5);
  const c2X = useSpring(useTransform(c2MouseX, [0, 1], [-45, 45]), { stiffness: 35, damping: 15, mass: 1.5 });
  const c2Y = useSpring(useTransform(c2MouseY, [0, 1], [-22, 22]), { stiffness: 35, damping: 15, mass: 1.5 });

  // Cloud 3 — lighter, snappier
  const c3MouseX = useMotionValue(0.5);
  const c3MouseY = useMotionValue(0.5);
  const c3X = useSpring(useTransform(c3MouseX, [0, 1], [-30, 30]), { stiffness: 50, damping: 12, mass: 1.0 });
  const c3Y = useSpring(useTransform(c3MouseY, [0, 1], [-15, 15]), { stiffness: 50, damping: 12, mass: 1.0 });

  // Cloud 4 — very slow and dreamy
  const c4MouseX = useMotionValue(0.5);
  const c4MouseY = useMotionValue(0.5);
  const c4X = useSpring(useTransform(c4MouseX, [0, 1], [-60, 60]), { stiffness: 20, damping: 25, mass: 2.5 });
  const c4Y = useSpring(useTransform(c4MouseY, [0, 1], [-30, 30]), { stiffness: 20, damping: 25, mass: 2.5 });

  // Cloud 5 — medium-fast
  const c5MouseX = useMotionValue(0.5);
  const c5MouseY = useMotionValue(0.5);
  const c5X = useSpring(useTransform(c5MouseX, [0, 1], [-40, 40]), { stiffness: 40, damping: 14, mass: 1.2 });
  const c5Y = useSpring(useTransform(c5MouseY, [0, 1], [-20, 20]), { stiffness: 40, damping: 14, mass: 1.2 });

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    c1MouseX.set(x); c1MouseY.set(y);
    c2MouseX.set(x); c2MouseY.set(y);
    c3MouseX.set(x); c3MouseY.set(y);
    c4MouseX.set(x); c4MouseY.set(y);
    c5MouseX.set(x); c5MouseY.set(y);
  };

  const handleMouseLeave = () => {
    c1MouseX.set(0.5); c1MouseY.set(0.5);
    c2MouseX.set(0.5); c2MouseY.set(0.5);
    c3MouseX.set(0.5); c3MouseY.set(0.5);
    c4MouseX.set(0.5); c4MouseY.set(0.5);
    c5MouseX.set(0.5); c5MouseY.set(0.5);
  };

  // Whether to apply parallax on this device
  const useParallax = shouldAnimate && !isTouchDevice;

  // ── Responsive flower sizing ──────────────────────────────
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isTablet = windowWidth < 1024 && windowWidth >= 640;
  const isMobileFlower = windowWidth < 640;
  /** Narrow hero (phone + tablet): cloud behind “Many” + looser horizontal overflow */
  const isCompactHero = windowWidth < 1024;

  const flowerWidthBase = Math.round(
    (isMobileFlower ? 160 : isTablet ? 260 : 420) * 0.9,
  );
  /** Left flower only: 20% smaller than the shared base */
  const flowerWidthLeft = Math.round(flowerWidthBase * 0.8);
  const flowerWidthRight = flowerWidthBase;
  const flowerBottom = isMobileFlower || isTablet ? -40 : -80;
  const flowerOffset = isMobileFlower || isTablet ? -20 : -40;

  return (
    <section
      ref={heroRef}
      className="relative z-10 overflow-visible"
      style={{ minHeight: '560px', height: '70vh', backgroundColor: HOME_SAND }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Flower Left — float like clouds; x stays negative so it never drifts inward off the edge ── */}
      <motion.div
        className="pointer-events-none absolute z-[1]"
        style={{ left: flowerOffset, bottom: flowerBottom }}
        animate={
          shouldAnimate
            ? {
                x: [0, -12, 0],
                y: [0, -8, 0],
              }
            : {}
        }
        transition={{
          x: { duration: 14, repeat: Infinity, ease: 'linear' },
          y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <motion.img
          src={flowerLeft}
          alt=""
          aria-hidden="true"
          style={{ width: flowerWidthLeft, display: 'block' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
      </motion.div>

      {/* ── Flower Right — same cloud-style float; x stays positive so it drifts toward the outer edge, not inward ── */}
      <motion.div
        className="pointer-events-none absolute z-[1]"
        style={{ right: flowerOffset, bottom: flowerBottom }}
        animate={
          shouldAnimate
            ? {
                x: [0, 10, 0],
                y: [0, -5, 0],
              }
            : {}
        }
        transition={{
          x: { duration: 11, repeat: Infinity, ease: 'linear' },
          y: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <motion.img
          src={flowerRight}
          alt=""
          aria-hidden="true"
          style={{ width: flowerWidthRight, display: 'block' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
      </motion.div>

      {/* ── Cloud 1 — large, slow drift + slow float ──────────── */}
      <motion.div
        style={{ position: 'absolute', top: '10%', left: '6%' }}
        animate={
          shouldAnimate
            ? isTouchDevice
              ? { x: [0, 15, 0, -15, 0], y: [0, -8, 0, 8, 0] }
              : { x: [0, 18, 0], y: [0, -8, 0] }
            : {}
        }
        transition={
          isTouchDevice
            ? { duration: 12, repeat: Infinity, ease: 'easeInOut' }
            : {
                x: { duration: 14, repeat: Infinity, ease: 'linear' },
                y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
              }
        }
      >
        <motion.img
          src={cloud1}
          alt=""
          aria-hidden="true"
          style={{
            width: 150,
            pointerEvents: 'none',
            ...(useParallax ? { x: c1X, y: c1Y } : {}),
          }}
        />
      </motion.div>

      {/* ── Cloud 2 — small, right side, gentle float ─────────── */}
      <motion.div
        style={{ position: 'absolute', top: '8%', right: '10%' }}
        animate={
          shouldAnimate
            ? isTouchDevice
              ? { x: [0, -12, 0, 12, 0], y: [0, 6, 0, -6, 0] }
              : { x: [0, -14, 0], y: [0, -5, 0] }
            : {}
        }
        transition={
          isTouchDevice
            ? { duration: 9, repeat: Infinity, ease: 'easeInOut' }
            : {
                x: { duration: 11, repeat: Infinity, ease: 'linear' },
                y: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
              }
        }
      >
        <motion.img
          src={cloud3}
          alt=""
          aria-hidden="true"
          style={{
            width: 75,
            pointerEvents: 'none',
            ...(useParallax ? { x: c2X, y: c2Y } : {}),
          }}
        />
      </motion.div>

      {/* ── Cloud 3 — medium, centre-top (shift right on narrow so it sits behind “Many” & can bleed off-edge) ───────── */}
      <motion.div
        style={{
          position: 'absolute',
          top: isCompactHero ? '4%' : '6%',
          left: isCompactHero ? '58%' : '42%',
        }}
        animate={
          shouldAnimate
            ? isTouchDevice
              ? { x: [0, 10, 0, -10, 0], y: [0, -10, 0, 10, 0] }
              : { x: [0, 10, 0], y: [0, -10, 0] }
            : {}
        }
        transition={
          isTouchDevice
            ? { duration: 14, repeat: Infinity, ease: 'easeInOut' }
            : {
                x: { duration: 17, repeat: Infinity, ease: 'linear' },
                y: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
              }
        }
      >
        <motion.img
          src={cloud2}
          alt=""
          aria-hidden="true"
          style={{
            width: isCompactHero ? 132 : 110,
            marginLeft: isCompactHero ? '8%' : 0,
            pointerEvents: 'none',
            ...(useParallax ? { x: c3X, y: c3Y } : {}),
          }}
        />
      </motion.div>

      {/* ── Cloud 4 — tiny, lower-left, dreamy float ─────────── */}
      <motion.div
        style={{ position: 'absolute', top: '40%', left: '22%' }}
        animate={
          shouldAnimate
            ? isTouchDevice
              ? { x: [0, -18, 0, 18, 0], y: [0, 7, 0, -7, 0] }
              : { x: [0, 14, 0], y: [0, -6, 0] }
            : {}
        }
        transition={
          isTouchDevice
            ? { duration: 11, repeat: Infinity, ease: 'easeInOut' }
            : {
                x: { duration: 19, repeat: Infinity, ease: 'linear' },
                y: { duration: 9, repeat: Infinity, ease: 'easeInOut' },
              }
        }
      >
        <motion.img
          src={cloud1}
          alt=""
          aria-hidden="true"
          style={{
            width: 55,
            pointerEvents: 'none',
            ...(useParallax ? { x: c4X, y: c4Y } : {}),
          }}
        />
      </motion.div>

      {/* ── Cloud 5 — medium-small, right mid, moderate float ── */}
      <motion.div
        style={{ position: 'absolute', top: '18%', right: '28%' }}
        animate={
          shouldAnimate
            ? isTouchDevice
              ? { x: [0, 14, 0, -14, 0], y: [0, -5, 0, 5, 0] }
              : { x: [0, -10, 0], y: [0, -7, 0] }
            : {}
        }
        transition={
          isTouchDevice
            ? { duration: 16, repeat: Infinity, ease: 'easeInOut' }
            : {
                x: { duration: 13, repeat: Infinity, ease: 'linear' },
                y: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
              }
        }
      >
        <motion.img
          src={cloud3}
          alt=""
          aria-hidden="true"
          style={{
            width: 95,
            pointerEvents: 'none',
            ...(useParallax ? { x: c5X, y: c5Y } : {}),
          }}
        />
      </motion.div>

      {/* ── Hero content ─────────────────────────────────────── */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 pb-20 pt-20 text-center">
        {/* Headline */}
        <h1
          className="font-headline font-extrabold"
          style={{
            fontSize: 'clamp(36px, 5vw, 52px)',
            textAlign: 'center',
            lineHeight: 1.15,
            marginBottom: 24,
          }}
          aria-label="Siargao Scooter & TukTuk Rentals Without The Sketchy Experience"
        >
          <AnimatedHeading
            text="Siargao Scooter & TukTuk Rentals"
            tag="span"
            className="block text-teal-brand"
            delay={20}
          />
          <AnimatedHeading
            text="Without The Sketchy Experience"
            tag="span"
            className="block italic font-extrabold text-gold-brand"
            delay={20}
          />
        </h1>

        {/* Subheadline */}
        <motion.p
          className="font-lato"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.5 }}
          style={{
            fontSize: 18,
            color: '#363737',
            textAlign: 'center',
            maxWidth: 560,
            lineHeight: 1.6,
            margin: '0 auto 24px',
          }}
        >
          Safe bikes. Transparent pricing. No funny business.
        </motion.p>

        {/* Trust — review count + Google */}
        <motion.div
          className="font-lato"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.58 }}
          style={{
            marginBottom: 28,
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <a
            href={LOLAS_GOOGLE_REVIEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full flex-col items-center gap-1.5 rounded-full border border-charcoal-brand/10 bg-white/70 px-4 py-2 shadow-[0_4px_20px_rgba(54,55,55,0.06)] backdrop-blur-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(54,55,55,0.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-brand sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5 sm:px-5 sm:py-3"
            aria-label={`${roundedCustomers.toLocaleString()}+  explorers — 5.0 on Google Reviews (opens in new tab)`}
          >
            <div className="flex w-full max-w-full items-center justify-center gap-x-2.5 sm:contents">
              <p
                className="min-w-0 shrink text-center text-xs leading-tight text-charcoal-brand sm:shrink-0 sm:text-left sm:text-sm"
                style={{ margin: 0 }}
              >
                <span className="font-extrabold text-teal-brand" aria-hidden="true">
                  <CountUp
                    key={roundedCustomers}
                    to={roundedCustomers}
                    from={countUpFrom}
                    duration={2.2}
                    delay={0.7}
                    separator=","
                    className="font-extrabold text-teal-brand"
                  />+
                </span>
                <span className="font-medium"> explorers</span>
              </p>
              <div
                className="flex shrink-0 items-center gap-0.5 px-0 sm:border-x sm:border-charcoal-brand/10 sm:px-3"
                aria-hidden="true"
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <svg
                    key={i}
                    width={15}
                    height={15}
                    viewBox="0 0 24 24"
                    fill="#FCBC5A"
                    className="sm:h-[18px] sm:w-[18px]"
                  >
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                ))}
              </div>
            </div>
            <p
              className="w-full shrink-0 whitespace-nowrap text-center text-xs font-medium leading-tight text-charcoal-brand sm:w-auto sm:text-left sm:text-sm"
              style={{ margin: 0 }}
            >
              <span className="font-extrabold text-teal-brand">5.0</span>
              <span className="text-charcoal-brand/40" aria-hidden="true">
                {' '}
                ·{' '}
              </span>
              Google Reviews
            </p>
          </a>
        </motion.div>

        {/* CTA + urgency — single pulse so button and line stay in sync */}
        <motion.div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            willChange: 'transform',
          }}
          initial={{ scale: 1 }}
          animate={shouldAnimate ? { scale: [1, 1.022] } : { scale: 1 }}
          transition={{
            delay: prefersReducedMotion ? 0 : 1.35,
            duration: 3,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: [0.45, 0, 0.55, 1],
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.7 }}
            style={{ display: 'inline-block', transform: 'skewX(-4deg)' }}
          >
            <motion.div
              whileHover={shouldAnimate ? { x: -2, y: -2 } : {}}
              whileTap={shouldAnimate ? { scale: 0.97 } : {}}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ display: 'inline-block' }}
            >
              <Link
                to="/book/reserve"
                className="inline-block rounded-[6px] border-2 border-charcoal-brand bg-gold-brand px-12 py-4 font-lato text-sm font-extrabold uppercase tracking-[0.05em] text-charcoal-brand transition-shadow duration-150"
                style={{ boxShadow: '4px 4px 0 #363737' }}
                onMouseEnter={(e) => {
                  if (!prefersReducedMotion) {
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow = '6px 6px 0 #363737';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow = '4px 4px 0 #363737';
                }}
              >
                <span style={{ display: 'inline-block', transform: 'skewX(4deg)' }}>
                  Book Your Ride
                </span>
              </Link>
            </motion.div>
          </motion.div>

          <motion.p
            className="font-lato"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: prefersReducedMotion ? 0 : 0.82 }}
            style={{
              marginTop: 14,
              marginBottom: 0,
              paddingLeft: 16,
              paddingRight: 16,
              fontSize: 'clamp(11px, 3.2vw, 14px)',
              lineHeight: 1.45,
              fontWeight: 600,
              color: '#363737',
              textAlign: 'center',
            }}
          >
            <span className="inline-block whitespace-nowrap">
              Vehicles fill up fast in peak season -{' '}
              <span className="font-extrabold text-teal-brand">secure yours now</span>
            </span>
          </motion.p>
        </motion.div>

        {/* Scroll-down arrow */}
        <motion.button
          onClick={() => window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' })}
          aria-label="Scroll down"
          animate={shouldAnimate ? { y: [0, 8, 0] } : {}}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.92 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            marginTop: 40,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#00577C',
            opacity: 0.7,
            padding: 0,
          }}
        >
          <span className="font-lato" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Scroll
          </span>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </motion.button>
      </div>

    </section>
  );
}


const PAW_CARD_STEPPER_STEPS = 4;

export default function HomePage() {
  const [pawCardStep, setPawCardStep] = useState(1);
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useIsMobile();

  useEffect(() => { capturePartnerRefFromUrl(); }, []);

  const inclusionListVariants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.09,
        delayChildren: prefersReducedMotion ? 0 : 0.05,
      },
    },
  };

  const inclusionCardVariants = {
    hidden: { opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: prefersReducedMotion ? 0 : 0.44, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    },
  };

  const inclusionCardHover = prefersReducedMotion
    ? undefined
    : {
        y: -4,
        boxShadow: '0 14px 32px rgba(54, 55, 55, 0.11)',
        transition: { duration: 0.22, ease: 'easeOut' as const },
      };

  /** Per-card fade-up as each box enters the viewport (single-column mobile). */
  const inclusionCardScrollUp = {
    initial: { opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.32, margin: '0px 0px -6% 0px' },
    transition: {
      duration: prefersReducedMotion ? 0 : 0.5,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  };

  const inclusionGridMotionProps = isMobile
    ? {}
    : {
        variants: inclusionListVariants,
        initial: 'hidden' as const,
        whileInView: 'show' as const,
        viewport: { once: true, amount: 0.12, margin: '0px 0px -10% 0px' },
      };

  return (
    <PageLayout
      title="Lola's Rentals — Siargao Island"
      showFloralLeft={false}
      showFloralRight={false}
      fullBleed
    >
      <SEO
        title="Siargao Scooter, Motorbike & Tuktuk Rental | Lola's Rentals"
        description="Rent scooters, motorbikes, tuktuks and tricycles on Siargao Island. Honda Beat, Honda Click and more. Easy online booking, free helmet included. Based in General Luna."
        canonical="/book"
        schema={{
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Lola's Rentals & Tours Inc.",
          "description": "Scooter, motorbike, tuktuk and tricycle rental on Siargao Island, Philippines. Airport transfers from Sayak Airport.",
          "url": "https://lolasrentals.com",
          "telephone": "+639694443413",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Tourism Rd, Catangnan",
            "addressLocality": "General Luna",
            "addressRegion": "Surigao del Norte",
            "postalCode": "8419",
            "addressCountry": "PH"
          },
          "geo": {
            "@type": "GeoCoordinates",
            "latitude": 9.8283,
            "longitude": 126.1775
          },
          "openingHours": "Mo-Su 07:00-19:00",
          "priceRange": "₱₱",
          "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Vehicle Rentals",
            "itemListElement": [
              { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Scooter Rental Siargao" } },
              { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Motorbike Rental Siargao" } },
              { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Tuktuk Rental Siargao" } },
              { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Tricycle Rental Siargao" } },
              { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Airport Transfer Siargao" } }
            ]
          },
          "sameAs": [
            "https://www.facebook.com/lolasrentalssiargao",
            "https://www.instagram.com/lolasrentals"
          ]
        }}
      />
      <HeroSection />

      <div
        className="max-lg:-mb-4 lg:-mb-[60px]"
        style={{
          marginTop: -4,
          transform: 'rotate(10deg)',
          transformOrigin: 'center',
          width: '120%',
          marginLeft: '-10%',
          overflow: 'hidden',
        }}
      >
        <SectionDivider variant="dash" />
      </div>

      <FadeUpSection>
        <section
          style={{
            backgroundColor: HOME_SAND,
            padding: '64px 5%',
          }}
        >
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <p
              className="font-lato"
              style={{
                textAlign: 'center',
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#00577C',
                marginBottom: 12,
                fontWeight: 700,
              }}
            >
              Why Lola&apos;s
            </p>
            <h2
              className="font-headline font-bold"
              style={{
                textAlign: 'center',
                fontSize: 'clamp(32px, 5vw, 42px)',
                color: '#363737',
                marginBottom: 56,
                lineHeight: 1.2,
              }}
            >
              Why Choose Us?
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 24,
              }}
            >
              <TiltedCard
                icon={iconPawCard}
                title="More Than Just a Rental"
                cornerBadge={
                  <span
                    aria-label="Over five thousand pesos in included perks and partner savings"
                    className="font-lato inline-flex items-center gap-0.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold leading-tight shadow-md sm:text-xs"
                    style={{
                      background: 'linear-gradient(145deg, #FFE8BC 0%, #FCBC5A 45%, #E8A23A 100%)',
                      color: '#063d52',
                      boxShadow:
                        '0 4px 14px rgba(252,188,90,0.4), 0 1px 0 rgba(255,255,255,0.55) inset',
                      border: '1px solid rgba(0, 87, 124, 0.14)',
                    }}
                  >
                    <PesoSign style={{ height: '0.92em', color: '#00577C' }} />
                    <span className="tabular-nums tracking-tight">5000+</span>
                    <span className="font-bold"> in perks</span>
                  </span>
                }
                body="Every booking comes loaded with inclusions — helmet, rain gear, first aid kit and more. Plus our Paw Card unlocks exclusive discounts at 70+ island establishments."
              />
              <TiltedCard
                icon={iconPeaceOfMind}
                title="Always Ready for You"
                body="Our fleet is regularly serviced and safety checked. And if anything comes up during your rental, our team is always reachable and responsive — we've got you covered."
              />
              <TiltedCard
                icon={iconCommunity}
                title="Rooted in Community"
                body={
                  <>
                    Every rental directly funds spay, neuter and vaccination clinics for Siargao&apos;s street animals
                    through our{' '}
                    <Link
                      to="/book/bepawsitive"
                      className="font-semibold text-[#00577C] underline decoration-[#00577C]/35 underline-offset-2 transition-colors hover:text-teal-brand hover:decoration-teal-brand/50"
                    >
                      Be Pawsitive
                    </Link>{' '}
                    partnership. We&apos;re not just a rental — we&apos;re part of the island.
                  </>
                }
              />
            </div>
          </div>
        </section>
      </FadeUpSection>

      <div style={{ marginTop: -2, marginBottom: -2 }}>
        <SectionDivider variant="bold" />
      </div>

      <FadeUpSection>
        <section style={{ backgroundColor: HOME_SAND, padding: '64px 5%' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <p
              className="font-lato"
              style={{
                textAlign: 'center',
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#00577C',
                marginBottom: 12,
                fontWeight: 700,
              }}
            >
              What&apos;s Included
            </p>
            <h2
              className="font-headline font-bold"
              style={{
                textAlign: 'center',
                fontSize: 'clamp(28px, 4vw, 38px)',
                color: '#363737',
                lineHeight: 1.2,
                maxWidth: 540,
                margin: '0 auto 56px',
              }}
            >
              Everything You Need For A Safe, Hassle-Free Ride
            </h2>

            <motion.div
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
              {...inclusionGridMotionProps}
            >

              {/* ── Safety — teal-brand #00577C ── */}
              <motion.div
                {...(isMobile ? inclusionCardScrollUp : { variants: inclusionCardVariants })}
                className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition-shadow duration-300 ease-out"
                style={{ borderTop: '4px solid #00577C' }}
                whileHover={inclusionCardHover}
              >
                <span className="mb-5 inline-flex items-center gap-1.5 font-lato text-[10px] font-bold uppercase tracking-widest" style={{ color: '#00577C' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3.5" stroke="#00577C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Safety
                </span>
                <ul className="flex-1 space-y-3">
                  {[
                    { icon: iconHelmet,     label: 'Helmet' },
                    { icon: iconFirstAid,   label: 'First Aid Kit' },
                    { icon: iconCrashGuard, label: 'Crash Armour' },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: '#E8F3F8' }}>
                        <img src={item.icon} alt="" className="mix-blend-multiply" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                      </div>
                      <span className="font-lato text-sm font-medium" style={{ color: '#363737' }}>{item.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 font-lato text-xs leading-relaxed" style={{ color: '#363737', opacity: 0.55 }}>
                  You&apos;re protected before you even start the engine.
                </p>
              </motion.div>

              {/* ── Convenience — gold-brand #FCBC5A ── */}
              <motion.div
                {...(isMobile ? inclusionCardScrollUp : { variants: inclusionCardVariants })}
                className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition-shadow duration-300 ease-out"
                style={{ borderTop: '4px solid #FCBC5A' }}
                whileHover={inclusionCardHover}
              >
                <span className="mb-5 inline-flex items-center gap-1.5 font-lato text-[10px] font-bold uppercase tracking-widest" style={{ color: '#c8672a' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="4.5" stroke="#c8672a" strokeWidth="1.6"/><path d="M6 3.5v2.75l1.5 1" stroke="#c8672a" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Convenience
                </span>
                <ul className="flex-1 space-y-3">
                  {[
                    { icon: iconPhoneMount, label: 'Phone Mount' },
                    { icon: iconFuel,       label: 'Full Tank' },
                    { icon: iconCoat,       label: 'Rain Coat' },
                    { icon: iconCloth,      label: 'Seat Cloth' },
                    { icon: iconDryBag,     label: '5L Dry Bag' },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: '#FEF6E7' }}>
                        <img src={item.icon} alt="" className="mix-blend-multiply" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                      </div>
                      <span className="font-lato text-sm font-medium" style={{ color: '#363737' }}>{item.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 font-lato text-xs leading-relaxed" style={{ color: '#363737', opacity: 0.55 }}>
                  Everything pre-sorted so you can just go.
                </p>
              </motion.div>

              {/* ── Backup — brand-500 #d68035 ── */}
              <motion.div
                {...(isMobile ? inclusionCardScrollUp : { variants: inclusionCardVariants })}
                className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition-shadow duration-300 ease-out"
                style={{ borderTop: '4px solid #d68035' }}
                whileHover={inclusionCardHover}
              >
                <span className="mb-5 inline-flex items-center gap-1.5 font-lato text-[10px] font-bold uppercase tracking-widest" style={{ color: '#d68035' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 1.5C4 1.5 2.5 3 2.5 5c0 2.5 3.5 5.5 3.5 5.5S9.5 7.5 9.5 5c0-2-1.5-3.5-3.5-3.5z" stroke="#d68035" strokeWidth="1.4" strokeLinejoin="round"/></svg>
                  Backup
                </span>
                <ul className="flex-1 space-y-3">
                  {[
                    { icon: iconRepairKit,   label: 'Puncture Kit' },
                    { icon: iconPeaceOfMind, label: 'Damage Cover' },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: '#FDF1E4' }}>
                        <img src={item.icon} alt="" className="mix-blend-multiply" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                      </div>
                      <span className="font-lato text-sm font-medium" style={{ color: '#363737' }}>{item.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 font-lato text-xs leading-relaxed" style={{ color: '#363737', opacity: 0.55 }}>
                  If something goes wrong, we&apos;re always reachable.
                </p>
              </motion.div>

              {/* ── And More — charcoal-brand #363737 ── */}
              <motion.div
                {...(isMobile ? inclusionCardScrollUp : { variants: inclusionCardVariants })}
                className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition-shadow duration-300 ease-out"
                style={{ borderTop: '4px solid #363737' }}
                whileHover={inclusionCardHover}
              >
                <span className="mb-5 inline-flex items-center gap-1.5 font-lato text-[10px] font-bold uppercase tracking-widest" style={{ color: '#363737' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="2" cy="6" r="1.2" fill="#363737"/><circle cx="6" cy="6" r="1.2" fill="#363737"/><circle cx="10" cy="6" r="1.2" fill="#363737"/></svg>
                  And More
                </span>
                <ul className="flex-1 space-y-3">
                  {[
                    { icon: iconPawCard, label: 'Paw Card' },
                    { icon: iconLesson,  label: 'Riding Lesson' },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: '#F0F0F0' }}>
                        <img src={item.icon} alt="" className="mix-blend-multiply" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                      </div>
                      <span className="font-lato text-sm font-medium" style={{ color: '#363737' }}>{item.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 font-lato text-xs leading-relaxed" style={{ color: '#363737', opacity: 0.55 }}>
                  Little things that make a big difference.
                </p>
              </motion.div>

              {/* ── Add-ons — brand-600 #c8672a (dashed, optional) ── */}
              <motion.div
                {...(isMobile ? inclusionCardScrollUp : { variants: inclusionCardVariants })}
                className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition-shadow duration-300 ease-out"
                style={{ borderTop: '4px dashed #c8672a' }}
                whileHover={inclusionCardHover}
              >
                <span className="mb-5 inline-flex items-center gap-1.5 font-lato text-[10px] font-bold uppercase tracking-widest" style={{ color: '#c8672a' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2v8M2 6h8" stroke="#c8672a" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  Add-ons
                </span>
                <ul className="flex-1 space-y-3">
                  {[
                    { icon: iconSurfRack, label: 'Surf Rack' },
                    { icon: iconBungee,   label: 'Bungee Cord' },
                    { icon: iconDelivery, label: 'Delivery' },
                    { icon: iconNinePm,   label: 'Late Return' },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: '#FCF0E8' }}>
                        <img src={item.icon} alt="" className="mix-blend-multiply" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                      </div>
                      <span className="font-lato text-sm font-medium" style={{ color: '#363737' }}>{item.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 font-lato text-xs leading-relaxed" style={{ color: '#363737', opacity: 0.55 }}>
                  Add what you need at checkout.
                </p>
              </motion.div>

            </motion.div>
          </div>
        </section>
      </FadeUpSection>

      <div style={{ marginTop: -2, marginBottom: -2 }}>
        <SectionDivider variant="bold" />
      </div>

      <FadeUpSection>
        <FleetPreviewSection />
      </FadeUpSection>

      <div style={{ marginTop: -2, marginBottom: -2 }}>
        <SectionDivider variant="bold" flip />
      </div>

      <section style={{ backgroundColor: HOME_SAND, padding: '64px 5%' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>

          {/* ── Full-width logo lockup (stacked × under Lola on narrow screens) ── */}
          <div className="mb-12 flex flex-col items-center justify-center gap-1 lg:flex-row lg:gap-5">
            <div className="flex flex-col items-center gap-1">
              <img src={lolasLogo} alt="Lola's Rentals" style={{ height: 68, width: 'auto' }} />
              <span
                className="leading-none lg:hidden"
                style={{ fontSize: 26, fontWeight: 800, color: '#363737', opacity: 0.4, fontFamily: 'Lato, sans-serif' }}
              >
                ×
              </span>
            </div>
            <span
              className="hidden leading-none lg:inline"
              style={{ fontSize: 26, fontWeight: 800, color: '#363737', opacity: 0.4, fontFamily: 'Lato, sans-serif' }}
            >
              ×
            </span>
            <img src={bepawsitiveLogo} alt="Be Pawsitive" style={{ height: 76, width: 'auto' }} />
          </div>

          {/* ── Two-column: photos | counter + text ── */}
          <div
            className="isolate"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 64,
              alignItems: 'center',
              marginBottom: 48,
            }}
          >
            {/* LEFT — Stack card gallery, centred */}
            <div
              className="relative z-0 max-lg:mb-4"
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              <div style={{ width: 340, height: 460 }}>
                <Stack
                  randomRotation={true}
                  sensitivity={200}
                  sendToBackOnClick={true}
                  cards={BE_PAW_PUBLIC_IDS.map((id, i) => (
                    <CloudinaryImage
                      key={i}
                      publicId={id}
                      alt={`Be Pawsitive animal ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ))}
                  autoplay={true}
                  autoplayDelay={2500}
                  pauseOnHover={true}
                  showDots={false}
                  showHint={true}
                />
              </div>
            </div>

            {/* RIGHT — Counter + divider + text + CTA (z-index keeps caption above stack overflow on narrow layouts) */}
            <div
              className="relative z-10"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
            >
              {/* Counter */}
              <div className="w-full max-w-[min(100%,380px)]" style={{ marginBottom: 4 }}>
                <div className="count-up-text inline-flex flex-wrap items-baseline justify-center gap-x-[0.28em]">
                  <img
                    src={pesoSignMark}
                    alt=""
                    className="be-pawsitive-meter-peso"
                    aria-hidden
                  />
                  <BePawsitiveMeter />
                </div>
                <p
                  className="font-lato relative z-[2] mx-auto mt-2 block w-full max-w-[min(100%,360px)] px-2 text-[13px] leading-snug"
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: '#00577C',
                    fontWeight: 700,
                  }}
                >
                  Total Donated Since Oct 2022
                </p>
              </div>

              {/* Paw divider */}
              <div style={{ margin: '20px 0', width: '100%', display: 'flex', justifyContent: 'center' }}>
                <img src={pawDivider} alt="" style={{ width: '100%', maxWidth: 320, height: 'auto', opacity: 0.5 }} />
              </div>

              {/* Body text */}
              <p className="font-lato" style={{ fontSize: 16, color: '#363737', lineHeight: 1.7, marginBottom: 12, opacity: 0.8, maxWidth: 380 }}>
                Every rental directly funds spay, neuter and vaccination clinics
                for Siargao&apos;s street animals through our Be Pawsitive partnership.
              </p>
              <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.7, opacity: 0.65, marginBottom: 28, maxWidth: 380 }}>
                It costs just <PesoSign />800 to spay or neuter a stray. Every booking makes a difference.
              </p>

              {/* CTA */}
              <a
                href="https://www.facebook.com/bepawsitiveph"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '14px 36px',
                  backgroundColor: '#FCBC5A',
                  color: '#363737',
                  border: '2px solid #363737',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  boxShadow: '4px 4px 0 #363737',
                  fontFamily: 'Lato, sans-serif',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.transform = 'translate(-2px, -2px)';
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow = '6px 6px 0 #363737';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.transform = 'translate(0, 0)';
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow = '4px 4px 0 #363737';
                }}
              >
                Learn About Be Pawsitive
              </a>
            </div>
          </div>

        </div>

        {/* PawCardCallout (left) | Stepper (right) */}
        <div
          style={{
            maxWidth: 1280,
            margin: 'calc(48px * 1.7) auto 0',
            padding: '0 5%',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 48,
            alignItems: 'stretch',
            gridAutoRows: '1fr',
          }}
        >
          {/* LEFT — PawCardCallout */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <PawCardCallout />
          </div>

          {/* RIGHT — How Paw Card Works Stepper */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              backgroundColor: '#ffffff',
              borderRadius: 20,
              padding: '32px 40px 24px',
              boxShadow: 'none',
              border: '1px solid rgba(54,55,55,0.08)',
            }}
          >
            <p
              className="font-lato"
              style={{
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#00577C',
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              How It Works
            </p>
            <h3
              className="font-headline font-bold"
              style={{
                fontSize: 'clamp(24px, 3vw, 32px)',
                color: '#363737',
                marginBottom: 32,
              }}
            >
              How the Paw Card Works
            </h3>
            <div style={{ position: 'relative', overflow: 'visible' }}>
              {pawCardStep > 1 && (
                <button
                  type="button"
                  aria-label="Previous step"
                  onClick={() => setPawCardStep((s) => Math.max(1, s - 1))}
                  style={{
                    position: 'absolute',
                    left: -20,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: '#FCBC5A',
                    border: '2px solid #363737',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="#363737"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 12L6 8l4-4" />
                  </svg>
                </button>
              )}
              <Stepper
                initialStep={1}
                currentStep={pawCardStep}
                onStepChange={setPawCardStep}
                hideButtons
                backButtonText="Back"
                nextButtonText="Next"
                stepCircleContainerClassName="home-paw-stepper-flush"
              >
              <Step>
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <img src={stepIcon1} alt="Paw Card" style={{ width: 80, height: 80, margin: '0 auto 16px', display: 'block', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                  <h4 className="font-headline font-bold" style={{ fontSize: 20, color: '#00577C', marginBottom: 8 }}>
                    Get Your Paw Card
                  </h4>
                  <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.6, opacity: 0.8 }}>
                    Every Lola&apos;s rental comes with a free digital Paw Card.
                    It&apos;s your key to island-wide savings and giving back.
                  </p>
                </div>
              </Step>
              <Step>
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <img src={stepIcon2} alt="Partner Stores" style={{ width: 80, height: 80, margin: '0 auto 16px', display: 'block', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                  <h4 className="font-headline font-bold" style={{ fontSize: 20, color: '#00577C', marginBottom: 8 }}>
                    Use It Island-Wide
                  </h4>
                  <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.6, opacity: 0.8 }}>
                    Show your Paw Card at 70+ partner establishments across Siargao
                    to unlock exclusive discounts on food, surf, stays and more.
                  </p>
                </div>
              </Step>
              <Step>
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <img src={stepIcon3} alt="Savings" style={{ width: 80, height: 80, margin: '0 auto 16px', display: 'block', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                  <h4 className="font-headline font-bold" style={{ fontSize: 20, color: '#00577C', marginBottom: 8 }}>
                    Save on Every Visit
                  </h4>
                  <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.6, opacity: 0.8 }}>
                    Every peso you save is matched by Lola&apos;s Rentals as a donation
                    to Be Pawsitive — up to <PesoSign />100,000 per year.
                  </p>
                </div>
              </Step>
              <Step>
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <img src={stepIcon4} alt="Lola" style={{ width: 80, height: 80, margin: '0 auto 16px', display: 'block', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                  <h4 className="font-headline font-bold" style={{ fontSize: 20, color: '#00577C', marginBottom: 8 }}>
                    Make a Difference
                  </h4>
                  <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.6, opacity: 0.8 }}>
                    Your savings directly fund spay, neuter and vaccination clinics
                    for Siargao&apos;s street animals. Together we&apos;re building a kinder island.
                  </p>
                </div>
              </Step>
              </Stepper>
              {pawCardStep < PAW_CARD_STEPPER_STEPS && (
                <button
                  type="button"
                  aria-label="Next step"
                  onClick={() => setPawCardStep((s) => Math.min(PAW_CARD_STEPPER_STEPS, s + 1))}
                  style={{
                    position: 'absolute',
                    right: -20,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: '#FCBC5A',
                    border: '2px solid #363737',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="#363737"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div style={{ marginTop: -2, marginBottom: -2 }}>
        <SectionDivider variant="dash" />
      </div>

      <ReviewsSection />

      <LolasChat />
    </PageLayout>
  );
}
