import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { PesoSign } from '../../components/ui/PesoSign.js';

// Run photos
import runPhoto1 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092746.png';
import runPhoto2 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092806.png';
import runPhoto3 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092829.png';
import runPhoto4 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092847.png';
import runPhoto5 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092902.png';
import runPhoto6 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092926.png';
import runPhoto7 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092945.png';
import runPhoto8 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092959.png';

// About section extra photos
import nadinePhoto from '../../assets/Be Pawsitive/Run 2025/nadine.png';
import runnerDabbingPhoto from '../../assets/Be Pawsitive/Run 2025/runner dabbing.png';
import roadMapImg from '../../assets/Be Pawsitive/Run 2025/road map.png';


// Collab logos
import aquaFlaskLogo from '../../assets/Be Pawsitive/Run 2025/Aqua Flask.svg';
import bpIconLogo from '../../assets/Be Pawsitive/Run 2025/Be Pawsitive Icon Logo.svg';

// Animal illustrations (parade)
import animal82 from '../../assets/Be Pawsitive/Run 2025/Lola.Cat.Illustrations/82.svg';
import animal83 from '../../assets/Be Pawsitive/Run 2025/Lola.Cat.Illustrations/83.svg';
import animal84 from '../../assets/Be Pawsitive/Run 2025/Lola.Cat.Illustrations/84.svg';
import animal85 from '../../assets/Be Pawsitive/Run 2025/Lola.Cat.Illustrations/85.svg';
import animal86 from '../../assets/Be Pawsitive/Run 2025/Lola.Cat.Illustrations/86.svg';
import animal87 from '../../assets/Be Pawsitive/Run 2025/Lola.Cat.Illustrations/87.svg';

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
// Line-work icon components
// ---------------------------------------------------------------------------
function IconClock({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <polyline points="8,4.5 8,8 10.5,9.5" />
    </svg>
  );
}

function IconTicket({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6a1.5 1.5 0 0 0 0 4v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2a1.5 1.5 0 0 0 0-4V4a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v2z" />
      <line x1="5.5" y1="3" x2="5.5" y2="13" strokeDasharray="2 2" />
    </svg>
  );
}

