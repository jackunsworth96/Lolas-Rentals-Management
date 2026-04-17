import { useRef } from 'react';
import { AnimatedHeading } from '../../components/public/AnimatedHeading.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { BrandStorySection } from '../../components/about/BrandStorySection.js';
import { PawsitiveGallery } from '../../components/about/PawsitiveGallery.js';
import groupPic from '../../assets/About Us Page/Be Pawsitive Gallery/group_pic.jpeg';
import separator3 from '../../assets/About Us Page/separator-3.svg';

export default function AboutPage() {
  const gallerySectionRef = useRef<HTMLDivElement>(null);

  return (
    <PageLayout title="About Us | Lola's Rentals" fullBleed floralScrollFreezeRef={gallerySectionRef}>
      <SEO
        title="About Lola's Rentals — Siargao's Trusted Vehicle Rental"
        description="Learn about Lola's Rentals & Tours, Siargao Island's premium scooter, motorbike and tuktuk rental company. Based in General Luna since 2019. Proud sponsor of Be Pawsitive animal welfare."
        canonical="/book/about"
      />

      {/* ── Hero ── group_pic full-bleed with text overlay */}
      <div className="relative w-full overflow-hidden" style={{ height: 'clamp(420px, 65vh, 780px)' }}>
        <img
          src={groupPic}
          alt="The Lola's Rentals team"
          className="h-full w-full animate-page-fade-in object-cover"
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
            className="font-headline font-black !text-white"
            style={{ fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 1.1 }}
            aria-label="A Small Island Business With a Big Heart"
          >
            <AnimatedHeading
              text="A Small Island Business"
              tag="span"
              className="!text-white"
            />
            {' '}
            <AnimatedHeading
              text="With a Big Heart"
              tag="span"
              delay={20}
              className="italic text-gold-brand"
            />
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

      <div className="w-full pt-[1.44rem] pb-[0.512rem]">
        <img
          src={separator3}
          alt=""
          className="block h-auto w-full max-w-none"
        />
      </div>

      {/* Section 2 — Be Pawsitive photo gallery (floral parallax freezes when this block reaches the viewport band) */}
      <div ref={gallerySectionRef} className="w-full">
        <PawsitiveGallery />
      </div>

    </PageLayout>
  );
}
