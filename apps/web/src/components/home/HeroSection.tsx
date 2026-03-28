import { Link } from 'react-router-dom';
import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';

export function HeroSection() {
  return (
    <section className="relative flex min-h-[600px] items-center justify-center overflow-hidden px-6 pb-20 pt-12 md:min-h-[700px]">
      <img src={flowerLeft} alt="" className="pointer-events-none absolute left-0 top-0 w-48 md:w-64" />
      <img src={flowerRight} alt="" className="pointer-events-none absolute bottom-0 right-0 w-48 md:w-64" />

      <div className="z-10 max-w-4xl text-center">
        <h2 className="mb-6 font-headline text-4xl font-black leading-tight tracking-tight text-teal-brand md:text-6xl">
          Rated by Many, <br />
          <span className="italic text-gold-brand">Rooted</span> in Community
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-charcoal-brand/80 md:text-xl">
          Your socially responsible rental service on Siargao Island. Every booking supports local dog rescues and island reforestation.
        </p>
        <Link to="/browse-book" className="mx-auto block w-fit">
          <PrimaryCtaButton className="flex items-center gap-3 px-10 py-4 text-lg shadow-lg">
            Reserve Now →
          </PrimaryCtaButton>
        </Link>
      </div>
    </section>
  );
}
