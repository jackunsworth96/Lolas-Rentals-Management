import { FadeUpSection } from '../public/FadeUpSection.js';
import lolaClaireTuktuk from '../../assets/About Us Page/Lola_Claire_tuktuk.jpeg';

export function BrandStorySection() {
  return (
    <FadeUpSection>
      <section style={{ backgroundColor: '#f1e6d6', padding: '80px 5%' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div className="grid items-center gap-12 md:grid-cols-2">

            {/* Left: copy */}
            <div className="space-y-6">
              <p
                className="font-lato"
                style={{
                  fontSize: 13,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#00577C',
                  fontWeight: 700,
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
                Still Sandy,{' '}
                <span style={{ fontStyle: 'italic', color: '#FCBC5A' }}>Still Obsessed</span>
              </h2>
              <div
                className="space-y-5 font-lato"
                style={{ fontSize: 17, color: '#363737', lineHeight: 1.75, opacity: 0.85 }}
              >
                <p>
                  Lola&apos;s Rentals was born on Siargao — not in a boardroom, but on the kind of lazy
                  afternoon that only island life produces. We started simple: good scooters, good vibes, and
                  a belief that getting around should feel like part of the adventure, not a hassle. A few
                  years (and a lot of kilometres) later, we&apos;re still here, still sandy, and still
                  obsessed with doing things the right way.
                </p>
                <p>
                  Our mission goes beyond the handlebars. Every rental you book helps fund Be Pawsitive, a
                  local animal welfare NGO running spay, neuter, and vaccination programs across Siargao. We
                  believe a healthy island means healthy animals too — and that a business can be good for
                  its customers and its community at the same time. No greenwashing, no gimmicks. Just real
                  support for the dogs and cats that make this island feel like home.
                </p>
              </div>
            </div>

            {/* Right: Lola & Claire on the tuktuk */}
            <div className="flex justify-center">
              <div
                className="group relative overflow-hidden"
                style={{
                  width: '100%',
                  maxWidth: 460,
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
              </div>
            </div>

          </div>
        </div>
      </section>
    </FadeUpSection>
  );
}
