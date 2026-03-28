import { FadeUpSection } from '../public/FadeUpSection.js';
import lolaPhoto from '../../assets/Lola.png';

export function BrandStorySection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <FadeUpSection>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div className="relative order-2 md:order-1">
            <div className="group relative">
              <div className="absolute inset-0 -z-10 translate-x-4 translate-y-4 rounded-xl bg-gold-brand/20 transition-transform duration-300 group-hover:translate-x-2 group-hover:translate-y-2" />
              <img
                src={lolaPhoto}
                alt="Lola, the dog who inspired our name"
                className="h-[500px] w-full rounded-xl object-cover shadow-xl"
              />
              <div className="absolute -bottom-6 -right-6 max-w-[220px] rounded-2xl bg-cream-brand p-6 shadow-lg">
                <p className="font-headline text-xl italic leading-tight text-teal-brand">
                  Meet Lola, the original inspiration.
                </p>
              </div>
            </div>
          </div>
          <div className="order-1 space-y-8 md:order-2">
            <h3 className="font-headline text-4xl tracking-tight text-charcoal-brand">Our Roots</h3>
            <div className="space-y-6 text-xl leading-relaxed text-charcoal-brand/80">
              <p>Jack moved to Siargao and started Lola&apos;s Rentals — named after his dog Lola.</p>
              <p>
                What began as a small scooter rental grew into a community-rooted business with two stores, a charity
                partnership, and a loyalty scheme that gives back to the island.
              </p>
            </div>
            <div className="pt-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-gold-brand px-6 py-3 text-sm font-bold uppercase tracking-widest text-charcoal-brand">
                Est. 2022
              </span>
            </div>
          </div>
        </div>
      </FadeUpSection>
    </section>
  );
}
