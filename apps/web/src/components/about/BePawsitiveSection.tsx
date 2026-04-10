import { FadeUpSection } from '../public/FadeUpSection.js';
import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import lolaPawPrint from '../../assets/Lola a Paw Print.svg';

export function BePawsitiveSection() {
  return (
    <section className="relative overflow-hidden px-6 py-24">
      <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-teal-brand/5 blur-3xl" />
      <FadeUpSection>
        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-12 rounded-xl bg-cream-brand p-8 shadow-sm md:flex-row md:p-16">
          <div className="flex w-full justify-center md:w-1/3">
            <div className="flex h-48 w-48 items-center justify-center rounded-full bg-white p-6 shadow-inner ring-4 ring-gold-brand/40">
              <img src={lolaPawPrint} alt="" className="h-28 w-28 object-contain bg-transparent" />
            </div>
          </div>
          <div className="w-full space-y-6 text-center md:w-2/3 md:text-left">
            <h3 className="font-headline text-3xl text-charcoal-brand md:text-4xl">
              Giving Back: <br />
              Be Pawsitive Partnership
            </h3>
            <p className="text-xl leading-relaxed text-charcoal-brand/80">
              Since October 2022, Lola&apos;s Rentals has donated{' '}
              <span className="font-bold text-teal-brand">₱282,995</span> to Be Pawsitive — a local NGO spaying and
              neutering stray animals on Siargao. Every rental contributes.
            </p>
            <div className="flex justify-center md:justify-start">
              <PrimaryCtaButton
                href="/book/bepawsitive"
                className="inline-flex gap-3 px-8 py-4 text-base shadow-lg"
              >
                Learn More About Be Pawsitive →
              </PrimaryCtaButton>
            </div>
          </div>
        </div>
      </FadeUpSection>
    </section>
  );
}
