import { Link } from 'react-router-dom';
import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import hondaBeatImg from '../../assets/Honda Beat Image.png';
import tukTukImg from '../../assets/TukTuk Image.png';

const FLEET = [
  { name: 'Honda Beat', price: '₱500/day', img: hondaBeatImg, desc: 'Perfect for zipping through palm-lined roads with ease and efficiency.' },
  { name: 'TVS Tuk-Tuk', price: '₱1,200/day', img: tukTukImg, desc: 'The ultimate group explorer. Rugged, iconic, and spacious enough for boards.' },
  { name: 'Inflatable Kayak', price: '₱800/day', img: null, desc: 'Lightweight and portable. Discover hidden lagoons at your own pace.' },
];

export function FleetPreviewSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-12 flex flex-col items-end justify-between gap-6 md:flex-row">
        <div>
          <h3 className="font-headline text-4xl font-black leading-tight text-charcoal-brand">
            Featured <br />
            <span className="italic text-teal-brand">Island Essentials</span>
          </h3>
        </div>
        <p className="max-w-md text-charcoal-brand/70">
          Our fleet is meticulously maintained and supports local community growth through every kilometer.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {FLEET.map((v, i) => (
          <div
            key={v.name}
            className="group animate-card-enter overflow-hidden rounded-4xl bg-cream-brand shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="relative h-64 overflow-hidden bg-sand-brand">
              {v.img ? (
                <img src={v.img} alt={v.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-5xl opacity-20">🛶</span>
                </div>
              )}
              <div className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-teal-brand backdrop-blur">
                {v.price}
              </div>
            </div>
            <div className="p-6">
              <h5 className="mb-2 text-xl font-bold text-charcoal-brand">{v.name}</h5>
              <p className="mb-6 text-sm text-charcoal-brand/70">{v.desc}</p>
              <Link to="/browse-book">
                <PrimaryCtaButton className="flex w-full items-center justify-center gap-2 py-3">
                  Book 📅
                </PrimaryCtaButton>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
