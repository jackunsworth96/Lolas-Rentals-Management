import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { HeroSection } from '../../components/hero/HeroSection.js';
import { FleetPreviewSection } from '../../components/home/FleetPreviewSection.js';
import { HowItWorksSection } from '../../components/home/HowItWorksSection.js';
import { PawCardCallout } from '../../components/home/PawCardCallout.js';
import { ReviewsSection } from '../../components/home/ReviewsSection.js';

export default function HomePage() {
  return (
    <PageLayout
      title="Lola's Rentals — Siargao Island"
      showFloralLeft={false}
      showFloralRight={false}
    >
      <HeroSection />

      <PawDivider />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex items-center justify-center gap-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold-brand text-sm text-white">🐾</span>
            <h3 className="text-2xl font-bold text-charcoal-brand">Choose Your Starting Point</h3>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold-brand text-sm text-white">🐾</span>
          </div>
          <div className="mx-auto max-w-md">
            <div className="group relative overflow-hidden rounded-4xl bg-cream-brand p-8 shadow-[0_4px_20px_rgba(61,61,61,0.05)]">
              <div className="mb-6 flex items-start justify-between">
                <span className="text-3xl text-teal-brand">📍</span>
                <span className="rounded-full bg-gold-brand px-3 py-1 text-[10px] font-black uppercase tracking-wider text-charcoal-brand">
                  PRIMARY HUB
                </span>
              </div>
              <h4 className="mb-2 text-xl font-bold text-charcoal-brand">Lola&apos;s Rentals (General Luna)</h4>
              <p className="mb-6 text-sm text-charcoal-brand/70">Heart of the island, steps away from Cloud 9.</p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-brand">
                <div className="h-full w-full bg-teal-brand" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <PawDivider />

      <FadeUpSection>
        <FleetPreviewSection />
      </FadeUpSection>

      <PawDivider />

      <FadeUpSection>
        <HowItWorksSection />
      </FadeUpSection>

      <FadeUpSection>
        <PawCardCallout />
      </FadeUpSection>

      <FadeUpSection>
        <ReviewsSection />
      </FadeUpSection>
    </PageLayout>
  );
}
