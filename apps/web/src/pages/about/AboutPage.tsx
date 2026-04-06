import { PageLayout } from '../../components/layout/PageLayout.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { PageHeader } from '../../components/public/PageHeader.js';
import { BrandStorySection } from '../../components/about/BrandStorySection.js';
import { ValuesSection } from '../../components/about/ValuesSection.js';
import { BePawsitiveSection } from '../../components/about/BePawsitiveSection.js';
import { TimelineSection } from '../../components/about/TimelineSection.js';
import { TeamSection } from '../../components/about/TeamSection.js';

export default function AboutPage() {
  return (
    <PageLayout title="About Us | Lola's Rentals">
      <PageHeader
        eyebrow="Siargao Island"
        headingMain="A Small Island Business"
        headingAccent="With a Big Heart"
        subheading="Born on Siargao, built around community."
      />

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
