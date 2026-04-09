import { FadeUpSection } from '../public/FadeUpSection.js';
import lolaClaireTuktuk from '../../assets/About Us Page/Lola_Claire_tuktuk.jpeg';

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
                  Our mission goes beyond the handlebars. Every rental you book helps fund Be Pawsitive, a
                  local animal welfare NGO running spay, neuter, and vaccination programs across Siargao. The
                  work they do is nothing short of incredible. 1,120 animals fixed, 2,023 vaccinated, and a
                  ripple effect that prevents hundreds of thousands of future strays from ever entering the
                  cycle. We&apos;re a small business, but we want to prove something: that any business, small,
                  medium, or large, can be good for its customers and its community at the same time. No
                  greenwashing, no gimmicks. Just real support for the animals and people that make this island
                  feel like home.
                </p>
                <p>
                  Just imagine if every business gave a little something back to the communities they operate
                  in. Just imagine how different things could look.
                </p>
                <p className="font-semibold" style={{ opacity: 1 }}>
                  It costs nothing to be kind.
                </p>
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
                <img
                  src={lolaClaireTuktuk}
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
