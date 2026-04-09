import { useEffect, useRef, useState } from 'react';
import { FadeUpSection } from '../public/FadeUpSection.js';
import lolasLogo from '../../assets/Lolas Original Logo.svg';
import bePawsitiveLogo from '../../assets/Be Pawsitive (blue).svg';
import CountUp from '../home/CountUp.js';

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
    }, 7000);
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

// ─── Animal impact counters ──────────────────────────────────────────────────

function AnimalCounters() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 'clamp(32px, 8vw, 80px)',
        flexWrap: 'wrap',
        marginTop: 28,
      }}
    >
      {/* Counter 1 — Fixed */}
      <div style={{ textAlign: 'center' }}>
        <CountUp
          from={0}
          to={1120}
          separator=","
          direction="up"
          duration={2}
          startWhen={true}
          className="count-up-text"
        />
        <p
          className="font-lato"
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#00577C',
            fontWeight: 700,
            marginTop: 8,
          }}
        >
          Animals Fixed
        </p>
      </div>

      {/* Divider */}
      <div
        aria-hidden="true"
        style={{
          width: 1,
          alignSelf: 'stretch',
          backgroundColor: 'rgba(0,87,124,0.2)',
          flexShrink: 0,
          minHeight: 60,
        }}
      />

      {/* Counter 2 — Vaccinated */}
      <div style={{ textAlign: 'center' }}>
        <CountUp
          from={0}
          to={2023}
          separator=","
          direction="up"
          duration={2}
          startWhen={true}
          className="count-up-text"
        />
        <p
          className="font-lato"
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#00577C',
            fontWeight: 700,
            marginTop: 8,
          }}
        >
          Animals Vaccinated
        </p>
      </div>
    </div>
  );
}

// Dynamically import every image in the Be Pawsitive Gallery folder at build time.
// Vite resolves static-asset imports to their hashed URL strings.
const rawModules = import.meta.glob('../../assets/About Us Page/Be Pawsitive Gallery/*', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

// Sort by filename for a consistent, alphabetical order across builds.
// Keep the path key alongside the URL so caption overrides can match by filename.
// Exclude images used elsewhere on the page so they don't appear twice.
const GALLERY_EXCLUDE = new Set(['Lola_Claire_tuktuk.jpeg', 'group_pic.jpeg']);

const galleryEntries: Array<{ key: string; url: string }> = Object.entries(rawModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, url]) => ({ key, url }))
  .filter(({ key }) => {
    const filename = key.split('/').pop() ?? '';
    return !GALLERY_EXCLUDE.has(filename);
  });

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
  alt: string;
}

function GalleryItem({ src, alt }: GalleryItemProps) {
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
          alt={alt}
          loading="lazy"
          decoding="async"
          className="block w-full object-cover transition-transform duration-[3000ms] ease-out group-hover:scale-[1.03]"
        />
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
            {/* Full-width logo lockup — same as home: stacked × under Lola on narrow screens */}
            <div className="mb-10 flex flex-col items-center justify-center gap-1 lg:mb-12 lg:flex-row lg:gap-5">
              <div className="flex flex-col items-center gap-1">
                <img src={lolasLogo} alt="Lola's Rentals" style={{ height: 68, width: 'auto' }} />
                <span
                  className="leading-none lg:hidden"
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: '#363737',
                    opacity: 0.4,
                    fontFamily: 'Lato, sans-serif',
                  }}
                >
                  ×
                </span>
              </div>
              <span
                className="hidden leading-none lg:inline"
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: '#363737',
                  opacity: 0.4,
                  fontFamily: 'Lato, sans-serif',
                }}
              >
                ×
              </span>
              <img src={bePawsitiveLogo} alt="Be Pawsitive" style={{ height: 76, width: 'auto' }} />
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

            {/* Animal impact counters */}
            <AnimalCounters />
          </div>
        </section>
      </FadeUpSection>

      {/* Full-bleed, edge-to-edge masonry grid */}
      <div
        className="columns-2 md:columns-3 lg:columns-4"
        style={{ columnGap: 2, backgroundColor: '#111' }}
      >
        {galleryEntries.map(({ key, url }, i) => (
          <GalleryItem key={url} src={url} alt={captionFor(key, i)} />
        ))}
      </div>
    </>
  );
}
