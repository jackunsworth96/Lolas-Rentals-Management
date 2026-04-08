import { useEffect, useRef, useState } from 'react';
import { FadeUpSection } from '../public/FadeUpSection.js';
import lolaLogo from '../../assets/Hero/logo-lola-rentals-1.svg';
import bePawsitiveLogo from '../../assets/Be Pawsitive (blue).svg';

// ─── Rotating subheadline ────────────────────────────────────────────────────

const SUBHEADLINES = [
  "This is what we're part of. Paws, locals, and a whole lot of heart. 🐾",
  "Every scooter rented, every kilometre ridden — it all adds up to something real.",
  "Together with Be Pawsitive and the Siargao community, we've helped fix over 1,120 animals and vaccinate 2,023 more.",
  'Experts estimate one unspayed dog can produce 67,000 descendants in six years. 1,120 surgeries prevents a cycle before it starts.',
  'This is why we do what we do. This is what your rental supports.',
];

function RotatingSubheadline() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % SUBHEADLINES.length);
        setVisible(true);
      }, 360);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ minHeight: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p
        className="font-lato"
        style={{
          fontSize: 16,
          color: '#363737',
          lineHeight: 1.65,
          textAlign: 'center',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(7px)',
          transition: 'opacity 0.36s ease, transform 0.36s ease',
        }}
      >
        {SUBHEADLINES[idx]}
      </p>
    </div>
  );
}

// ─── Stats carousel ──────────────────────────────────────────────────────────

const STATS: Array<{ emoji: string; bold: string; rest: string }> = [
  { emoji: '🐾', bold: '1,120 animals', rest: 'spayed or neutered through Be Pawsitive' },
  { emoji: '💉', bold: '2,023 animals', rest: 'vaccinated across Siargao' },
  { emoji: '🐕', bold: 'Hundreds of thousands', rest: 'of future strays potentially prevented' },
  { emoji: '❤️', bold: '₱300,000+', rest: 'contributed to animal welfare on the island' },
  {
    emoji: '🤝',
    bold: 'Every rental you book',
    rest: 'helps fund spay, neuter & vaccination programs right here on Siargao',
  },
];

