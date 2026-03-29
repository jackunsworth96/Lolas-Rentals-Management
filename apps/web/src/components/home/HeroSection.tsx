import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import palmTree from '../../assets/Line Art Palm Tree 1.svg';
import cloud1 from '../../assets/New Cloud 1.svg';
import cloud2 from '../../assets/New Cloud 2.svg';
import cloud3 from '../../assets/New Cloud 3.svg';
import cloud4 from '../../assets/New Cloud 4.svg';
import cloud5 from '../../assets/New Cloud 5.svg';

export function HeroSection() {
  return (
    <section
      className="relative flex flex-col items-center justify-center overflow-hidden px-4 py-20 text-center md:py-32"
      style={{ minHeight: 'calc(100vh - 64px)' }}
    >
      {/* Cloud 1 — large, upper left */}
      <img
        src={cloud1}
        alt=""
        className="w-14 md:w-32 lg:w-48"
        style={{
          position: 'absolute',
          top: '6%',
          left: '1%',
          opacity: 0.65,
          pointerEvents: 'none',
          zIndex: 0,
          animation: 'float-slow 16s ease-in-out infinite',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Cloud 2 — small, upper left-centre */}
      <img
        src={cloud2}
        alt=""
        className="w-12 md:w-24 lg:w-36"
        style={{
          position: 'absolute',
          top: '10%',
          left: '22%',
          opacity: 0.65,
          pointerEvents: 'none',
          zIndex: 0,
          animation: 'float-medium 12s ease-in-out infinite',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Cloud 3 — small, upper centre-right */}
      <img
        src={cloud3}
        alt=""
        className="w-12 md:w-20 lg:w-32"
        style={{
          position: 'absolute',
          top: '5%',
          left: '50%',
          opacity: 0.65,
          pointerEvents: 'none',
          zIndex: 0,
          animation: 'float-fast 9s ease-in-out infinite',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Cloud 4 — medium, upper right */}
      <img
        src={cloud4}
        alt=""
        className="w-12 md:w-28 lg:w-40"
        style={{
          position: 'absolute',
          top: '8%',
          right: '20%',
          opacity: 0.65,
          pointerEvents: 'none',
          zIndex: 0,
          animation: 'float-slow 20s ease-in-out infinite 4s',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Cloud 5 — small, far right (partially behind tree on md+) */}
      <img
        src={cloud5}
        alt=""
        className="w-10 md:w-20 lg:w-28"
        style={{
          position: 'absolute',
          top: '15%',
          right: '8%',
          opacity: 0.65,
          pointerEvents: 'none',
          zIndex: 0,
          animation: 'float-medium 14s ease-in-out infinite 2s',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Palm tree — tablet and up only */}
      <div className="pointer-events-none absolute inset-0 z-0 hidden md:block">
        <img
          src={palmTree}
          alt=""
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            height: '80%',
            width: 'auto',
            opacity: 0.5,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      </div>

      {/* Hero text and CTA */}
      <div className="relative z-10 mx-auto max-w-2xl px-4 text-center">
        <h2 className="mb-6 font-headline text-4xl font-black leading-tight tracking-tight text-teal-brand md:text-6xl">
          Rated by Many, <br />
          <span className="italic text-gold-brand">Rooted</span> in Community
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-charcoal-brand/80 md:text-xl">
          Your socially responsible rental service on Siargao. Where every booking helps support Spay, Neuter and Vaccination initiatives.
        </p>
        <PrimaryCtaButton href="/book/reserve" className="mx-auto flex items-center gap-3 px-10 py-4 text-lg shadow-lg">
          Reserve Now
        </PrimaryCtaButton>
      </div>
    </section>
  );
}
