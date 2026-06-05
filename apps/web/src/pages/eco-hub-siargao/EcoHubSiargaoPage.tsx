import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { PesoSign } from '../../components/ui/PesoSign.js';

// ---------------------------------------------------------------------------
// CountUp hook
// ---------------------------------------------------------------------------
function useCountUp(target: number, duration = 1800, trigger: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    let current = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [trigger, target, duration]);
  return count;
}

// ---------------------------------------------------------------------------
// Design tokens — Eco Hub forest green palette
// ---------------------------------------------------------------------------
const C = {
  forest:      '#1A5C2B',
  forestDark:  '#124020',
  forestDeep:  '#0D2E17',
  forestLight: '#2E7D43',
  mint:        '#E8F5ED',
  mintDark:    '#D0EDD9',
  gold:        '#FCBC5A',
  goldLight:   'rgba(252,188,90,0.18)',
  goldBorder:  'rgba(252,188,90,0.45)',
  white:       '#ffffff',
  text:        '#1a2e1e',
  muted:       '#5a7562',
  border:      '#C5DECA',
};

const NUNITO  = '"Nunito", "Lato", sans-serif';
const BEBAS   = '"Bebas Neue", "Alegreya Sans", sans-serif';
const PACIFICO = '"Pacifico", cursive';

// ---------------------------------------------------------------------------
// CSS keyframes
// ---------------------------------------------------------------------------
const KEYFRAMES = `
  @keyframes eco-float {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-6px); }
  }
  @keyframes eco-sunburst-rotate {
    from { transform: rotate(0deg) scale(1.8); }
    to   { transform: rotate(360deg) scale(1.8); }
  }
  @keyframes eco-pulse-glow {
    0%, 100% { box-shadow: 0 4px 12px rgba(30,100,50,0.4); }
    50%       { box-shadow: 0 4px 28px rgba(30,100,50,0.8), 0 0 48px rgba(30,100,50,0.3); }
  }
  .eco-primary-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(30,100,50,0.45) !important; }
  .eco-outline-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.1) !important; }
`;

// ---------------------------------------------------------------------------
// Scroll-triggered fade-in
// ---------------------------------------------------------------------------
function useFadeIn(delay = 0, from: 'up' | 'left' | 'right' | 'scale' = 'up') {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const t: Record<string, string> = {
    up:    'translateY(26px)',
    left:  'translateX(-26px)',
    right: 'translateX(26px)',
    scale: 'scale(0.93)',
  };
  return {
    ref,
    animStyle: {
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : t[from],
      transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
    } as React.CSSProperties,
  };
}

