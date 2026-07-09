import { Link } from 'react-router-dom';
import { FadeUpSection } from '../public/FadeUpSection.js';
import { CloudinaryImage } from '../ui/CloudinaryImage.js';

export function BrandStorySection() {
  return (
    <FadeUpSection>
      <section style={{ backgroundColor: '#f1e6d6', padding: '64px 5% 80px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div className="grid items-center gap-12 md:grid-cols-2">

            {/* Left: copy */}
            <div className="space-y-6">
              <p
                className="font-lato font-bold uppercase tracking-widest text-charcoal-brand"
                style={{
                  fontSize: 13,
                  letterSpacing: '0.1em',
                }}
              >
                Our Story
              </p>
              <h2
                className="font-headline font-bold"
                style={{
                  fontSize: 'clamp(26px, 3.5vw, 40px)',
                  color: '#363737',
                  lineHeight: 1.2,
                }}
              >
                Born on the island.{' '}
                <span style={{ fontStyle: 'italic', color: '#FCBC5A' }}>Built for the ride.</span>
              </h2>
              <div
                className="space-y-5 font-lato"
                style={{ fontSize: 17, color: '#363737', lineHeight: 1.75, opacity: 0.85 }}
              >
                <p>
                  Lola&apos;s Rentals was born on Siargao. Not in a boardroom, but on the kind of lazy afternoon
                  that only island life produces. We started small and simple, with one scooter and a
                  straightforward mission: to raise the standard of what renting a motorbike on this island
                  could look and feel like. Built on a foundation of transparency, honesty, and kindness, we
                  believed from day one that doing things the right way and running a successful business
                  weren&apos;t mutually exclusive. A few years (and a lot of kilometres) later, we&apos;re still
                  here, still sandy, and still holding that same line.
                </p>
                <p>
                  Our mission goes beyond the handlebars. Every rental you book helps fund local NGOs and
                  community programmes on Siargao. We support animal welfare, conservation, and island community
                  initiatives — organisations doing real, on-the-ground work that makes a difference. We&apos;re a
                  small business, but we want to prove something: that any business, small, medium, or large, can be
                  good for its customers and its community at the same time. No greenwashing, no gimmicks. Just real
                  support for the people and animals that make this island feel like home.
                </p>
                <p>
                  Just imagine if every business gave a little something back to the communities they operate
                  in. Just imagine how different things could look.
                </p>
                <p className="font-semibold" style={{ opacity: 1 }}>
                  It costs nothing to be kind.
                </p>
              </div>

              <div className="pt-4" style={{ display: 'inline-block', transform: 'skewX(-4deg)' }}>
                <Link
                  to="/book/reserve"
                  className="inline-block rounded-[6px] border-2 border-charcoal-brand bg-gold-brand px-10 py-3 font-lato text-sm font-extrabold uppercase tracking-[0.05em] text-charcoal-brand transition-shadow duration-150 sm:px-11 sm:py-3.5"
                  style={{ boxShadow: '4px 4px 0 #363737' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow = '6px 6px 0 #363737';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow = '4px 4px 0 #363737';
                  }}
                >
                  <span style={{ display: 'inline-block', transform: 'skewX(4deg)' }}>
                    Book Your Ride
                  </span>
                </Link>
              </div>
            </div>

            {/* Right: Lola & Claire on the tuktuk */}
            <div className="flex flex-col items-center">
              <div
                className="group relative w-full max-w-[460px] overflow-hidden"
                style={{
                  aspectRatio: '3 / 4',
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                }}
              >
                <CloudinaryImage
                  publicId="Lola_Claire_tuktuk_st63vw"
                  alt="Lola and Claire on the tuktuk"
                  className="h-full w-full object-cover transition-transform duration-[3000ms] ease-out group-hover:scale-[1.03]"
                />
                <p
                  className="pointer-events-none absolute bottom-3 left-3 max-w-[min(100%-1.5rem,20rem)] font-lato text-[13px] font-medium leading-snug text-white animate-fade-up [animation-delay:550ms] [animation-fill-mode:both]"
                  style={{
                    textShadow:
                      '0 1px 3px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5), 0 0 1px rgba(0,0,0,0.85)',
                  }}
                >
                  Lola and Claire, vibing and collecting coconuts
                </p>
              </div>
              <p
                className="mt-5 max-w-[460px] text-center font-lato text-[15px] leading-relaxed text-charcoal-brand/75"
              >
                <span className="font-semibold text-teal-brand">Fun Fact:</span> Our vehicles are named after the
                animals who&apos;ve been through the program. Every ride has a story.
              </p>
            </div>

          </div>
        </div>
      </section>
    </FadeUpSection>
  );
}
