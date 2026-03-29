import { Link } from 'react-router-dom';
import lolaFace from '../../assets/Lola Face Cartoon.svg';

export function PawCardCallout() {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto flex max-w-6xl flex-col overflow-hidden rounded-4xl bg-teal-brand shadow-[0_4px_20px_rgba(61,61,61,0.05)] md:flex-row">
        <div className="flex flex-col justify-center p-10 md:w-1/2 md:p-16">
          <h3 className="mb-6 font-headline text-3xl font-black leading-tight text-white md:text-5xl">
            Every Peso <br />
            <span className="italic text-gold-brand">Wags a Tail</span>
          </h3>
          <p className="mb-8 text-lg text-white/80">
            Join the Paw Card program. Log your savings at 70+ partner businesses and we match every peso as a donation to BePawsitive — Siargao's local animal welfare NGO.
          </p>
          <Link
            to="/book/paw-card"
            className="group inline-flex items-center gap-3 text-xl font-bold text-gold-brand transition-opacity hover:opacity-80"
          >
            Get Your Paw Card
            <span className="transition-transform group-hover:translate-x-1">🐾</span>
          </Link>
        </div>
        <div className="relative min-h-[300px] bg-teal-brand md:w-1/2 md:min-h-[400px]">
          <img
            src={lolaFace}
            alt="Lola — our mascot"
            className="absolute inset-0 h-full w-full object-contain p-12 md:p-16"
          />
        </div>
      </div>
    </section>
  );
}
