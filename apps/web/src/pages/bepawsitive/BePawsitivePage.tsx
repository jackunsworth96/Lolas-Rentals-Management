import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import runPhoto1 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092746.png';
import runPhoto2 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092806.png';
import runPhoto3 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092829.png';
import runPhoto4 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092847.png';
import runPhoto5 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092902.png';
import runPhoto6 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092926.png';
import runPhoto7 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092945.png';
import runPhoto8 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 092959.png';
import runPhoto9 from '../../assets/Be Pawsitive/Run 2025/Screenshot 2026-04-13 093428.png';

// ---------------------------------------------------------------------------
// CountUp hook — animates a number from 0 → target when trigger flips true
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
// Font shorthands (Tailwind v3 does not emit CSS vars for font families)
// ---------------------------------------------------------------------------
const FONT_HEADLINE = '"Alegreya Sans", ui-sans-serif, system-ui, sans-serif';
const FONT_BODY = 'Lato, Nunito, sans-serif';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function BePawsitivePage() {
  const [statsInView, setStatsInView] = useState(false);
  const [donationInView, setDonationInView] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  const statsRef = useRef<HTMLDivElement>(null);
  const donationRef = useRef<HTMLDivElement>(null);

  // Responsive breakpoint listener
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // IntersectionObserver — stats strip (section 2)
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // IntersectionObserver — donation counter (section 5)
  useEffect(() => {
    const el = donationRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDonationInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // CountUp values
  const animalsFixed = useCountUp(1601, 1800, statsInView);
  const vaccinated = useCountUp(2746, 1800, statsInView);
  const eventsCount = useCountUp(4, 1200, statsInView);
  const locationsCount = useCountUp(2, 1000, statsInView);
  const donation = useCountUp(282995, 2200, donationInView);

  const sectionPad = isMobile ? '48px 20px' : '80px 24px';
  const stripPad = isMobile ? '48px 20px' : '48px 24px';

  // ── Shared label style for stat strips ──────────────────────────────────
  const statLabelStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    color: 'rgba(255,255,255,0.88)',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontFamily: FONT_BODY,
  };
  const statNumStyle: React.CSSProperties = {
    fontFamily: FONT_HEADLINE,
    fontSize: 'clamp(2.4rem, 4vw, 3.2rem)',
    color: 'white',
    fontWeight: 700,
    lineHeight: 1,
  };

  return (
    <PageLayout fullBleed title="Be Pawsitive | Lola's Rentals">
      <SEO
        title="Be Pawsitive — Lola's Rentals x Siargao Animal Welfare"
        description="Every rental at Lola's supports Be Pawsitive, Siargao's animal welfare NGO. Spaying, neutering and vaccinating street animals on the island. Join the movement."
        canonical="/book/bepawsitive"
      />

      {/* ================================================================
          SECTION 1 — HERO
          ================================================================ */}
      <section
        style={{
          minHeight: '60vh',
          background: 'linear-gradient(135deg, #397dbe 0%, #2d6aa8 60%, #1a4f8a 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: sectionPad,
        }}
      >
        {/* Collab badge */}
        <span
          style={{
            display: 'inline-block',
            border: '1px solid rgba(255,255,255,0.4)',
            padding: '6px 16px',
            borderRadius: 100,
            fontSize: 13,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'white',
            marginBottom: 24,
            fontFamily: FONT_BODY,
          }}
        >
          Lola&apos;s Rentals × Be Pawsitive
        </span>

        <h1
          style={{
            fontFamily: FONT_HEADLINE,
            fontSize: 'clamp(2.2rem, 5vw, 3.8rem)',
            color: 'white',
            marginBottom: 20,
            lineHeight: 1.15,
            maxWidth: 720,
          }}
        >
          Running for a Pawsitive Future
        </h1>

        <p
          style={{
            fontFamily: FONT_BODY,
            fontSize: 'clamp(1rem, 2vw, 1.2rem)',
            maxWidth: 640,
            margin: '0 auto 36px',
            lineHeight: 1.7,
            opacity: 0.92,
            color: 'white',
          }}
        >
          Be Pawsitive is a Siargao-based animal welfare organisation dedicated to spaying, neutering,
          and vaccinating street animals across the island. Every rental booked with Lola&apos;s helps
          fund their life-changing work.
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="https://raceroster.com/events/2026/116269/aquaflask-be-pawsitive-run-2026"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#72b36d',
              color: 'white',
              padding: '14px 28px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: '1rem',
              textDecoration: 'none',
              fontFamily: FONT_BODY,
            }}
          >
            Register for the Fun Run
          </a>
          <a
            href="#lolas-contribution"
            style={{
              background: 'transparent',
              color: 'white',
              border: '2px solid white',
              padding: '14px 28px',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: '1rem',
              textDecoration: 'none',
              fontFamily: FONT_BODY,
            }}
          >
            How Lola&apos;s Contributes
          </a>
        </div>
      </section>

      {/* ================================================================
          SECTION 2 — IMPACT STATS STRIP
          ================================================================ */}
      <section
        ref={statsRef}
        style={{
          background: '#72b36d',
          padding: stripPad,
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 48,
        }}
      >
        {/* Animals Fixed */}
        <div style={{ textAlign: 'center' }}>
          <div style={statNumStyle}>{animalsFixed.toLocaleString()}+</div>
          <div style={statLabelStyle}>Animals Fixed</div>
        </div>

        {/* Vaccinated */}
        <div style={{ textAlign: 'center' }}>
          <div style={statNumStyle}>{vaccinated.toLocaleString()}+</div>
          <div style={statLabelStyle}>Vaccinated</div>
        </div>

        {/* Annual Events */}
        <div style={{ textAlign: 'center' }}>
          <div style={statNumStyle}>{eventsCount}</div>
          <div style={statLabelStyle}>Annual Events</div>
        </div>

        {/* Locations */}
        <div style={{ textAlign: 'center' }}>
          <div style={statNumStyle}>{locationsCount}</div>
          <div style={statLabelStyle}>Locations in 2026</div>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.7)',
              marginTop: 4,
              fontFamily: FONT_BODY,
            }}
          >
            Santa Fe &amp; Dapa
          </div>
        </div>
      </section>

      {/* ================================================================
          SECTION 3 — MISSION STORY
          ================================================================ */}
      <section style={{ background: '#f1e6d6', padding: sectionPad }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'left' }}>
          <p
            style={{
              color: '#397dbe',
              fontSize: '0.85rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 12,
              fontFamily: FONT_BODY,
            }}
          >
            About Be Pawsitive
          </p>
          <h2
            style={{
              fontFamily: FONT_HEADLINE,
              fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
              color: '#397dbe',
              marginBottom: 24,
              lineHeight: 1.2,
            }}
          >
            Every Animal Deserves a Chance
          </h2>

          {[
            `Be Pawsitive is a SEC-registered animal welfare organisation based on Siargao Island, Philippines. Founded on a simple belief — that every stray animal deserves love, care, and a healthy life — the organisation runs spay, neuter, and vaccination programmes across the island to control the stray population and prevent unnecessary suffering.`,
            `Each year, Be Pawsitive hosts free spay and neuter events in partnership with volunteer veterinarians, reaching communities across Siargao. Their most recent event in March 2026, held across Santa Fe and Dapa, saw 481 animals fixed and 723 vaccinated — making it one of their biggest events yet. The impact compounds: every animal spayed or neutered prevents hundreds of future strays from entering the cycle.`,
            `Lola's Rentals has been a proud sponsor of Be Pawsitive since the beginning. It's why Lola herself — our rescue, now pampered pooch — is at the heart of everything we do. And it's why every vehicle in our fleet is named after an animal that's been through the programme.`,
          ].map((para, i) => (
            <p
              key={i}
              style={{
                color: '#363737',
                lineHeight: 1.8,
                fontSize: '1.05rem',
                marginBottom: 20,
                fontFamily: FONT_BODY,
              }}
            >
              {para}
            </p>
          ))}
        </div>
      </section>

      {/* ================================================================
          SECTION 4 — AQUAFLASK FUN RUN
          ================================================================ */}
      <section id="fun-run" style={{ background: '#397dbe', padding: sectionPad, color: 'white' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          {/* Event badge */}
          <span
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              padding: '6px 16px',
              borderRadius: 100,
              fontSize: '0.8rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              display: 'inline-block',
              marginBottom: 24,
              fontFamily: FONT_BODY,
            }}
          >
            Annual Event · June 7, 2026
          </span>

          <h2
            style={{
              fontFamily: FONT_HEADLINE,
              fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
              color: 'white',
              marginBottom: 16,
              lineHeight: 1.2,
            }}
          >
            AquaFlask × Be Pawsitive Run 2026
          </h2>

          <p
            style={{
              fontFamily: FONT_BODY,
              fontSize: '1.05rem',
              lineHeight: 1.7,
              maxWidth: 680,
              opacity: 0.92,
              marginBottom: 48,
            }}
          >
            Siargao&apos;s most exciting charity run returns for its third year. Lace up, hit the
            road, and run for the animals. Join us on June 7th at Harana Surf Resort — with Nadine
            Lustre &amp; Christophe Bariou as official ambassadors.
          </p>

          {/* Two-column layout */}
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 48,
              alignItems: 'flex-start',
            }}
          >
            {/* ── LEFT: Event detail cards ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Card 1 — When & Where */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  padding: 24,
                  marginBottom: 16,
                  fontFamily: FONT_BODY,
                }}
              >
                <h3
                  style={{
                    fontFamily: FONT_HEADLINE,
                    fontSize: '1.15rem',
                    marginBottom: 12,
                    color: 'white',
                  }}
                >
                  When &amp; Where
                </h3>
                {[
                  ['Date', 'Sunday, June 7th 2026'],
                  ['Start Line', 'Harana Surf Resort'],
                  ['5K Start', '5:40 AM'],
                  ['10K Start', '5:30 AM'],
                ].map(([label, value]) => (
                  <p key={label} style={{ margin: '4px 0', fontSize: '0.95rem', opacity: 0.9 }}>
                    <strong>{label}:</strong> {value}
                  </p>
                ))}
                <p style={{ margin: '8px 0 4px', fontSize: '0.95rem', opacity: 0.9 }}>
                  <strong>Packet Pick-up:</strong> June 5th &amp; 6th, 10AM–4PM
                </p>
                <p style={{ margin: '4px 0', fontSize: '0.9rem', opacity: 0.75 }}>
                  Harana Surf Resort
                </p>
              </div>

              {/* Card 2 — Registration Fees */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  padding: 24,
                  marginBottom: 16,
                  fontFamily: FONT_BODY,
                }}
              >
                <h3
                  style={{
                    fontFamily: FONT_HEADLINE,
                    fontSize: '1.15rem',
                    marginBottom: 12,
                    color: 'white',
                  }}
                >
                  Registration Fees
                </h3>
                <p style={{ margin: '4px 0', fontSize: '1rem', opacity: 0.9 }}>
                  <strong>₱1,200</strong> — 5K
                </p>
                <p style={{ margin: '4px 0', fontSize: '1rem', opacity: 0.9 }}>
                  <strong>₱1,500</strong> — 10K
                </p>
                <p
                  style={{
                    margin: '12px 0 0',
                    fontSize: '0.85rem',
                    opacity: 0.75,
                    lineHeight: 1.6,
                  }}
                >
                  Cash registrations at All About Coco, Lola&apos;s Rentals, or Harana Surf Resort
                </p>
              </div>

              {/* Card 3 — Awards */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  padding: 24,
                  fontFamily: FONT_BODY,
                }}
              >
                <h3
                  style={{
                    fontFamily: FONT_HEADLINE,
                    fontSize: '1.15rem',
                    marginBottom: 12,
                    color: 'white',
                  }}
                >
                  Awards
                </h3>
                <p style={{ margin: 0, fontSize: '0.95rem', opacity: 0.9, lineHeight: 1.6 }}>
                  Top 3 finishers (male &amp; female) in both 5K and 10K categories receive prizes.
                  Plus Instagram story prizes — tag{' '}
                  <strong>@bepawsitive.siargao</strong> for a chance to win!
                </p>
              </div>
            </div>

            {/* ── RIGHT: Runner stats + gallery + CTA ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                style={{
                  fontSize: '1.4rem',
                  fontFamily: FONT_HEADLINE,
                  color: 'white',
                  marginBottom: 24,
                }}
              >
                Join the Movement
              </h3>

              {/* Placeholder runner stats */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                {[
                  { num: '453+', sub: '2025 Fun Run', label: 'Runners' },
                  { num: '307+', sub: '2024 Fun Run', label: 'Runners' },
                  { num: '₱488,000', sub: 'Raised in 2024', label: 'Donated' },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      flex: 1,
                      minWidth: 90,
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: 16,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '1.8rem',
                        fontWeight: 700,
                        fontFamily: FONT_HEADLINE,
                        lineHeight: 1.1,
                        color: 'white',
                      }}
                    >
                      {s.num}
                    </div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        opacity: 0.8,
                        marginTop: 4,
                        fontFamily: FONT_BODY,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'white',
                      }}
                    >
                      {s.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Fun run photos — swap src values when better photos are available */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  marginTop: 16,
                }}
              >
                {[runPhoto1, runPhoto2, runPhoto3, runPhoto4, runPhoto5, runPhoto6, runPhoto7, runPhoto8, runPhoto9].map((src, i) => (
                  <div
                    key={i}
                    style={{
                      borderRadius: 8,
                      overflow: 'hidden',
                      height: 140,
                      background: 'rgba(255,255,255,0.1)',
                    }}
                  >
                    <img
                      src={src}
                      alt={`Siargao fun run 2025 photo ${i + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </div>
                ))}
              </div>

              <a
                href="https://raceroster.com/events/2026/116269/aquaflask-be-pawsitive-run-2026"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#72b36d',
                  color: 'white',
                  padding: '16px 32px',
                  borderRadius: 8,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  display: 'block',
                  textAlign: 'center',
                  marginTop: 32,
                  width: '100%',
                  textDecoration: 'none',
                  fontFamily: FONT_BODY,
                  boxSizing: 'border-box',
                }}
              >
                Register Now — raceroster.com
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          SECTION 5 — LOLA'S CONTRIBUTION
          ================================================================ */}
      <section id="lolas-contribution" style={{ background: 'white', padding: sectionPad }}>
        <div ref={donationRef} style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <p
            style={{
              color: '#397dbe',
              fontSize: '0.85rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 12,
              fontFamily: FONT_BODY,
            }}
          >
            Our Commitment
          </p>
          <h2
            style={{
              fontFamily: FONT_HEADLINE,
              fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
              color: '#363737',
              marginBottom: 24,
              lineHeight: 1.2,
            }}
          >
            Every Rental Wags a Tail
          </h2>
          <p
            style={{
              color: '#363737',
              lineHeight: 1.8,
              fontSize: '1.05rem',
              marginBottom: 40,
              fontFamily: FONT_BODY,
            }}
          >
            Lola&apos;s Rentals matches every peso saved by Paw Card holders at partner
            establishments — peso for peso — as a direct donation to Be Pawsitive. No admin fees, no
            markup. Every centavo goes to funding spay, neuter, and vaccination events across
            Siargao.
          </p>

          {/* Donation counter */}
          <p
            style={{
              fontSize: '0.9rem',
              color: '#666',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
              fontFamily: FONT_BODY,
            }}
          >
            Total Donated to Date
          </p>
          <div
            style={{
              fontFamily: FONT_HEADLINE,
              fontSize: 'clamp(2.8rem, 5vw, 4rem)',
              color: '#397dbe',
              fontWeight: 700,
              lineHeight: 1,
              marginBottom: 12,
            }}
          >
            ₱{donation.toLocaleString()}
          </div>
          <p
            style={{
              color: '#666',
              fontSize: '0.9rem',
              marginBottom: 40,
              fontFamily: FONT_BODY,
            }}
          >
            and counting — updated as our customers keep saving.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/book/paw-card"
              style={{
                background: '#397dbe',
                color: 'white',
                padding: '14px 28px',
                borderRadius: 8,
                fontWeight: 700,
                textDecoration: 'none',
                fontFamily: FONT_BODY,
                fontSize: '1rem',
              }}
            >
              Get Your Paw Card
            </Link>
            <a
              href="https://www.be-pawsitive.org/donate"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'transparent',
                color: '#397dbe',
                border: '2px solid #397dbe',
                padding: '14px 28px',
                borderRadius: 8,
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: FONT_BODY,
                fontSize: '1rem',
              }}
            >
              Donate Directly
            </a>
          </div>
        </div>
      </section>

      {/* ================================================================
          SECTION 6 — FOLLOW BANNER
          ================================================================ */}
      <section
        style={{
          background: 'linear-gradient(135deg, #72b36d, #5a9e55)',
          padding: stripPad,
          textAlign: 'center',
        }}
      >
        <p
          style={{
            color: 'white',
            fontSize: '1.2rem',
            fontWeight: 600,
            marginBottom: 16,
            fontFamily: FONT_BODY,
          }}
        >
          Follow Be Pawsitive on Instagram
        </p>
        <a
          href="https://www.instagram.com/bepawsitive.siargao/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'white',
            fontSize: '1.5rem',
            fontWeight: 700,
            fontFamily: FONT_HEADLINE,
            textDecoration: 'none',
            borderBottom: '2px solid rgba(255,255,255,0.5)',
            paddingBottom: 2,
          }}
        >
          @bepawsitive.siargao
        </a>
      </section>

    </PageLayout>
  );
}