function FadeCard({
  delay = 0,
  from = 'up' as 'up' | 'left' | 'right' | 'scale',
  style: passedStyle,
  children,
}: {
  delay?: number;
  from?: 'up' | 'left' | 'right' | 'scale';
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { ref, animStyle } = useFadeIn(delay, from);
  return <div ref={ref} style={{ ...passedStyle, ...animStyle }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Section eyebrow label
// ---------------------------------------------------------------------------
function SectionEyebrow({ text, color = C.forest, centered = false }: { text: string; color?: string; centered?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, justifyContent: centered ? 'center' : 'flex-start' }}>
      <span style={{ fontFamily: NUNITO, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.14em', color }}>
        {text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------
function IconLeaf({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 13.5C4 11 6 8 13.5 2.5c0 0-1 8-6 10.5C5.5 14.5 3.5 14 2.5 13.5z" />
      <path d="M2.5 13.5c1-2 2.5-4 5-6" />
    </svg>
  );
}

function IconKids({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="4" r="2" />
      <path d="M5 14v-4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4" />
      <path d="M3.5 9.5L5 8M12.5 9.5L11 8" />
    </svg>
  );
}

function IconNoPlastic({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="1.5" width="6" height="13" rx="1.5" />
      <line x1="5" y1="4.5" x2="11" y2="4.5" />
      <line x1="2" y1="2" x2="14" y2="14" />
    </svg>
  );
}

function IconRecycle({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2L5.5 6H3l2.5 4.5H8" />
      <path d="M8 14l2.5-4H13l-2.5-4.5H8" />
      <path d="M5 10.5L2 8l3-1.5" />
      <path d="M11 5.5l3 2.5-3 1.5" />
    </svg>
  );
}

function IconCalendar({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" />
      <line x1="2" y1="6.5" x2="14" y2="6.5" />
      <line x1="5.5" y1="2" x2="5.5" y2="5" />
      <line x1="10.5" y1="2" x2="10.5" y2="5" />
    </svg>
  );
}

function IconCheck({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2.5,8 6,11.5 13.5,4.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function EcoHubSiargaoPage() {
  const [statsInView, setStatsInView] = useState(false);
  const [donationInView, setDonationInView] = useState(false);
  const [wasteInView, setWasteInView] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  const statsRef  = useRef<HTMLDivElement>(null);
  const donationRef = useRef<HTMLDivElement>(null);
  const wasteRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStatsInView(true); obs.disconnect(); } }, { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = donationRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setDonationInView(true); obs.disconnect(); } }, { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = wasteRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setWasteInView(true); obs.disconnect(); } }, { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cleanUps   = useCountUp(29,   1200, statsInView);
  const volunteers = useCountUp(520,  1600, statsInView);
  const bags       = useCountUp(715,  1600, statsInView);
  const wasteKg    = useCountUp(4008, 1800, statsInView);
  const donation   = useCountUp(17500, 2000, donationInView);

  const recyclable    = useCountUp(2293, 1600, wasteInView);
  const glass         = useCountUp(1051, 1600, wasteInView);
  const nonRecyclable = useCountUp(664,  1600, wasteInView);

  const secPad = isMobile ? '64px 20px' : '80px 48px';

  const { ref: aboutTextRef, animStyle: aboutTextAnim } = useFadeIn(150, 'right');
  const { ref: photoColRef,  animStyle: photoColAnim  } = useFadeIn(0,   'left');
  const { ref: donorCtrRef,  animStyle: donorCtrAnim  } = useFadeIn(0,   'scale');
  const { ref: commitHeadRef, animStyle: commitHeadAnim } = useFadeIn(0, 'up');
  const { ref: plansHeadRef, animStyle: plansHeadAnim } = useFadeIn(0, 'up');

  return (
    <PageLayout fullBleed title="Eco Hub Siargao | Lola's Rentals" showFloralLeft={false} showFloralRight={false}>
      <style>{KEYFRAMES}</style>
      <SEO
        title="Eco Hub Siargao — Lola's Rentals × Beach Clean-Ups & Kids Programs"
        description="Lola's Rentals funds Eco Hub Siargao's bi-weekly beach clean-ups and kids environmental awareness programs. 4 tonnes of waste diverted, 520 volunteers, and growing."
        canonical="/book/eco-hub-siargao"
      />

      {/* ================================================================
          1. HERO
          ================================================================ */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: C.forest,
          minHeight: '62vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: isMobile ? '80px 24px 100px' : '90px 32px 110px',
        }}
      >
        {/* Sunburst rays */}
        <div
          style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            backgroundImage:
              'repeating-conic-gradient(from 0deg at 50% 50%, #1A5C2B 0deg 9deg, #2E7D43 9deg 18deg)',
            opacity: 0.45,
            pointerEvents: 'none',
            animation: 'eco-sunburst-rotate 120s linear infinite',
            transformOrigin: '50% 50%',
          }}
        />

        {/* Vignette */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 70% 60% at 50% 30%, transparent 30%, rgba(10,40,18,0.55) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 640 }}>
          {/* Eyebrow pill */}
          <span
            style={{
              display: 'inline-block',
              border: '1px solid rgba(255,255,255,0.45)',
              background: 'rgba(255,255,255,0.12)',
              padding: '6px 18px',
              borderRadius: 99,
              fontFamily: NUNITO,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'white',
              marginBottom: 28,
            }}
          >
            Lola&apos;s Rentals × Eco Hub Siargao
          </span>

          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <img
              src="https://res.cloudinary.com/dk3c78pro/image/upload/v1780626103/Logo_jgllkl.png"
              alt="Eco Hub Siargao"
              style={{
                width: isMobile ? 120 : 148,
                height: isMobile ? 120 : 148,
                borderRadius: 20,
                objectFit: 'cover',
                display: 'block',
                boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
              }}
            />
          </div>

          <h1 style={{ margin: '0 0 18px', lineHeight: 1.1 }}>
            <span style={{ display: 'block', fontFamily: PACIFICO, fontSize: 'clamp(1.8rem, 4.5vw, 3.2rem)', color: 'white', fontWeight: 400 }}>
              Cleaning Up
            </span>
            <span style={{ display: 'block', fontFamily: PACIFICO, fontSize: 'clamp(1.8rem, 4.5vw, 3.2rem)', color: C.gold, fontWeight: 400 }}>
              Siargao Together
            </span>
          </h1>

          {/* Event chip */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: C.goldLight,
              border: `1px solid ${C.goldBorder}`,
              borderRadius: 99,
              padding: '6px 16px',
              marginBottom: 20,
              fontFamily: NUNITO,
              fontSize: 13,
              fontWeight: 800,
              color: C.gold,
              letterSpacing: '0.06em',
            }}
          >
            <IconCalendar size={15} /> Next Clean-Up — June 7, 2026
          </div>

          <p
            style={{
              fontFamily: NUNITO,
              fontSize: 16,
              lineHeight: 1.75,
              color: 'rgba(255,255,255,0.82)',
              maxWidth: 600,
              margin: '0 auto 36px',
            }}
          >
            Bi-weekly beach clean-ups, kids environmental education, and a plastic-free future
            for Siargao. Every rental with Lola&apos;s helps fund this work.
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="https://www.instagram.com/ecohub.siargao/"
              target="_blank"
              rel="noopener noreferrer"
              className="eco-primary-btn"
              style={{
                background: C.gold,
                color: C.forestDeep,
                padding: '14px 28px',
                borderRadius: 12,
                fontFamily: NUNITO,
                fontSize: 15,
                fontWeight: 900,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'transform 0.15s',
                boxShadow: '0 4px 12px rgba(252,188,90,0.4)',
              }}
            >
              Follow Eco Hub Siargao ↗
            </a>
            <a
              href="#our-support"
              className="eco-outline-btn"
              style={{
                background: 'transparent',
                color: 'white',
                border: '1.5px solid rgba(255,255,255,0.6)',
                padding: '13px 24px',
                borderRadius: 12,
                fontFamily: NUNITO,
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'transform 0.15s, background 0.15s',
              }}
            >
              How Lola&apos;s Contributes ↓
            </a>
          </div>
        </div>

        {/* Wave into stats bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, lineHeight: 0, pointerEvents: 'none' }}>
          <svg viewBox="0 0 1200 56" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 56 }}>
            <path d="M0,28 C300,56 900,0 1200,28 L1200,56 L0,56 Z" fill={C.forestDark} />
          </svg>
        </div>
      </section>

      {/* ================================================================
          2. STATS BAR
          ================================================================ */}
      <section
        ref={statsRef}
        style={{
          background: C.forestDark,
          padding: isMobile ? '32px 20px' : '32px 48px',
          marginTop: -4,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap: isMobile ? '28px 16px' : 0,
            textAlign: 'center',
          }}
        >
          {[
            { num: `${cleanUps}`,             label: 'Beach Clean-Ups' },
            { num: `${volunteers.toLocaleString()}+`, label: 'Volunteers Engaged' },
            { num: `${bags}+`,                label: 'Bags Collected' },
            { num: `~${wasteKg.toLocaleString()} kg`, label: 'Waste Removed' },
          ].map((s, i) => (
            <FadeCard key={s.label} delay={i * 120} from="up">
              <div style={{ fontFamily: BEBAS, fontSize: 52, color: 'white', lineHeight: 1, letterSpacing: '0.02em', textAlign: 'center' }}>
                {s.num}
              </div>
              <div style={{ fontFamily: NUNITO, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.7)', marginTop: 6, textAlign: 'center' }}>
                {s.label}
              </div>
            </FadeCard>
          ))}
        </div>
      </section>

      {/* ================================================================
          3. ABOUT ECO HUB
          ================================================================ */}
      <section
        style={{
          background: C.mint,
          padding: isMobile ? '64px 20px 40px' : '80px 48px 48px',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 40 : 60,
            alignItems: 'stretch',
          }}
        >
          {/* Photo / logo column */}
          {!isMobile && (
            <div ref={photoColRef} style={{ flex: '0 0 auto', width: 300, display: 'flex', flexDirection: 'column', gap: 12, ...photoColAnim }}>
              {/* Logo card — object-cover fills the card so the logo's own green bg is seamless */}
              <div
                style={{
                  borderRadius: 20,
                  overflow: 'hidden',
                  height: 220,
                  flexShrink: 0,
                  boxShadow: '0 2px 20px rgba(0,0,0,0.14)',
                }}
              >
                <img
                  src="https://res.cloudinary.com/dk3c78pro/image/upload/v1780626103/Logo_jgllkl.png"
                  alt="Eco Hub Siargao"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>

              {/* Photo grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1 }}>
                {[
                  { src: 'https://res.cloudinary.com/dk3c78pro/image/upload/v1780626103/2_d8lzhe.jpg', alt: 'Volunteers with bags of collected waste' },
                  { src: 'https://res.cloudinary.com/dk3c78pro/image/upload/v1780626103/3_ypnpvn.jpg', alt: 'Volunteer holding waste bag' },
                  { src: 'https://res.cloudinary.com/dk3c78pro/image/upload/v1780626101/4_atfkx9.jpg', alt: 'Kids picking up trash on the beach' },
                  { src: 'https://res.cloudinary.com/dk3c78pro/image/upload/v1780626103/7_cn1rf8.jpg', alt: 'Kids walking beach clean-up' },
                ].map(({ src, alt }) => (
                  <div
                    key={src}
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      aspectRatio: '1',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
                    }}
                  >
                    <img
                      src={src}
                      alt={alt}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Text column */}
          <div ref={aboutTextRef} style={{ flex: 1, minWidth: 0, ...aboutTextAnim }}>
            <SectionEyebrow text="About Eco Hub Siargao" color={C.forest} />
            <h2 style={{ fontFamily: PACIFICO, fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)', color: C.text, fontWeight: 400, lineHeight: 1.25, marginBottom: 20 }}>
              Protecting Siargao,
              <br />
              <span style={{ color: C.forest }}>One Clean-Up at a Time</span>
            </h2>

            <p style={{ fontFamily: NUNITO, fontSize: 15, lineHeight: 1.8, color: C.text, marginBottom: 16 }}>
              Eco Hub Siargao is a grassroots environmental organisation running bi-weekly beach clean-ups, waste
              education programs for children, and a plastic-free business initiative across the island. Their work is
              consistent, community-driven, and built for lasting change.
            </p>

            <blockquote
              style={{
                borderLeft: `4px solid ${C.gold}`,
                borderRadius: '0 12px 12px 0',
                background: 'rgba(252,188,90,0.1)',
                padding: '14px 18px',
                margin: '0 0 18px',
                fontFamily: NUNITO,
                fontSize: 15,
                fontStyle: 'italic',
                color: C.text,
                lineHeight: 1.7,
              }}
            >
              "Through consistent community action, we have diverted an estimated 4 tonnes of waste from the environment,
              with more than 57% of collected materials recovered for recycling."
            </blockquote>

            <p style={{ fontFamily: NUNITO, fontSize: 15, lineHeight: 1.8, color: C.text, marginBottom: 28 }}>
              With 29 clean-ups completed across Siargao's beaches and coastal ecosystems, Eco Hub has mobilised
              over 520 volunteers — residents, tourists, and local children — building a culture of environmental
              stewardship on the island.
            </p>

            {/* Programme cards */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
              {[
                {
                  Icon: IconLeaf,
                  title: 'Beach Clean-Ups',
                  desc: 'Bi-weekly organised clean-ups at beaches and coastal ecosystems across Siargao.',
                },
                {
                  Icon: IconKids,
                  title: 'Kids Awareness Program',
                  desc: 'Environmental education sessions for local children covering littering, burning, and sustainable living.',
                },
                {
                  Icon: IconNoPlastic,
                  title: 'Plastic-Free Initiative',
                  desc: 'Working with local restaurants, cafes and bars to eliminate single-use plastics island-wide.',
                },
              ].map((card, i) => {
                const IconCmp = card.Icon;
                return (
                  <FadeCard
                    key={card.title}
                    delay={i * 100}
                    from="scale"
                    style={{
                      background: 'white',
                      border: `1px solid ${C.border}`,
                      borderRadius: 16,
                      padding: 20,
                      boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: C.mint, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: C.forest }}>
                      <IconCmp size={22} />
                    </div>
                    <div style={{ fontFamily: NUNITO, fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 6 }}>
                      {card.title}
                    </div>
                    <div style={{ fontFamily: NUNITO, fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
                      {card.desc}
                    </div>
                  </FadeCard>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          4. WASTE BREAKDOWN
          ================================================================ */}
      <section
        ref={wasteRef}
        style={{ background: C.forestDeep, padding: secPad, color: 'white' }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <SectionEyebrow text="Waste Breakdown · 2025–2026" color={C.gold} centered />
          <h2
            style={{
              fontFamily: BEBAS,
              fontSize: 'clamp(2.4rem, 5vw, 4rem)',
              color: 'white',
              letterSpacing: '0.03em',
              lineHeight: 1,
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            4 Tonnes Diverted from Siargao&apos;s Beaches
          </h2>
          <p style={{ fontFamily: NUNITO, fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 40, lineHeight: 1.7 }}>
            Over 57% of all collected materials recovered for recycling
          </p>

          {/* Breakdown bar */}
          <div
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              height: 20,
              display: 'flex',
              marginBottom: 32,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ flex: recyclable, background: '#4CAF50', transition: 'flex 1.5s ease' }} title="Recyclables" />
            <div style={{ flex: glass,      background: '#2196F3', transition: 'flex 1.5s ease' }} title="Glass" />
            <div style={{ flex: nonRecyclable, background: '#FF5722', transition: 'flex 1.5s ease' }} title="Non-recyclable" />
          </div>

          {/* Breakdown cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16 }}>
            {[
              {
                emoji: '♻️',
                label: 'Recyclables Recovered',
                value: recyclable,
                color: '#4CAF50',
                bg: 'rgba(76,175,80,0.12)',
                border: 'rgba(76,175,80,0.3)',
              },
              {
                emoji: '🍾',
                label: 'Glass Collected',
                value: glass,
                color: '#64B5F6',
                bg: 'rgba(33,150,243,0.12)',
                border: 'rgba(33,150,243,0.3)',
              },
              {
                emoji: '🗑️',
                label: 'Non-Recyclable Removed',
                value: nonRecyclable,
                color: '#FF7043',
                bg: 'rgba(255,87,34,0.12)',
                border: 'rgba(255,87,34,0.3)',
              },
            ].map((item, i) => (
              <FadeCard
                key={item.label}
                delay={i * 100}
                from="up"
                style={{
                  background: item.bg,
                  border: `1px solid ${item.border}`,
                  borderRadius: 16,
                  padding: '20px 24px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 10 }}>{item.emoji}</div>
                <div style={{ fontFamily: BEBAS, fontSize: 42, color: item.color, lineHeight: 1, letterSpacing: '0.02em' }}>
                  {item.value.toLocaleString()} kg
                </div>
                <div style={{ fontFamily: NUNITO, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                  {item.label}
                </div>
              </FadeCard>
            ))}
          </div>

          {/* Percentage callout */}
          <FadeCard
            delay={300}
            from="up"
            style={{
              marginTop: 24,
              background: 'rgba(252,188,90,0.1)',
              border: `1px solid ${C.goldBorder}`,
              borderRadius: 16,
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontFamily: BEBAS, fontSize: 48, color: C.gold, lineHeight: 1, letterSpacing: '0.02em', flexShrink: 0 }}>
              57%+
            </div>
            <div>
              <div style={{ fontFamily: NUNITO, fontSize: 14, fontWeight: 800, color: 'white', marginBottom: 4 }}>
                Recovery rate — far above the national average
              </div>
              <div style={{ fontFamily: NUNITO, fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65 }}>
                More than half of everything collected is recovered for recycling, not landfill. That&apos;s what consistent,
                organised clean-ups achieve versus ad-hoc efforts.
              </div>
            </div>
          </FadeCard>
        </div>
      </section>

      {/* ================================================================
          5. KIDS AWARENESS PROGRAM
          ================================================================ */}
      <section style={{ background: C.mint, padding: secPad }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 36 : 64, alignItems: 'center' }}>
            {/* Left — copy */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <FadeCard from="left">
                <SectionEyebrow text="Kids Environmental Awareness Program" color={C.forest} />
                <h2 style={{ fontFamily: PACIFICO, fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)', color: C.text, fontWeight: 400, lineHeight: 1.25, marginBottom: 18 }}>
                  Teaching the Next Generation
                  <br />
                  <span style={{ color: C.forest }}>to Protect Their Island</span>
                </h2>
                <p style={{ fontFamily: NUNITO, fontSize: 15, lineHeight: 1.8, color: C.text, marginBottom: 20 }}>
                  In 2026, Eco Hub launched their first Kids Awareness Program in Libertad, the main town of General Luna.
                  Approximately <strong>30 children aged 4–15</strong> participated in <strong>5 structured sessions</strong>, with
                  local teachers now integrating the curriculum into regular classroom lessons.
                </p>
                <p style={{ fontFamily: NUNITO, fontSize: 15, lineHeight: 1.8, color: C.text, marginBottom: 24 }}>
                  <strong>Lola&apos;s Rentals is co-funding the programme</strong> — helping Eco Hub bring it to remote villages
                  across the island that have never had access to this kind of education before.
                </p>

                {/* Session topics */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    'The impact of littering on beaches and marine ecosystems',
                    'Why burning waste is harmful — smoke, toxins, and long-term effects',
                    'Upcycling and creative reuse of everyday materials',
                    'Reducing waste at home and in school',
                    'Building sustainable habits that last a lifetime',
                  ].map((topic) => (
                    <div key={topic} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: C.forest, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', marginTop: 1 }}>
                        <IconCheck size={13} />
                      </div>
                      <span style={{ fontFamily: NUNITO, fontSize: 14, color: C.text, lineHeight: 1.65 }}>{topic}</span>
                    </div>
                  ))}
                </div>
              </FadeCard>
            </div>

            {/* Right — stat cards */}
            <div style={{ flexShrink: 0, width: isMobile ? '100%' : 320 }}>
              <FadeCard from="right" delay={100}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { value: '~30', label: 'Kids participated in first program', icon: '👧' },
                    { value: '5',   label: 'Sessions covering sustainability topics', icon: '📚' },
                    { value: 'Ages 4–15', label: 'Broad age range in Libertad', icon: '🌱' },
                    { value: '3',   label: 'Programs completed this year', icon: '✅' },
                  ].map((s, i) => (
                    <div
                      key={s.label}
                      style={{
                        background: 'white',
                        border: `1px solid ${C.border}`,
                        borderRadius: 16,
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                        opacity: statsInView ? 1 : 0,
                        transform: statsInView ? 'none' : 'translateX(20px)',
                        transition: `opacity 0.6s ease ${i * 100}ms, transform 0.6s ease ${i * 100}ms`,
                      }}
                    >
                      <div style={{ fontSize: 28, flexShrink: 0 }}>{s.icon}</div>
                      <div>
                        <div style={{ fontFamily: BEBAS, fontSize: 26, color: C.forest, lineHeight: 1, letterSpacing: '0.02em' }}>{s.value}</div>
                        <div style={{ fontFamily: NUNITO, fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{s.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </FadeCard>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          6. PLANS — NEXT 7 MONTHS
          ================================================================ */}
      <section style={{ background: C.forest, padding: secPad, color: 'white' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div ref={plansHeadRef} style={{ ...plansHeadAnim, textAlign: 'center', marginBottom: 48 }}>
            <SectionEyebrow text="What's Coming — June to December 2026" color={C.gold} centered />
            <h2 style={{ fontFamily: BEBAS, fontSize: 'clamp(2.4rem, 5vw, 4rem)', color: 'white', letterSpacing: '0.03em', lineHeight: 1, margin: 0 }}>
              The Next 7 Months
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 16 }}>
            {[
              {
                icon: '🏖️',
                title: '14 More Beach Clean-Ups',
                desc: 'Bi-weekly organised events across Siargao\'s beaches and coastal ecosystems — every fortnight, rain or shine.',
              },
              {
                icon: '🏫',
                title: '2 Kids Programs in Remote Villages',
                desc: 'Expanding the awareness program to villages that have never had access to this kind of environmental education. 3 completed this year already.',
              },
              {
                icon: '🚫',
                title: 'Single-Use Plastic Free Project',
                desc: 'Partnering directly with restaurants, cafes, and bars around Siargao to eliminate single-use plastics from their operations for good.',
              },
              {
                icon: '📱',
                title: 'Monthly Awareness Content',
                desc: 'Video and educational content empowering the local community — plus spotlighting 14 eco-conscious businesses to motivate others.',
              },
            ].map((item, i) => (
              <FadeCard
                key={item.title}
                delay={i * 100}
                from="up"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 16,
                  padding: '20px 24px',
                }}
              >
                <div style={{ fontSize: 30, marginBottom: 12 }}>{item.icon}</div>
                <div style={{ fontFamily: NUNITO, fontSize: 15, fontWeight: 800, color: 'white', marginBottom: 8 }}>
                  {item.title}
                </div>
                <div style={{ fontFamily: NUNITO, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
                  {item.desc}
                </div>
              </FadeCard>
            ))}
          </div>

          {/* Eco-business highlight strip */}
          <FadeCard
            delay={400}
            from="up"
            style={{
              marginTop: 24,
              background: C.goldLight,
              border: `1px solid ${C.goldBorder}`,
              borderRadius: 16,
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 28, flexShrink: 0 }}>🌿</div>
            <div>
              <div style={{ fontFamily: NUNITO, fontSize: 14, fontWeight: 800, color: C.gold, marginBottom: 4 }}>
                14 Eco-Conscious Business Spotlights on Instagram
              </div>
              <div style={{ fontFamily: NUNITO, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65 }}>
                Celebrating businesses doing the right thing — and motivating others across the island to follow.
              </div>
            </div>
          </FadeCard>
        </div>
      </section>

      {/* ================================================================
          7. LOLA'S CONTRIBUTION
          ================================================================ */}
      <section
        id="our-support"
        style={{ background: C.mint, padding: secPad, paddingBottom: isMobile ? 'calc(64px + 2rem)' : 'calc(80px + 2rem)', marginBottom: '-2rem' }}
      >
        <div ref={donationRef} style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div ref={commitHeadRef} style={commitHeadAnim}>
            <SectionEyebrow text="Our Commitment" color={C.forest} centered />
            <h2 style={{ fontFamily: PACIFICO, fontSize: 'clamp(1.8rem, 3.5vw, 3rem)', color: C.text, fontWeight: 400, lineHeight: 1.2, marginBottom: 18 }}>
              Every Rental Helps
              <br />
              <span style={{ color: C.forest }}>Keep Siargao Clean</span>
            </h2>
          </div>

          <p style={{ fontFamily: NUNITO, fontSize: 15, lineHeight: 1.8, color: C.text, maxWidth: 580, margin: '0 auto 40px' }}>
            A portion of every booking with Lola&apos;s Rentals goes directly to our NGO partners, including Eco Hub Siargao.
            No admin fees, no overheads — straight to the people doing the work on the ground.
          </p>

          {/* How-it-works cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, marginBottom: 36, textAlign: 'left' }}>
            {[
              {
                n: 1,
                title: 'You Book a Rental',
                desc: 'Every vehicle rental automatically contributes to Lola\'s NGO fund — no extra steps needed.',
              },
              {
                n: 2,
                title: 'We Donate Directly',
                desc: 'Funds are distributed directly to Eco Hub Siargao to cover clean-up logistics, equipment, and the kids program.',
              },
              {
                n: 3,
                title: 'Siargao Stays Beautiful',
                desc: 'Your rental helps keep the island\'s beaches clean and its children educated about sustainable living.',
              },
            ].map((c, i) => (
              <FadeCard
                key={c.n}
                delay={i * 100}
                from="scale"
                style={{
                  background: 'white',
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                  padding: 24,
                  boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.forest, color: 'white', fontFamily: NUNITO, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  {c.n}
                </div>
                <div style={{ fontFamily: NUNITO, fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 6 }}>{c.title}</div>
                <div style={{ fontFamily: NUNITO, fontSize: 13, color: C.muted, lineHeight: 1.65 }}>{c.desc}</div>
              </FadeCard>
            ))}
          </div>

          {/* Donation counter */}
          <div
            ref={donorCtrRef}
            style={{
              background: C.forest,
              borderRadius: 20,
              padding: isMobile ? '28px 24px' : '32px 40px',
              display: 'inline-block',
              minWidth: isMobile ? 'auto' : 340,
              marginBottom: 36,
              boxShadow: '0 2px 20px rgba(0,0,0,0.12)',
              ...donorCtrAnim,
            }}
          >
            <div style={{ fontFamily: NUNITO, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
              Total Donated to Eco Hub Siargao
            </div>
            <div style={{ fontFamily: BEBAS, fontSize: 'clamp(3.5rem, 7vw, 5rem)', color: 'white', lineHeight: 1, letterSpacing: '0.02em' }}>
              <PesoSign style={{ color: C.gold, height: '0.7em', verticalAlign: '-0.05em' }} />
              {donation.toLocaleString()}
            </div>
            <div style={{ fontFamily: NUNITO, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
              and counting — updated live
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/book/reserve"
              className="eco-primary-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: C.forest,
                color: 'white',
                padding: '13px 26px',
                borderRadius: 12,
                fontFamily: NUNITO,
                fontSize: 14,
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(26,92,43,0.35)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
            >
              🌿 Book a Rental
            </Link>
            <a
              href="https://www.instagram.com/ecohub.siargao/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                color: C.forest,
                border: `1.5px solid ${C.forest}`,
                padding: '13px 26px',
                borderRadius: 12,
                fontFamily: NUNITO,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'transform 0.15s',
              }}
            >
              Follow on Instagram ↗
            </a>
            <Link
              to="/book/impact"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                color: C.muted,
                border: `1.5px solid ${C.border}`,
                padding: '13px 26px',
                borderRadius: 12,
                fontFamily: NUNITO,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'transform 0.15s',
              }}
            >
              ← All Impact Stories
            </Link>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