function StatsCarousel() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [dir, setDir] = useState<1 | -1>(1);
  const [paused, setPaused] = useState(false);
  const busy = useRef(false);

  const go = (newIdx: number, direction: 1 | -1) => {
    if (busy.current) return;
    busy.current = true;
    setDir(direction);
    setVisible(false);
    setTimeout(() => {
      setIdx(newIdx);
      setVisible(true);
      busy.current = false;
    }, 230);
  };

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      go((idx + 1) % STATS.length, 1);
    }, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, idx]);

  const goPrev = () => go((idx - 1 + STATS.length) % STATS.length, -1);
  const goNext = () => go((idx + 1) % STATS.length, 1);

  return (
    <div
      style={{ maxWidth: 700, margin: '0 auto' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Thin stat box */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          border: '1.5px solid rgba(0,87,124,0.22)',
          borderRadius: 10,
          backgroundColor: 'rgba(250,246,240,0.85)',
          minHeight: 56,
          padding: '10px 4px',
          gap: 2,
        }}
      >
        {/* Left chevron */}
        <button
          onClick={goPrev}
          aria-label="Previous stat"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 10px',
            color: '#00577C',
            opacity: 0.55,
            flexShrink: 0,
            lineHeight: 0,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.55')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Stat content */}
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'Lato, sans-serif',
            fontSize: 14,
            color: '#363737',
            lineHeight: 1.45,
            padding: '0 6px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateX(0)' : `translateX(${dir * 14}px)`,
            transition: 'opacity 0.23s ease, transform 0.23s ease',
          }}
        >
          <span>{STATS[idx].emoji}</span>
          {' '}
          <strong style={{ fontWeight: 700, color: '#00577C' }}>{STATS[idx].bold}</strong>
          {' '}
          <span style={{ fontWeight: 400 }}>{STATS[idx].rest}</span>
        </div>

        {/* Right chevron */}
        <button
          onClick={goNext}
          aria-label="Next stat"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 10px',
            color: '#00577C',
            opacity: 0.55,
            flexShrink: 0,
            lineHeight: 0,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.55')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Dot indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 12 }}>
        {STATS.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i, i > idx ? 1 : -1)}
            aria-label={`Go to stat ${i + 1}`}
            style={{
              width: i === idx ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === idx ? '#00577C' : 'rgba(0,87,124,0.2)',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'width 0.3s ease, background-color 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Dynamically import every image in the About Us Page folder at build time.
// Vite resolves static-asset imports to their hashed URL strings.
const rawModules = import.meta.glob('../../assets/About Us Page/*', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

// Sort by filename for a consistent, alphabetical order across builds.
// Keep the path key alongside the URL so caption overrides can match by filename.
const galleryEntries: Array<{ key: string; url: string }> = Object.entries(rawModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, url]) => ({ key, url }));

const CAPTIONS = [
  'Every life counts.',
  'A little care goes a long way.',
  "Siargao's strays deserve better.",
  'The community showed up.',
  'Good humans. Happy dogs.',
  'This is why we ride.',
];

// Pin a specific caption to a specific image by its filename.
// All other images fall back to the cycling CAPTIONS array above.
const CAPTION_OVERRIDES: Record<string, string> = {
  'IMG_1342-Migliorato-NR_1.JPG': 'Lola, always vibing.',
};

function captionFor(pathKey: string, index: number): string {
  const filename = pathKey.split('/').pop() ?? '';
  return CAPTION_OVERRIDES[filename] ?? CAPTIONS[index % CAPTIONS.length];
}

// ─── Single gallery item ────────────────────────────────────────────────────

interface GalleryItemProps {
  src: string;
  caption: string;
}

function GalleryItem({ src, caption }: GalleryItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -20px 0px' },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="break-inside-avoid"
      style={{
        marginBottom: 2,
        // Scroll-entry: fade in + slight upward translate
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}
    >
      {/* Overflow hidden on the wrapper so the zoom stays clipped */}
      <div className="group relative overflow-hidden">
        {/* Slow zoom on hover — 3s ease as specified */}
        <img
          src={src}
          alt={caption}
          loading="lazy"
          decoding="async"
          className="block w-full object-cover transition-transform duration-[3000ms] ease-out group-hover:scale-[1.03]"
        />

        {/* Caption overlay: dark gradient fades in from bottom on hover */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0) 100%)',
            padding: '56px 16px 14px',
          }}
        >
          <p className="font-lato text-sm font-semibold tracking-wide text-white">{caption}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Section export ─────────────────────────────────────────────────────────

export function PawsitiveGallery() {
  return (
    <>
      {/* Intro copy block */}
      <FadeUpSection>
        <section style={{ backgroundColor: '#f1e6d6', padding: '72px 5% 64px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
            {/* Collab logo strip — 1.5× scale vs base (h-10 / 140px cap / 22px ×) */}
            <div
              className="flex items-center justify-center"
              style={{ gap: 30, marginBottom: 42 }}
            >
              <img
                src={lolaLogo}
                alt="Lola's Rentals"
                className="h-[60px] w-auto object-contain"
                style={{ maxWidth: 210 }}
              />
              <span
                className="font-headline font-black"
                style={{ fontSize: 33, color: '#363737', opacity: 0.35, lineHeight: 1 }}
              >
                ×
              </span>
              <img
                src={bePawsitiveLogo}
                alt="Be Pawsitive"
                className="h-[60px] w-auto object-contain"
                style={{ maxWidth: 210 }}
              />
            </div>

            <h2
              className="font-headline font-bold"
              style={{
                fontSize: 'clamp(26px, 4vw, 40px)',
                color: '#363737',
                marginBottom: 24,
                lineHeight: 1.2,
              }}
            >
              Paws, Locals &amp; a{' '}
              <span style={{ fontStyle: 'italic', color: '#FCBC5A' }}>Whole Lot of Heart</span>
            </h2>

            {/* Rotating subheadline */}
            <RotatingSubheadline />

            {/* Stats carousel */}
            <div style={{ marginTop: 28 }}>
              <StatsCarousel />
            </div>
          </div>
        </section>
      </FadeUpSection>

      {/* Full-bleed, edge-to-edge masonry grid */}
      <div
        className="columns-2 md:columns-3 lg:columns-4"
        style={{ columnGap: 2, backgroundColor: '#111' }}
      >
        {galleryEntries.map(({ key, url }, i) => (
          <GalleryItem key={url} src={url} caption={captionFor(key, i)} />
        ))}
      </div>
    </>
  );
}
