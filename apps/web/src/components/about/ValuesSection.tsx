import { FadeUpSection } from '../public/FadeUpSection.js';
import handHeart from '../../assets/Hand on Heart.svg';
import tickIcon from '../../assets/Tick Icon.svg';

const VALUES = [
  {
    title: 'Kindness',
    quote: 'It costs nothing to be kind',
    circle: 'bg-teal-brand/10 text-teal-brand',
    icon: <img src={handHeart} alt="" className="h-8 w-8 object-contain" />,
  },
  {
    title: 'Honesty',
    quote: 'Honesty is the best policy',
    circle: 'bg-gold-brand/15 text-charcoal-brand',
    icon: <img src={tickIcon} alt="" className="h-8 w-8 object-contain" />,
  },
  {
    title: 'Transparency',
    quote: "Let's make things clear",
    circle: 'bg-[#92381b]/10 text-[#92381b]',
    icon: (
      <span className="text-3xl leading-none" aria-hidden>
        ◉
      </span>
    ),
  },
];

export function ValuesSection() {
  return (
    <section className="bg-sand-brand px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <h3 className="mb-4 font-headline text-4xl text-charcoal-brand">Values We Live By</h3>
          <p className="text-charcoal-brand/70">Simple principles for an island life.</p>
        </div>
        <FadeUpSection>
          <div className="grid gap-8 md:grid-cols-3">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="rounded-xl bg-cream-brand p-10 shadow-[0_20px_40px_rgba(62,73,70,0.06)] transition-all duration-300 hover:-translate-y-2"
              >
                <div className={`mb-8 flex h-16 w-16 items-center justify-center rounded-full ${v.circle}`}>
                  {v.icon}
                </div>
                <h4 className="mb-4 font-headline text-2xl text-charcoal-brand">{v.title}</h4>
                <p className="text-lg italic leading-relaxed text-charcoal-brand/80">&quot;{v.quote}&quot;</p>
              </div>
            ))}
          </div>
        </FadeUpSection>
      </div>
    </section>
  );
}
