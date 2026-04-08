import { PageLayout } from '../../components/layout/PageLayout.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { PageHeader } from '../../components/public/PageHeader.js';
import { BrandStorySection } from '../../components/about/BrandStorySection.js';
import { PawsitiveGallery } from '../../components/about/PawsitiveGallery.js';

export default function AboutPage() {
  return (
    <PageLayout title="About Us | Lola's Rentals" fullBleed>
      {/* Hero — kept exactly as-is */}
      <PageHeader
        eyebrow="Siargao Island"
        headingMain="A Small Island Business"
        headingAccent="With a Big Heart"
        subheading="Born on Siargao, built around community."
        className="px-6 pt-20 pb-6 text-center"
      />

      <PawDivider />

      {/* Section 1 — Story copy + Lola photo placeholder */}
      <BrandStorySection />

      {/* Section 2 — Be Pawsitive photo gallery */}
      <PawsitiveGallery />
    </PageLayout>
  );
}