function IconBolt({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9.5,1.5 4,8.5 8,8.5 6.5,14.5 12,7.5 8,7.5 9.5,1.5" />
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

function IconStethoscope({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 4.5a1.2 1.2 0 0 1 2.4 0v1.8a2.1 2.1 0 0 0 4.2 0V4.5a1.2 1.2 0 0 1 2.4 0" />
      <path d="M8 6.3v2.2a3.8 3.8 0 0 0 3.8 3.8h.3a1.4 1.4 0 1 0 0-2.8h-.6" />
      <circle cx="12.6" cy="10.8" r="1.25" />
    </svg>
  );
}

function IconSyringe({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.2 11.8 9.2 6.8a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4l-5 5" />
      <line x1="2.5" y1="13.5" x2="4.2" y2="11.8" />
      <line x1="11.2" y1="5.8" x2="13.5" y2="3.5" />
    </svg>
  );
}

function IconHouseCommunity({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7.5 8 2.5l5.5 5v6.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V7.5z" />
      <path d="M6.5 14.5v-4h3v4" />
      <circle cx="11.8" cy="5.2" r="0.85" />
      <circle cx="13.6" cy="6.6" r="0.65" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const C = {
  cream: '#ede5d8',
  creamDark: '#e0d5c3',
  navy: '#1a3f5c',
  amber: '#fcbc5a',
  amberLight: '#fcbc5a',
  amberBg: '#fdf3e0',
  bpBlue: '#1b5faa',
  bpBlueDark: '#154d8a',
  teal: '#2a7a6a',
  tealDark: '#1f5e50',
  muted: '#8a7f74',
  border: '#ddd4c4',
  text: '#2a2018',
};

const PACIFICO = '"Pacifico", cursive';
const BEBAS = '"Bebas Neue", "Alegreya Sans", sans-serif';
const NUNITO = '"Nunito", "Lato", sans-serif';

// ---------------------------------------------------------------------------
// CSS keyframes injected once
// ---------------------------------------------------------------------------
const KEYFRAMES = `
  @keyframes bp-float {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-6px); }
  }
  @keyframes bp-sunburst-rotate {
    from { transform: rotate(0deg) scale(1.8); }
    to   { transform: rotate(360deg) scale(1.8); }
  }
  @keyframes bp-pulse-glow {
    0%, 100% { box-shadow: 0 4px 12px rgba(252,188,90,0.4); }
    50%       { box-shadow: 0 4px 28px rgba(252,188,90,0.8), 0 0 48px rgba(252,188,90,0.3); }
  }
  .bp-hero-register { animation: bp-pulse-glow 2.4s ease-in-out infinite; }
  .bp-float-0 { animation: bp-float 3s ease-in-out infinite 0s; }
  .bp-float-1 { animation: bp-float 3s ease-in-out infinite 0.4s; }
  .bp-float-2 { animation: bp-float 3s ease-in-out infinite 0.8s; }
  .bp-float-3 { animation: bp-float 3s ease-in-out infinite 1.2s; }
  .bp-float-4 { animation: bp-float 3s ease-in-out infinite 1.6s; }
  .bp-float-5 { animation: bp-float 3s ease-in-out infinite 2.0s; }
  .bp-primary-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(232,160,32,0.45) !important; }
  .bp-outline-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.1) !important; }
  .bp-navy-btn:hover { transform: translateY(-1px); }
`;

// ---------------------------------------------------------------------------
// Reusable label above section headings
// ---------------------------------------------------------------------------
function IconStarOutline({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M12 2.5l2.8 6.9h7.2l-5.75 4.45 2.2 7.15L12 16.9l-6.45 4.1 2.2-7.15L2 9.4h7.2L12 2.5z" />
    </svg>
  );
}

function AmbassadorPill({ name }: { name: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 99,
        padding: '5px 12px 5px 6px',
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.amber,
        }}
        aria-hidden
      >
        <IconStarOutline size={19} />
      </span>
      <span
        style={{
          fontFamily: NUNITO,
          fontSize: 13,
          fontWeight: 600,
          color: 'white',
        }}
      >
        {name}
      </span>
    </div>
  );
}

function SectionEyebrow({ text, color = C.bpBlue, centered = false }: { text: string; color?: string; centered?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
        justifyContent: centered ? 'center' : 'flex-start',
        width: '100%',
      }}
    >
      <span
        style={{
          fontFamily: NUNITO,
          fontSize: 11,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color,
        }}
      >
        {text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scroll-triggered fade-in — hook for named elements
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

// Wrapper component — safe to use inside .map() (own observer per instance)
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
// Page component
// ---------------------------------------------------------------------------
export default function BePawsitivePage() {
  const { t } = useTranslation();
  const [statsInView, setStatsInView] = useState(false);
  const [donationInView, setDonationInView] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  const statsRef = useRef<HTMLDivElement>(null);
  const donationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStatsInView(true); observer.disconnect(); } },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = donationRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setDonationInView(true); observer.disconnect(); } },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const animalsFixed   = useCountUp(1601,   1800, statsInView);
  const vaccinated     = useCountUp(2746,   1800, statsInView);
  const eventsCount    = useCountUp(4,      1200, statsInView);
  const locationsCount = useCountUp(2,      1000, statsInView);
  const donation       = useCountUp(282995, 2200, donationInView);

  const secPad  = isMobile ? '64px 20px' : '80px 48px';

  // Scroll-triggered animation hooks
  const { ref: photoColRef,     animStyle: photoColAnim     } = useFadeIn(0,   'left');
  const { ref: aboutTextRef,    animStyle: aboutTextAnim    } = useFadeIn(150, 'right');
  const { ref: funRunHeaderRef, animStyle: funRunHeaderAnim } = useFadeIn(0,   'up');
  const { ref: logoBadgeRef,    animStyle: logoBadgeAnim    } = useFadeIn(200, 'scale');
  const { ref: whenWhereRef,    animStyle: whenWhereAnim    } = useFadeIn(0,   'up');
  const { ref: regFeesRef,      animStyle: regFeesAnim      } = useFadeIn(100, 'up');
  const { ref: registerBtnRef,  animStyle: registerBtnAnim  } = useFadeIn(200, 'up');
  const { ref: donorCtrRef,     animStyle: donorCtrAnim     } = useFadeIn(0,   'scale');
  const { ref: commitHeadRef,   animStyle: commitHeadAnim   } = useFadeIn(0,   'up');
  const { ref: routeTextRef,    animStyle: routeTextAnim    } = useFadeIn(0,   'left');
  const { ref: routeMapRef,     animStyle: routeMapAnim     } = useFadeIn(150, 'right');

  // Parade config — tuktuk far-left, all sizes +40%, tuktuk white-bg removed via multiply
  const paradeItems = [
    { src: animal87, height: 160, blend: true  },  // tuktuk +30%
    { src: animal82, height: 90,  blend: false },  // cat +15%
    { src: animal84, height: 109, blend: false },
    { src: animal83, height: 116, blend: false },
    { src: animal85, height: 116, blend: false },
    { src: animal86, height: 97,  blend: false },
  ];

  return (
    <PageLayout fullBleed title="Be Pawsitive | Lola's Rentals" showFloralLeft={false} showFloralRight={false}>
      <style>{KEYFRAMES}</style>
      <SEO
        title="Be Pawsitive — Lola's Rentals x Siargao Animal Welfare"
        description="Every rental at Lola's supports Be Pawsitive, Siargao's animal welfare NGO. Spaying, neutering and vaccinating street animals on the island. Join the movement."
        canonical="/book/bepawsitive"
      />

      {/* ================================================================
          1. HERO — sunburst + centered story-first layout
          ================================================================ */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: C.bpBlue,
          minHeight: '62vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: isMobile ? '80px 24px 100px' : '90px 32px 110px',
        }}
      >
        {/* Sunburst rays — centred, slow clockwise rotation */}
        <div
          style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            backgroundImage:
              'repeating-conic-gradient(from 0deg at 50% 50%, #1b6faa 0deg 9deg, #28b87a 9deg 18deg)',
            opacity: 0.55,
            pointerEvents: 'none',
            animation: 'bp-sunburst-rotate 90s linear infinite',
            transformOrigin: '50% 50%',
          }}
        />

        {/* Vignette */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 70% 60% at 50% 30%, transparent 30%, rgba(20,55,110,0.45) 100%)',
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
            Lola&apos;s Rentals × Be Pawsitive
          </span>

          <h1 style={{ margin: '0 0 22px', lineHeight: 1.1 }}>
            <span
              style={{
                display: 'block',
                fontFamily: PACIFICO,
                fontSize: 'clamp(2rem, 5vw, 3.6rem)',
                color: 'white',
                fontWeight: 400,
              }}
            >
              {t('bePawsitive.heroLine1')}
            </span>
            <span
              style={{
                display: 'block',
                fontFamily: PACIFICO,
                fontSize: 'clamp(2rem, 5vw, 3.6rem)',
                color: C.amber,
                fontWeight: 400,
              }}
            >
              {t('bePawsitive.heroLine2')}
            </span>
          </h1>

          {/* Event date chip */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(252,188,90,0.18)',
              border: '1px solid rgba(252,188,90,0.45)',
              borderRadius: 99,
              padding: '6px 16px',
              marginBottom: 20,
              fontFamily: NUNITO,
              fontSize: 13,
              fontWeight: 800,
              color: C.amber,
              letterSpacing: '0.06em',
            }}
          >
            <IconCalendar size={15} /> {t('bePawsitive.eventDate')}
          </div>

          <p
            style={{
              fontFamily: NUNITO,
              fontSize: 16,
              lineHeight: 1.75,
              color: 'rgba(255,255,255,0.82)',
              maxWidth: 700,
              margin: '0 auto 36px',
              textAlign: 'center',
            }}
          >
            {t('bePawsitive.heroCopy')}
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              href="https://raceroster.com/events/2026/116269/aquaflask-be-pawsitive-run-2026"
              target="_blank"
              rel="noopener noreferrer"
              className="bp-primary-btn bp-hero-register"
              style={{
                background: C.amber,
                color: 'white',
                padding: '16px 32px',
                borderRadius: 12,
                fontFamily: NUNITO,
                fontSize: 17,
                fontWeight: 900,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                transition: 'transform 0.15s',
              }}
            >
              <IconBolt size={18} /> {t('bePawsitive.registerFunRun')}
            </a>
            <a
              href="#lolas-contribution"
              className="bp-outline-btn"
              style={{
                background: 'transparent',
                color: 'white',
                border: '1.5px solid rgba(255,255,255,0.6)',
                padding: '15px 26px',
                borderRadius: 12,
                fontFamily: NUNITO,
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'transform 0.15s, background 0.15s',
              }}
            >
              {t('bePawsitive.howLolaContributes')}
            </a>
          </div>
        </div>

        {/* Teal wave into stats bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            lineHeight: 0,
            pointerEvents: 'none',
          }}
        >
          <svg
            viewBox="0 0 1200 56"
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height: 56 }}
          >
            <path d="M0,28 C300,56 900,0 1200,28 L1200,56 L0,56 Z" fill={C.teal} />
          </svg>
        </div>
      </section>

      {/* ================================================================
          2. STATS BAR
          ================================================================ */}
      <section
        ref={statsRef}
        style={{
          background: C.teal,
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
            { num: `${animalsFixed.toLocaleString()}+`, label: t('bePawsitive.statsAnimalsFixed') },
            { num: `${vaccinated.toLocaleString()}+`, label: t('bePawsitive.statsVaccinated') },
            { num: String(eventsCount), label: t('bePawsitive.statsAnnualEvents') },
            { num: String(locationsCount), label: t('bePawsitive.statsLocations'), sub: t('bePawsitive.statsSub') },
          ].map((s, i) => (
            <FadeCard key={s.label} delay={i * 120} from="up">
              <div
                style={{
                  fontFamily: BEBAS,
                  fontSize: 52,
                  color: 'white',
                  lineHeight: 1,
                  letterSpacing: '0.02em',
                  textAlign: 'center',
                }}
              >
                {s.num}
              </div>
              <div
                style={{
                  fontFamily: NUNITO,
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'rgba(255,255,255,0.7)',
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {s.label}
              </div>
              {s.sub && (
                <div
                  style={{
                    fontFamily: NUNITO,
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.5)',
                    marginTop: 3,
                    textAlign: 'center',
                  }}
                >
                  {s.sub}
                </div>
              )}
            </FadeCard>
          ))}
        </div>
      </section>

      {/* ================================================================
          3. ABOUT BE PAWSITIVE
          ================================================================ */}
      <section
        style={{
          background: C.cream,
          padding: isMobile ? '64px 20px 34px' : '80px 48px 42px',
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
          {/* Photo column */}
          {!isMobile && (
            <div ref={photoColRef} style={{ flex: '0 0 auto', width: 320, display: 'flex', flexDirection: 'column', gap: 12, ...photoColAnim }}>
              {/* Large top photo — fixed height */}
              <div
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  height: 230,
                  flexShrink: 0,
                  boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
                }}
              >
                <img
                  src={runPhoto1}
                  alt="Be Pawsitive vet team at work"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>

              {/* Row 1 — fills remaining space equally */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
                {[runPhoto2, runPhoto3].map((src, i) => (
                  <div
                    key={i}
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
                    }}
                  >
                    <img
                      src={src}
                      alt={`Be Pawsitive event photo ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                ))}
              </div>

              {/* Row 2 — Nadine + runner dabbing, fills remaining space equally */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
                {[
                  { src: nadinePhoto, alt: 'Nadine Lustre at the Be Pawsitive Fun Run' },
                  { src: runnerDabbingPhoto, alt: 'Runner dabbing at the finish line' },
                ].map(({ src, alt }) => (
                  <div
                    key={alt}
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
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
            <SectionEyebrow text={t('bePawsitive.aboutEyebrow')} />
            <h2
              style={{
                fontFamily: PACIFICO,
                fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                color: C.navy,
                fontWeight: 400,
                lineHeight: 1.25,
                marginBottom: 24,
              }}
            >
              {t('bePawsitive.aboutHeading')}
            </h2>

            <p
              style={{
                fontFamily: NUNITO,
                fontSize: 15,
                lineHeight: 1.8,
                color: C.text,
                marginBottom: 18,
              }}
            >
              {t('bePawsitive.aboutBody1')}
            </p>

            {/* Pull quote */}
            <blockquote
              style={{
                borderLeft: `4px solid ${C.amber}`,
                borderRadius: '0 12px 12px 0',
                background: C.amberBg,
                padding: '16px 20px',
                margin: '0 0 18px',
                fontFamily: NUNITO,
                fontSize: 15,
                fontStyle: 'italic',
                color: C.text,
                lineHeight: 1.7,
              }}
            >
              {t('bePawsitive.aboutQuote')}
            </blockquote>

            <p
              style={{
                fontFamily: NUNITO,
                fontSize: 15,
                lineHeight: 1.8,
                color: C.text,
                marginBottom: 32,
              }}
            >
              {t('bePawsitive.aboutBody2')}
            </p>

            {/* Programme cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                gap: 12,
              }}
            >
              {[
                { Icon: IconStethoscope, title: t('bePawsitive.progSpayTitle'), desc: t('bePawsitive.progSpayDesc') },
                { Icon: IconSyringe, title: t('bePawsitive.progVaxTitle'), desc: t('bePawsitive.progVaxDesc') },
                { Icon: IconHouseCommunity, title: t('bePawsitive.progCommunityTitle'), desc: t('bePawsitive.progCommunityDesc') },
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
                    boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: C.amberBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 12,
                      color: C.navy,
                    }}
                  >
                    <IconCmp size={22} />
                  </div>
                  <div
                    style={{
                      fontFamily: NUNITO,
                      fontSize: 14,
                      fontWeight: 800,
                      color: C.navy,
                      marginBottom: 6,
                    }}
                  >
                    {card.title}
                  </div>
                  <div
                    style={{
                      fontFamily: NUNITO,
                      fontSize: 13,
                      color: C.muted,
                      lineHeight: 1.65,
                    }}
                  >
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
          4. ANIMAL PARADE DIVIDER
          ================================================================ */}
      <div style={{ background: C.cream, paddingBottom: 16 }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: isMobile ? 'center' : 'space-around',
            flexWrap: isMobile ? 'wrap' : 'nowrap',
            gap: isMobile ? 4 : 0,
            rowGap: isMobile ? 2 : 0,
            padding: isMobile ? '5px 8px 0' : '5px 32px 0',
          }}
        >
          {paradeItems.map((item, i) => (
            <img
              key={i}
              src={item.src}
              alt=""
              aria-hidden="true"
              className={`bp-float-${i}`}
              style={{
                height: isMobile ? Math.round(item.height * 0.5) : item.height,
                width: 'auto',
                display: 'block',
                mixBlendMode: item.blend ? 'multiply' : 'normal',
              }}
            />
          ))}
        </div>
      </div>

      {/* ================================================================
          5. AQUAFLASK × BE PAWSITIVE RUN 2026
          ================================================================ */}
      <section id="fun-run" style={{ background: C.navy, padding: secPad, color: 'white' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Section header row — text left, collab logos right */}
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: 32,
              marginBottom: 48,
            }}
          >
            {/* Left: dateline + headline + sub-copy */}
            <div ref={funRunHeaderRef} style={{ flex: 1, minWidth: 0, ...funRunHeaderAnim }}>
              {/* Dateline with decorative lines (lines hidden on narrow viewports — nowrap would overflow) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  marginBottom: 20,
                  justifyContent: isMobile ? 'center' : 'flex-start',
                }}
              >
                {!isMobile && <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.2)' }} />}
                <span
                  style={{
                    fontFamily: BEBAS,
                    fontSize: isMobile ? 12 : 14,
                    color: C.amberLight,
                    letterSpacing: isMobile ? '0.12em' : '0.25em',
                    whiteSpace: isMobile ? 'normal' : 'nowrap',
                    textAlign: isMobile ? 'center' : 'left',
                    lineHeight: 1.35,
                  }}
                >
                  {t('bePawsitive.annualEventDateline')}
                </span>
                {!isMobile && <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.2)' }} />}
              </div>

              {/* Bebas Neue headline */}
              <h2
                style={{
                  fontFamily: BEBAS,
                  fontSize: 'clamp(3rem, 6vw, 5.5rem)',
                  lineHeight: 0.95,
                  color: 'white',
                  marginBottom: 20,
                  letterSpacing: '0.02em',
                }}
              >
                AquaFlask{' '}
                <span style={{ color: C.amber }}>×</span>
                <br />
                Be Pawsitive
                <br />
                Run 2026
              </h2>

              <p
                style={{
                  fontFamily: NUNITO,
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: 'rgba(255,255,255,0.7)',
                  maxWidth: 560,
                  margin: 0,
                }}
              >
                {t('bePawsitive.funRunDesc')}
              </p>
            </div>

            {/* Right: two logo cards with × between */}
            {!isMobile && (
              <div
                ref={logoBadgeRef}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  ...logoBadgeAnim,
                }}
              >
                <div
                  style={{
                    width: 200,
                    height: 200,
                    borderRadius: 20,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={aquaFlaskLogo}
                    alt="AquaFlask"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>

                <span
                  style={{
                    fontFamily: BEBAS,
                    fontSize: 48,
                    color: C.amber,
                    lineHeight: 1,
                    userSelect: 'none',
                    flexShrink: 0,
                  }}
                >
                  ×
                </span>

                <div
                  style={{
                    width: 200,
                    height: 200,
                    borderRadius: 20,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={bpIconLogo}
                    alt="Be Pawsitive"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Two-column grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr',
              gap: 40,
              alignItems: 'start',
            }}
          >
            {/* LEFT — Event detail cards */}
            <div>
              {/* When & Where */}
              <div
                ref={whenWhereRef}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: 16,
                  padding: '20px 24px',
                  marginBottom: 12,
                  ...whenWhereAnim,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <IconClock size={15} />
                  <span
                    style={{
                      fontFamily: NUNITO,
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {t('bePawsitive.whenWhere')}
                  </span>
                </div>
                {[
                  [t('bePawsitive.eventDetailDate'), t('bePawsitive.eventDetailDateVal')],
                  [t('bePawsitive.eventDetailStart'), t('bePawsitive.eventDetailStartVal')],
                  [t('bePawsitive.eventDetail5kStart'), t('bePawsitive.eventDetail5kStartVal')],
                  [t('bePawsitive.eventDetail10kStart'), t('bePawsitive.eventDetail10kStartVal')],
                  [t('bePawsitive.eventDetailPacket'), t('bePawsitive.eventDetailPacketVal')],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      padding: '5px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      fontFamily: NUNITO,
                      fontSize: 14,
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>{k}</span>
                    <span style={{ color: 'white', fontWeight: 600, textAlign: 'right', maxWidth: '55%' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Registration Fees */}
              <div
                ref={regFeesRef}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: 16,
                  padding: '20px 24px',
                  marginBottom: 20,
                  ...regFeesAnim,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <IconTicket size={15} />
                  <span
                    style={{
                      fontFamily: NUNITO,
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {t('bePawsitive.registrationFees')}
                  </span>
                </div>
                {[
                  { dist: '5K', amount: '1,200' },
                  { dist: '10K', amount: '1,500' },
                ].map(({ dist, amount }) => (
                  <div
                    key={dist}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '5px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      fontFamily: NUNITO,
                      fontSize: 14,
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>{dist}</span>
                    <span style={{ color: 'white', fontWeight: 700 }}><PesoSign />{amount}</span>
                  </div>
                ))}
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: NUNITO,
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.5)',
                    lineHeight: 1.6,
                  }}
                >
                  {t('bePawsitive.cashReg')}
                </div>
              </div>

              {/* Register CTA */}
              <a
                ref={registerBtnRef as unknown as React.RefObject<HTMLAnchorElement>}
                href="https://raceroster.com/events/2026/116269/aquaflask-be-pawsitive-run-2026"
                target="_blank"
                rel="noopener noreferrer"
                className="bp-primary-btn"
                style={{
                  display: 'flex',
                  ...registerBtnAnim,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'center',
                  background: C.amber,
                  color: 'white',
                  padding: '18px 24px',
                  borderRadius: 12,
                  fontFamily: NUNITO,
                  fontSize: 18,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  textDecoration: 'none',
                  boxShadow: '0 4px 12px rgba(252,188,90,0.4)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  boxSizing: 'border-box',
                }}
              >
                <IconBolt size={20} /> {t('bePawsitive.registerNow')}
              </a>
            </div>

            {/* RIGHT — Stats + photo grid */}
            <div>
              {/* Prev-year stat pills */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {[
                  { num: '453+', label: t('bePawsitive.funRun2025'), pesoPrefix: false },
                  { num: '307+', label: t('bePawsitive.funRun2024'), pesoPrefix: false },
                  { num: '488K', label: t('bePawsitive.raised2024'), pesoPrefix: true },
                ].map((s, i) => (
                  <FadeCard
                    key={s.label}
                    delay={i * 80}
                    from="up"
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      backdropFilter: 'blur(4px)',
                      borderRadius: 12,
                      padding: '14px 10px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: BEBAS,
                        fontSize: 28,
                        color: 'white',
                        lineHeight: 1,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {s.pesoPrefix && <PesoSign style={{ height: '0.75em', verticalAlign: '-0.05em' }} />}{s.num}
                    </div>
                    <div
                      style={{
                        fontFamily: NUNITO,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'rgba(255,255,255,0.55)',
                        marginTop: 4,
                      }}
                    >
                      {s.label}
                    </div>
                  </FadeCard>
                ))}
              </div>

              {/* Photo grid — first cell spans 2 cols */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <FadeCard delay={0} from="scale" style={{ gridColumn: 'span 2', borderRadius: 12, overflow: 'hidden', height: 220 }}>
                  <img
                    src={runPhoto4}
                    alt="Fun Run 2025 — main event"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </FadeCard>
                <FadeCard delay={80} from="scale" style={{ borderRadius: 12, overflow: 'hidden', height: 220 }}>
                  <img
                    src={runPhoto5}
                    alt="Fun Run 2025"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </FadeCard>
                {[runPhoto6, runPhoto7, runPhoto8].map((src, i) => (
                  <FadeCard key={i} delay={(i + 2) * 80} from="scale" style={{ borderRadius: 12, overflow: 'hidden', height: 110 }}>
                    <img
                      src={src}
                      alt={`Fun Run 2025 photo ${i + 2}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </FadeCard>
                ))}
              </div>

              {/* Ambassador strip */}
              <div
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.12)',
                  paddingTop: 14,
                  display: 'flex',
                  alignItems: isMobile ? 'stretch' : 'center',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: isMobile ? 12 : 12,
                  flexWrap: isMobile ? 'nowrap' : 'wrap',
                }}
              >
                <span
                  style={{
                    fontFamily: NUNITO,
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: 'rgba(255,255,255,0.45)',
                    marginRight: isMobile ? 0 : 4,
                  }}
                >
                  Official Ambassadors
                </span>
                {isMobile ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 10,
                      width: '100%',
                    }}
                  >
                    <AmbassadorPill name="Nadine Lustre" />
                    <AmbassadorPill name="Christophe Bariou" />
                  </div>
                ) : (
                  ['Nadine Lustre', 'Christophe Bariou'].map((name) => (
                    <AmbassadorPill key={name} name={name} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          5b. THE ROUTE
          ================================================================ */}
      <section style={{ background: '#162f47', padding: secPad, color: 'white' }}>
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 36 : 64,
            alignItems: 'center',
          }}
        >
          {/* Left — copy */}
          <div ref={routeTextRef} style={{ flex: 1, minWidth: 0, ...routeTextAnim }}>
            <SectionEyebrow text={t('bePawsitive.theRoute')} color={C.amberLight} />
            <h3
              style={{
                fontFamily: BEBAS,
                fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                color: 'white',
                letterSpacing: '0.03em',
                lineHeight: 1,
                marginBottom: 20,
              }}
            >
              {t('bePawsitive.twoDistances')}
            </h3>
            <p
              style={{
                fontFamily: NUNITO,
                fontSize: 15,
                lineHeight: 1.8,
                color: 'rgba(255,255,255,0.7)',
                marginBottom: 28,
              }}
            >
              {t('bePawsitive.routeDesc')}
            </p>

            {[
              {
                label: '5KM',
                title: t('bePawsitive.route5kTitle'),
                desc: t('bePawsitive.route5kDesc'),
              },
              {
                label: '10KM',
                title: t('bePawsitive.route10kTitle'),
                desc: t('bePawsitive.route10kDesc'),
              },
            ].map((d, i) => (
              <FadeCard
                key={d.label}
                delay={i * 120}
                from="up"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 16,
                  padding: '16px 20px',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div
                    style={{
                      fontFamily: BEBAS,
                      fontSize: 28,
                      color: C.amber,
                      letterSpacing: '0.06em',
                      lineHeight: 1.1,
                      flexShrink: 0,
                      minWidth: 56,
                    }}
                  >
                    {d.label}
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: NUNITO,
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'white',
                        marginBottom: 4,
                      }}
                    >
                      {d.title}
                    </div>
                    <div
                      style={{
                        fontFamily: NUNITO,
                        fontSize: 13,
                        color: 'rgba(255,255,255,0.6)',
                        lineHeight: 1.65,
                      }}
                    >
                      {d.desc}
                    </div>
                  </div>
                </div>
              </FadeCard>
            ))}
          </div>

          {/* Right — road map image */}
          <div
            ref={routeMapRef}
            style={{
              flexShrink: 0,
              width: isMobile ? '100%' : 380,
              ...routeMapAnim,
            }}
          >
            <img
              src={roadMapImg}
              alt="AquaFlask × Be Pawsitive Run 2026 route map"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                borderRadius: 20,
                boxShadow: '0 4px 32px rgba(0,0,0,0.35)',
              }}
            />
          </div>
        </div>
      </section>

      {/* ================================================================
          6. EVERY RENTAL WAGS A TAIL
          ================================================================ */}
      <section
        id="lolas-contribution"
        style={{ background: '#e8f2ef', padding: secPad, paddingBottom: isMobile ? 'calc(64px + 2rem)' : 'calc(80px + 2rem)', marginBottom: '-2rem' }}
      >
        <div
          ref={donationRef}
          style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}
        >
          <div ref={commitHeadRef} style={commitHeadAnim}>
            <SectionEyebrow text={t('bePawsitive.ourCommitment')} color={C.navy} centered />
            <h2
              style={{
                fontFamily: PACIFICO,
                fontSize: 'clamp(1.8rem, 3.5vw, 3rem)',
                color: C.navy,
                fontWeight: 400,
                lineHeight: 1.2,
                marginBottom: 20,
              }}
            >
              {t('bePawsitive.commitmentHeading')}
            </h2>
          </div>
          <p
            style={{
              fontFamily: NUNITO,
              fontSize: 15,
              lineHeight: 1.8,
              color: C.text,
              maxWidth: 600,
              margin: '0 auto 40px',
            }}
          >
            {t('bePawsitive.commitmentDesc')}
          </p>

          {/* How-it-works cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: 14,
              marginBottom: 36,
              textAlign: 'left',
            }}
          >
            {[
              {
                n: 1,
                title: t('bePawsitive.card1Title'),
                desc: t('bePawsitive.card1Desc'),
              },
              {
                n: 2,
                title: t('bePawsitive.card2Title'),
                desc: t('bePawsitive.card2Desc'),
              },
              {
                n: 3,
                title: t('bePawsitive.card3Title'),
                desc: t('bePawsitive.card3Desc'),
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
                  boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: C.bpBlue,
                    color: 'white',
                    fontFamily: NUNITO,
                    fontSize: 15,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  {c.n}
                </div>
                <div
                  style={{
                    fontFamily: NUNITO,
                    fontSize: 14,
                    fontWeight: 800,
                    color: C.navy,
                    marginBottom: 6,
                  }}
                >
                  {c.title}
                </div>
                <div
                  style={{
                    fontFamily: NUNITO,
                    fontSize: 15,
                    color: C.muted,
                    lineHeight: 1.65,
                  }}
                >
                  {c.desc}
                </div>
              </FadeCard>
            ))}
          </div>

          {/* Donation counter */}
          <div
            ref={donorCtrRef}
            style={{
              background: C.bpBlue,
              borderRadius: 20,
              padding: isMobile ? '28px 24px' : '32px 40px',
              display: 'inline-block',
              minWidth: isMobile ? 'auto' : 360,
              marginBottom: 36,
              boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
              ...donorCtrAnim,
            }}
          >
            <div
              style={{
                fontFamily: NUNITO,
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'rgba(255,255,255,0.6)',
                marginBottom: 10,
              }}
            >
              {t('bePawsitive.totalDonated')}
            </div>
            <div
              style={{
                fontFamily: BEBAS,
                fontSize: 'clamp(4rem, 7vw, 5.5rem)',
                color: 'white',
                lineHeight: 1,
                letterSpacing: '0.02em',
              }}
            >
              <PesoSign style={{ color: C.amberLight, height: '0.7em', verticalAlign: '-0.05em' }} />
              {donation.toLocaleString()}
            </div>
            <div
              style={{
                fontFamily: NUNITO,
                fontSize: 12,
                color: 'rgba(255,255,255,0.5)',
                marginTop: 8,
              }}
            >
              {t('bePawsitive.andCounting')}
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/paw-card/partners"
              className="bp-primary-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: C.amber,
                color: 'white',
                padding: '13px 26px',
                borderRadius: 12,
                fontFamily: NUNITO,
                fontSize: 14,
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(232,160,32,0.35)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
            >
              🐾 {t('bePawsitive.pawCardLogin')}
            </Link>
            <a
              href="https://www.be-pawsitive.org/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="bp-navy-btn"
              style={{
                display: 'inline-block',
                background: 'transparent',
                color: C.navy,
                border: `1.5px solid ${C.navy}`,
                padding: '13px 26px',
                borderRadius: 12,
                fontFamily: NUNITO,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'transform 0.15s',
              }}
            >
              {t('bePawsitive.donateDirectly')}
            </a>
          </div>
        </div>
      </section>

    </PageLayout>
  );
}
