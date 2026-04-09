import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PageHeader } from '../../components/public/PageHeader.js';
import { WHATSAPP_URL } from '../../config/contact.js';
import peaceOfMindIcon from '../../assets/Basket/Peace of Mind.svg';

function CoveredRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex border-b border-white/20 py-1.5 last:border-0">
      <div className="mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/20">
        <span className="text-[10px] text-white" aria-hidden>
          ✓
        </span>
      </div>
      <p className="font-lato text-xs text-white/90">{children}</p>
    </div>
  );
}

function NotCoveredRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex border-b border-white/20 py-1.5 last:border-0">
      <div className="mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/20">
        <span className="text-[10px] text-white" aria-hidden>
          ✗
        </span>
      </div>
      <p className="font-lato text-xs text-white/90">{children}</p>
    </div>
  );
}

function AnimatedPanel({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <div className="h-full">{children}</div>;
  }
  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 18, scale: 0.99 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function PeaceOfMindPage() {
  return (
    <PageLayout title="Peace of Mind Cover | Lola's Rentals" contentBackground="sand" elevateFlorals fullBleed>
      <div className="min-h-screen bg-[#f1e6d6] pb-12">
        <section className="w-full bg-[#f1e6d6]">
          <FadeUpSection onlyAnimateOnMobile>
            <div className="bg-[#f1e6d6] px-6 pt-20 pb-6 text-center">
              <div className="mb-3 flex justify-center">
                <img
                  src={peaceOfMindIcon}
                  alt=""
                  width={100}
                  height={100}
                  className="h-[70px] w-[70px] object-contain md:h-[100px] md:w-[100px]"
                  aria-hidden
                />
              </div>
              <PageHeader
                headingMain="Peace of Mind"
                headingAccent="Cover"
                subheading={"Ride with confidence. We've got you covered."}
                className="bg-transparent px-0 py-0 text-center"
              />
              <p className="mx-auto mt-3 max-w-3xl text-center font-lato text-sm text-charcoal-brand/60">
                Optional cover protecting you from common damages and theft — see exactly what&apos;s included.
              </p>
            </div>
          </FadeUpSection>
        </section>

        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
            {/* What&apos;s included */}
            <AnimatedPanel delay={0}>
              <div className="rounded-xl bg-teal-brand p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
                    <span className="text-lg text-teal-brand" aria-hidden>
                      ✓
                    </span>
                  </div>
                  <h2 className="font-headline text-lg !text-white">What&apos;s included</h2>
                </div>
                <div>
                  <CoveredRow>Scratches and small dents on the scooter body or frame</CoveredRow>
                  <CoveredRow>Broken panels, mirrors, and handles</CoveredRow>
                  <CoveredRow>Tyre or wheel damage, including flats from regular wear and tear</CoveredRow>
                  <CoveredRow>Theft protection, provided the loss isn&apos;t due to user oversight</CoveredRow>
                  <CoveredRow>Damage to included accessories</CoveredRow>
                  <CoveredRow>Vandalism caused by the public</CoveredRow>
                </div>
              </div>
            </AnimatedPanel>

            {/* What&apos;s not covered */}
            <AnimatedPanel delay={0.08}>
              <div className="rounded-xl bg-[#C0392B] p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <span className="text-lg text-white" aria-hidden>
                      ✗
                    </span>
                  </div>
                  <h2 className="font-headline text-lg !text-white">What&apos;s not covered</h2>
                </div>
                <div>
                  <NotCoveredRow>Damage resulting from reckless, negligent, or improper use</NotCoveredRow>
                  <NotCoveredRow>Structural damage to the frame, such as the t-post or chassis</NotCoveredRow>
                  <NotCoveredRow>
                    Loss of the scooter, key, or accessories due to avoidable circumstances
                  </NotCoveredRow>
                  <NotCoveredRow>Personal injuries or third-party liabilities</NotCoveredRow>
                </div>
              </div>
            </AnimatedPanel>
          </div>

          {/* Important conditions */}
          <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="mb-2 flex items-center gap-2 font-headline text-base text-amber-800">
              <span className="text-sm leading-none" aria-hidden>
                ⚠️
              </span>
              Important conditions
            </h2>
            <ul className="list-none space-y-1.5 pl-0 font-lato text-xs leading-snug text-amber-900/80">
              <li className="flex gap-2">
                <span aria-hidden>•</span>
                <span>
                  Theft protection applies only when the vehicle is properly secured and the original key is provided
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden>•</span>
                <span>Cover does not apply to damage from reckless or improper use</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden>•</span>
                <span>All claims are subject to review by our team</span>
              </li>
            </ul>
          </section>

          {/* CTA */}
          <section className="mt-6 text-center">
            <p className="mb-3 font-lato text-sm text-charcoal-brand/60">Have questions about what&apos;s covered?</p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-6 py-2 font-lato text-sm font-bold text-white transition-opacity hover:opacity-95"
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Chat with us on WhatsApp
            </a>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
