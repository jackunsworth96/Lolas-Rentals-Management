import { PageLayout } from '../../components/layout/PageLayout.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { BrandStorySection } from '../../components/about/BrandStorySection.js';
import { PawsitiveGallery } from '../../components/about/PawsitiveGallery.js';
import groupPic from '../../assets/About Us Page/group_pic.jpeg';

export default function AboutPage() {
  return (
    <PageLayout title="About Us | Lola's Rentals" fullBleed>

      {/* ── Hero ── group_pic full-bleed with text overlay */}
      <div className="relative w-full overflow-hidden" style={{ height: 'clamp(420px, 65vh, 780px)' }}>
        <img
          src={groupPic}
          alt="The Lola's Rentals team"
          className="h-full w-full object-cover"
          style={{ objectPosition: 'center 20%' }}
        />
        {/* Gradient overlay for readability */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.72) 100%)',
          }}
        />
        {/* Text centred over the image */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-14 px-6 text-center">
          <p
            className="mb-3 font-lato font-bold uppercase tracking-widest text-white/70"
            style={{ fontSize: 11 }}
          >
            Siargao Island
          </p>
          <h1
            className="font-headline font-black text-white"
            style={{ fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 1.1 }}
          >
            A Small Island Business
            <span className="italic text-gold-brand"> With a Big Heart</span>
          </h1>
          <p
            className="mx-auto mt-4 max-w-xl font-lato text-white/80"
            style={{ fontSize: 18, lineHeight: 1.6 }}
          >
            Born on Siargao, built around community.
          </p>
        </div>
      </div>

      {/* ~20% tighter vertical rhythm than default py-8 divider */}
      <PawDivider className="py-[1.6rem]" />

      {/* Section 1 — Story copy + Lola & Claire photo */}
      <BrandStorySection />

      {/* Section 2 — Be Pawsitive photo gallery */}
      <PawsitiveGallery />

    </PageLayout>
  );
}
