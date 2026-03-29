import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';
import { WhatToDoSection } from '../../components/repairs/WhatToDoSection.js';
import { EmergencyContactsSection } from '../../components/repairs/EmergencyContactsSection.js';
import { CommonIssuesSection } from '../../components/repairs/CommonIssuesSection.js';
import { RepairCostsSection } from '../../components/repairs/RepairCostsSection.js';
import { SafetyTipsSection } from '../../components/repairs/SafetyTipsSection.js';

import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';

export default function RepairsPage() {
  return (
    <PageLayout title="Repairs & Info | Lola's Rentals">
      <section className="relative overflow-hidden px-2 py-16 text-center md:py-24">
        <HeroFloatingClouds variant="editorial" />
        <img src={flowerLeft} alt="" className="pointer-events-none absolute left-0 top-1/2 w-24 -translate-y-1/2 opacity-40 md:w-48 md:opacity-100" />
        <img src={flowerRight} alt="" className="pointer-events-none absolute right-0 top-1/2 w-24 -translate-y-1/2 opacity-40 md:w-48 md:opacity-100" />
        <div className="relative z-10 mx-auto max-w-3xl space-y-6">
          <h1 className="font-headline text-5xl font-black leading-tight tracking-tight text-teal-brand md:text-7xl">
            We&apos;ve Got You Covered
          </h1>
          <p className="mx-auto max-w-2xl text-xl font-medium text-charcoal-brand/80 md:text-2xl">
            Broke down on the road? Don&apos;t stress — here&apos;s everything you need.
          </p>
          <div className="pt-8">
            <PrimaryCtaButton href="tel:09694443413" className="mx-auto inline-flex min-h-[44px] gap-3 px-8 py-4 text-lg shadow-[0_20px_40px_rgba(62,73,70,0.06)]">
              📞 Call Hotline Now
            </PrimaryCtaButton>
          </div>
        </div>
      </section>

      <PawDivider />
      <WhatToDoSection />
      <PawDivider />
      <EmergencyContactsSection />
      <PawDivider />
      <CommonIssuesSection />
      <PawDivider />
      <RepairCostsSection />
      <PawDivider />
      <SafetyTipsSection />
    </PageLayout>
  );
}
