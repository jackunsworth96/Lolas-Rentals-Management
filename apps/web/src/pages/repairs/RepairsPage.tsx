import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { PageHeader } from '../../components/public/PageHeader.js';
import { EmergencyContactsSection } from '../../components/repairs/EmergencyContactsSection.js';
import { RepairCostsSection } from '../../components/repairs/RepairCostsSection.js';
import { SafetyTipsSection } from '../../components/repairs/SafetyTipsSection.js';

export default function RepairsPage() {
  return (
    <PageLayout title="Repairs & Info | Lola's Rentals" fullBleed>
      <SEO
        title="Scooter & Motorbike Repairs — Siargao Island"
        description="Scooter and motorbike repair services on Siargao Island. Quick turnaround, fair prices. Lola's Rentals & Tours, General Luna."
        canonical="/book/repairs"
      />
      <PageHeader
        eyebrow="Our Commitment"
        headingMain="Repair Costs &"
        headingAccent="Transparency"
        subheading="We publish our repair costs so you always know what to expect. No surprises, ever."
        className="px-6 pt-20 pb-6 text-center"
      />

      <RepairCostsSection />

      <PawDivider />
      <section
        aria-label="Island safety tips and emergency contacts"
        className="mx-auto flex max-w-7xl flex-col gap-12 px-6 py-6"
      >
        <SafetyTipsSection />
        <EmergencyContactsSection />
      </section>
    </PageLayout>
  );
}
