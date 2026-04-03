import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import SectionDivider from '../../components/home/SectionDivider.js';
import { FleetPreviewSection } from '../../components/home/FleetPreviewSection.js';
import TiltedCard from '../../components/home/TiltedCard.js';
import InclusionMarquee from '../../components/home/InclusionMarquee.js';
import iconCommunity from '../../assets/Hand on Heart.svg';
import iconReady from '../../assets/Peace of Mind Icon.svg';
import iconBenefits from '../../assets/Paw Card Icon.svg';
import iconHelmet from '../../assets/Helmet Icon.svg';
import iconFuel from '../../assets/Fuel Icon.svg';
import iconPawCard from '../../assets/Paw Card Icon.svg';
import iconCoat from '../../assets/Coat Icon.svg';
import iconFirstAid from '../../assets/First Aid Icon.svg';
import iconRepairKit from '../../assets/Repair Kit Icon.svg';
import iconPhoneMount from '../../assets/Phone Mount Icon.svg';
import iconCloth from '../../assets/Cloth Icon.svg';
import iconDryBag from '../../assets/Dry Bag Icon.svg';
import iconLesson from '../../assets/Lesson Icon.svg';
import iconCrashGuard from '../../assets/Crash Guard Icon.svg';
import iconPeaceOfMind from '../../assets/Peace of Mind Icon.svg';
import iconSurfRack from '../../assets/Surf Rack Icon.svg';
import iconBungee from '../../assets/Bingee Cord Icon.svg';
import iconDelivery from '../../assets/Delivery Collection Icon.svg';
import iconNinePm from '../../assets/9PM Return Icon.svg';
import { PawCardCallout } from '../../components/home/PawCardCallout.js';
import { ReviewsSection } from '../../components/home/ReviewsSection.js';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
function HeroSection() {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = !prefersReducedMotion;

  // Detect touch devices — parallax is mouse-only
  const isTouchDevice =
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: none)').matches;

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

  const flowerWidth  = isMobileFlower ? 160 : isTablet ? 260 : 420;
  const flowerBottom = isMobileFlower || isTablet ? -40 : -80;
  const flowerOffset = isMobileFlower || isTablet ? -20 : -40;

  return (
    <section
      className="relative overflow-hidden bg-sand-brand"
      style={{ minHeight: '560px', height: '70vh' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Flower Left ──────────────────────────────────────── */}
      <motion.img
        src={flowerLeft}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute z-[1]"
        style={{ width: flowerWidth, left: flowerOffset, bottom: flowerBottom }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      />

      {/* ── Flower Right ─────────────────────────────────────── */}
      <motion.img
        src={flowerRight}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute z-[1]"
        style={{ width: flowerWidth, right: flowerOffset, bottom: flowerBottom }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      />

      {/* ── Cloud 1 — large, slow drift + slow float ──────────── */}
      <motion.div
        style={{ position: 'absolute', top: '10%', left: '6%' }}
        animate={shouldAnimate ? { x: [0, 18, 0], y: [0, -8, 0] } : {}}
        transition={{
          x: { duration: 14, repeat: Infinity, ease: 'linear' },
          y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
        }}
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
        animate={shouldAnimate ? { x: [0, -14, 0], y: [0, -5, 0] } : {}}
        transition={{
          x: { duration: 11, repeat: Infinity, ease: 'linear' },
          y: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
        }}
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

      {/* ── Cloud 3 — medium, centre-top, snappy float ───────── */}
      <motion.div
        style={{ position: 'absolute', top: '6%', left: '42%' }}
        animate={shouldAnimate ? { x: [0, 10, 0], y: [0, -10, 0] } : {}}
        transition={{
          x: { duration: 17, repeat: Infinity, ease: 'linear' },
          y: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <motion.img
          src={cloud2}
          alt=""
          aria-hidden="true"
          style={{
            width: 110,
            pointerEvents: 'none',
            ...(useParallax ? { x: c3X, y: c3Y } : {}),
          }}
        />
      </motion.div>

      {/* ── Cloud 4 — tiny, lower-left, dreamy float ─────────── */}
      <motion.div
        style={{ position: 'absolute', top: '40%', left: '22%' }}
        animate={shouldAnimate ? { x: [0, 14, 0], y: [0, -6, 0] } : {}}
        transition={{
          x: { duration: 19, repeat: Infinity, ease: 'linear' },
          y: { duration: 9, repeat: Infinity, ease: 'easeInOut' },
        }}
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
        animate={shouldAnimate ? { x: [0, -10, 0], y: [0, -7, 0] } : {}}
        transition={{
          x: { duration: 13, repeat: Infinity, ease: 'linear' },
          y: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
        }}
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
            color: '#00577C',
            textAlign: 'center',
            lineHeight: 1.15,
            marginBottom: 24,
          }}
        >
          Rated by Many,
          <br />
          <span style={{ fontStyle: 'italic' }}>Rooted</span>
          {' '}in Community
        </h1>

        {/* Subheadline */}
        <p
          className="font-lato"
          style={{
            fontSize: 18,
            color: '#363737',
            textAlign: 'center',
            maxWidth: 560,
            lineHeight: 1.6,
            margin: '0 auto 40px',
          }}
        >
          Explore Siargao, support our street dogs and cats.
          <br />
          Every rental funds vital spay and neuter clinics.
        </p>

        {/* CTA Button */}
        <div style={{ display: 'inline-block', transform: 'skewX(-4deg)' }}>
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
        </div>
      </div>

    </section>
  );
}

export default function HomePage() {
  return (
    <PageLayout
      title="Lola's Rentals — Siargao Island"
      showFloralLeft={false}
      showFloralRight={false}
    >
      <HeroSection />

      <SectionDivider variant="a" />

      <FadeUpSection>
        <FleetPreviewSection />
      </FadeUpSection>

      <SectionDivider variant="b" />

      <FadeUpSection>
        <section style={{ backgroundColor: '#E8DFD0', padding: '96px 5%' }}>
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
              Every Rental
            </p>
            <h2
              className="font-headline font-bold"
              style={{
                textAlign: 'center',
                fontSize: 'clamp(32px, 5vw, 42px)',
                color: '#363737',
                marginBottom: 16,
                lineHeight: 1.2,
              }}
            >
              What&apos;s Included
            </h2>
            <p
              className="font-lato"
              style={{
                textAlign: 'center',
                fontSize: 16,
                color: '#363737',
                opacity: 0.7,
                maxWidth: 560,
                margin: '0 auto 48px',
              }}
            >
              Everything included with every booking — optional upgrades marked with +
            </p>
          </div>
          <InclusionMarquee
            items={[
              { icon: iconHelmet,      label: 'Helmet' },
              { icon: iconFuel,        label: 'Full Tank' },
              { icon: iconPawCard,     label: 'Paw Card' },
              { icon: iconCoat,        label: 'Rain Coat' },
              { icon: iconFirstAid,    label: 'First Aid' },
              { icon: iconRepairKit,   label: 'Repair Kit' },
              { icon: iconPhoneMount,  label: 'Phone Mount' },
              { icon: iconCloth,       label: 'Seat Cloth' },
              { icon: iconDryBag,      label: '5L Dry Bag' },
              { icon: iconLesson,      label: 'Riding Lesson' },
              { icon: iconCrashGuard,  label: 'Crash Armour' },
              { icon: iconPeaceOfMind, label: '+ Peace of Mind', isUpgrade: true },
              { icon: iconSurfRack,    label: '+ Surf Rack',     isUpgrade: true },
              { icon: iconBungee,      label: '+ Bungee Cord',   isUpgrade: true },
              { icon: iconDelivery,    label: '+ Delivery',      isUpgrade: true },
              { icon: iconNinePm,      label: '+ Late Return',   isUpgrade: true },
            ]}
            speed={45}
          />
        </section>
      </FadeUpSection>

      <SectionDivider variant="a" flip />

      <FadeUpSection>
        <section
          style={{
            backgroundColor: '#E8DFD0',
            padding: '96px 5%',
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
                icon={iconCommunity}
                title="Rooted in Community"
                body="Every rental directly funds spay, neuter and vaccination clinics for Siargao's street animals through our BePawsitive partnership. We're not just a rental — we're part of the island."
              />
              <TiltedCard
                icon={iconReady}
                title="Always Ready for You"
                body="Our fleet is regularly serviced and safety checked. And if anything comes up during your rental, our team is always reachable and responsive — we've got you covered."
              />
              <TiltedCard
                icon={iconBenefits}
                title="More Than Just a Rental"
                body="Every booking comes loaded with inclusions — helmet, rain gear, first aid kit and more. Plus our Paw Card unlocks exclusive discounts at 70+ island establishments."
              />
            </div>
          </div>
        </section>
      </FadeUpSection>

      <SectionDivider variant="b" flip />

      <FadeUpSection>
        <PawCardCallout />
      </FadeUpSection>

      <SectionDivider variant="a" />

      <FadeUpSection>
        <ReviewsSection />
      </FadeUpSection>
    </PageLayout>
  );
}
