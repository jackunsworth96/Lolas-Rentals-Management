import { useEffect, useRef, useState } from 'react';
import { FadeUpSection } from '../public/FadeUpSection.js';
import lolasLogo from '../../assets/Lolas Original Logo.svg';
import bePawsitiveLogo from '../../assets/Be Pawsitive (blue).svg';
import CountUp from '../home/CountUp.js';
import { CloudinaryImage } from '../ui/CloudinaryImage.js';

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

const GALLERY_PUBLIC_IDS = [
  'IMG_1088-Migliorato-NR_qnovun', 'IMG_1095-Migliorato-NR_lngzkk',
  'IMG_1072-Migliorato-NR_hocc27', 'IMG_0940-Migliorato-NR_sqegxp',
  'IMG_1412-Migliorato-NR_fg9cxw', 'IMG_0863-Migliorato-NR_njfw2h',
  'IMG_1323-Migliorato-NR_zaamq8', 'IMG_0837-Migliorato-NR_bmpagc',
  'IMG_1373-Migliorato-NR_bhrhbc', 'IMG_1300-Migliorato-NR_v6asei',
  'IMG_0804-Migliorato-NR_ndkjiu', 'IMG_1342-Migliorato-NR_1_ep4zwx',
  'IMG_0857-Migliorato-NR_h9a5zp', 'IMG_1306-Migliorato-NR_pql4fy',
  'IMG_1488-Migliorato-NR_ofwgrq', 'IMG_1214-Migliorato-NR_svkdsa',
  'IMG_0889-Migliorato-NR_nehxln', 'IMG_0961-Migliorato-NR_nd0zcl',
  'IMG_1524-Migliorato-NR_tvvwbz', 'IMG_1451-Migliorato-NR_ev8quy',
  'IMG_0997-Migliorato-NR_kzlmi1', 'IMG_1502-Migliorato-NR_n0gcl8',
  'IMG_0924-Migliorato-NR_otiluk', 'IMG_1405-Migliorato-NR_bpbesd',
  'IMG_1329-Migliorato-NR_cm3ttb', 'IMG_1636-Migliorato-NR_obhaxu',
  'IMG_1208-Migliorato-NR_kt7jul', 'IMG_1353-Migliorato-NR_1_j9fzkr',
  'IMG_1523-Migliorato-NR_ti6on2', 'IMG_1536-Migliorato-NR_diymso',
  'IMG_1050-Migliorato-NR_baqfxh', 'IMG_0989-Migliorato-NR_1_lctn4k',
  'IMG_1118-Migliorato-NR_2_c90ts1', 'IMG_1274-Migliorato-NR_fzfq0q',
  'IMG_1189-Migliorato-NR_1_fhtsre', 'IMG_1429-Migliorato-NR_ikqmny',
  'IMG_1602-Migliorato-NR_cuea7h', 'IMG_1563-Migliorato-NR_eggfzq',
  'IMG_1023-Migliorato-NR_1_ol5rrs', 'IMG_1554-Migliorato-NR_dugdhn',
  'IMG_1549-Migliorato-NR_ggwsnk', 'IMG_1273-Migliorato-NR_teosq7',
  'IMG_1239-Migliorato-NR_xqqtda', 'IMG_1640-Migliorato-NR_1_iqr0wp',
  'IMG_1517-Migliorato-NR_kljzuf', 'IMG_1622-Migliorato-NR_yvqjrh',
  'WhatsApp_Image_2026-04-07_at_6.13.04_PM_zlhu03',
];

const CAPTIONS = [
  'Every life counts.',
  'A little care goes a long way.',
  "Siargao's strays deserve better.",
  'The community showed up.',
  'Good humans. Happy dogs.',
  'This is why we ride.',
];

// Pin a specific caption to a specific image by its Cloudinary public ID.
// All other images fall back to the cycling CAPTIONS array above.
const CAPTION_OVERRIDES: Record<string, string> = {
  'IMG_1342-Migliorato-NR_1_ep4zwx': 'Lola, always vibing.',
};

function captionFor(publicId: string, index: number): string {
  return CAPTION_OVERRIDES[publicId] ?? CAPTIONS[index % CAPTIONS.length];
}

// ─── Single gallery item ────────────────────────────────────────────────────

interface GalleryItemProps {
  publicId: string;
  alt: string;
}

function GalleryItem({ publicId, alt }: GalleryItemProps) {
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
        <CloudinaryImage
          publicId={publicId}
          alt={alt}
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
        {GALLERY_PUBLIC_IDS.map((publicId, i) => (
          <GalleryItem key={publicId} publicId={publicId} alt={captionFor(publicId, i)} />
        ))}
      </div>
    </>
  );
}
