import { PageLayout } from '../../components/layout/PageLayout.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';
import { BrandStorySection } from '../../components/about/BrandStorySection.js';
import { ValuesSection } from '../../components/about/ValuesSection.js';
import { BePawsitiveSection } from '../../components/about/BePawsitiveSection.js';
import { TimelineSection } from '../../components/about/TimelineSection.js';
import { TeamSection } from '../../components/about/TeamSection.js';

import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';

export default function AboutPage() {
  return (
    <PageLayout title="About Us | Lola's Rentals">
      <section className="relative mx-auto flex max-w-5xl flex-col items-center overflow-visible px-2 py-20 text-center md:py-32">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <HeroFloatingClouds variant="editorial" />
        </div>
        <img
          src={flowerLeft}
          alt=""
          className="pointer-events-none absolute -left-12 top-0 w-32 -rotate-12 opacity-80 md:w-48"
        />
        <img
          src={flowerRight}
          alt=""
          className="pointer-events-none absolute -right-12 bottom-12 w-32 rotate-12 opacity-80 md:w-48"
        />
        <h1 className="relative z-10 mb-6 font-headline text-5xl leading-[0.95] tracking-tighter text-charcoal-brand md:text-7xl">
          A Small Island Business <br />
          <span className="italic text-teal-brand">With a Big Heart</span>
        </h1>
        <p className="relative z-10 max-w-2xl text-lg font-medium text-charcoal-brand/80 md:text-2xl">
          Born on Siargao, built around community.
        </p>
      </section>

      <PawDivider />
      <BrandStorySection />
      <PawDivider />
      <ValuesSection />
      <BePawsitiveSection />
      <PawDivider />
      <TimelineSection />
      <TeamSection />
    </PageLayout>
  );
}
