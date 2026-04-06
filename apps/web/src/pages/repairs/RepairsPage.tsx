import { PageLayout } from '../../components/layout/PageLayout.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { PageHeader } from '../../components/public/PageHeader.js';
import { WhatToDoSection } from '../../components/repairs/WhatToDoSection.js';
import { EmergencyContactsSection } from '../../components/repairs/EmergencyContactsSection.js';
import { CommonIssuesSection } from '../../components/repairs/CommonIssuesSection.js';
import { RepairCostsSection } from '../../components/repairs/RepairCostsSection.js';
import { SafetyTipsSection } from '../../components/repairs/SafetyTipsSection.js';

export default function RepairsPage() {
  return (
    <PageLayout title="Repairs & Info | Lola's Rentals" fullBleed>
      <PageHeader
        eyebrow="Our Commitment"
        headingMain="Repair Costs &"
        headingAccent="Transparency"
        subheading="We publish our repair costs so you always know what to expect. No surprises, ever."
        className="px-6 pt-20 pb-6 text-center"
      />

      <RepairCostsSection />

      <PawDivider />
      <WhatToDoSection />
      <PawDivider />
      <EmergencyContactsSection />
      <PawDivider />
      <CommonIssuesSection />
      <PawDivider />
      <SafetyTipsSection />
    </PageLayout>
  );
}
