import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import { ScooterRoad } from '../ui/ScooterRoad.js';
import palmTree from '../../assets/Line Art Palm Tree 1.svg';
import flowerLeft from '../../assets/Line art Flower 1.svg';
import cloud1 from '../../assets/New Cloud 1.svg';
import cloud2 from '../../assets/New Cloud 2.svg';
import cloud3 from '../../assets/New Cloud 3.svg';
import cloud4 from '../../assets/New Cloud 4.svg';
import cloud5 from '../../assets/New Cloud 5.svg';

export function HeroSection() {
  return (
    <section className="relative flex min-h-[520px] flex-col items-center justify-center overflow-hidden px-6 pb-4 text-center md:min-h-[620px]">
      {/* Cloud 1 — large, upper left */}
      <img src={cloud1} alt="" style={{
        position: 'absolute', top: '6%', left: '1%',
        width: '18%', minWidth: '120px', maxWidth: '220px',
        opacity: 0.85, pointerEvents: 'none', zIndex: 0,
        animation: 'float-slow 16s ease-in-out infinite',
        mixBlendMode: 'multiply',
      }} />

      {/* Cloud 2 — small, upper left-centre */}
      <img src={cloud2} alt="" style={{
        position: 'absolute', top: '10%', left: '22%',
        width: '11%', minWidth: '80px', maxWidth: '140px',
        opacity: 0.7, pointerEvents: 'none', zIndex: 0,
        animation: 'float-medium 12s ease-in-out infinite',
        mixBlendMode: 'multiply',
      }} />

      {/* Cloud 3 — small, upper centre-right */}
      <img src={cloud3} alt="" style={{
        position: 'absolute', top: '5%', left: '50%',
        width: '10%', minWidth: '70px', maxWidth: '130px',
        opacity: 0.75, pointerEvents: 'none', zIndex: 0,
        animation: 'float-fast 9s ease-in-out infinite',
        mixBlendMode: 'multiply',
      }} />

      {/* Cloud 4 — medium, upper right */}
      <img src={cloud4} alt="" style={{
        position: 'absolute', top: '8%', right: '20%',
        width: '14%', minWidth: '90px', maxWidth: '180px',
        opacity: 0.8, pointerEvents: 'none', zIndex: 0,
        animation: 'float-slow 20s ease-in-out infinite 4s',
        mixBlendMode: 'multiply',
      }} />

      {/* Cloud 5 — small, far right (partially behind tree) */}
      <img src={cloud5} alt="" style={{
        position: 'absolute', top: '15%', right: '8%',
        width: '9%', minWidth: '65px', maxWidth: '120px',
        opacity: 0.65, pointerEvents: 'none', zIndex: 0,
        animation: 'float-medium 14s ease-in-out infinite 2s',
        mixBlendMode: 'multiply',
      }} />

      {/* Palm tree - right side, bleeding off edge */}
      <img
        src={palmTree}
        alt=""
        style={{
          position: 'absolute',
          right: '-4%',
          bottom: '0',
          height: '92%',
          width: 'auto',
          opacity: 0.55,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Flower - bottom-left */}
      <img
        src={flowerLeft}
        alt=""
        style={{
          position: 'absolute',
          left: '-1%',
          bottom: '12%',
          width: '8%',
          minWidth: '55px',
          opacity: 0.45,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Hero text and CTA */}
      <div className="relative z-10 mx-auto max-w-3xl">
        <h2 className="mb-6 font-headline text-4xl font-black leading-tight tracking-tight text-teal-brand md:text-6xl">
          Rated by Many, <br />
          <span className="italic text-gold-brand">Rooted</span> in Community
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-charcoal-brand/80 md:text-xl">
          Your socially responsible rental service on Siargao Island. Every booking supports local dog rescues and island reforestation.
        </p>
        <PrimaryCtaButton href="/browse-book" className="mx-auto flex items-center gap-3 px-10 py-4 text-lg shadow-lg">
          Reserve Now
        </PrimaryCtaButton>
      </div>

      {/* Road + scooter - bottom */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', pointerEvents: 'none', zIndex: 2 }}>
        <ScooterRoad />
      </div>
    </section>
  );
}
