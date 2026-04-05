import { useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { HeroFloatingClouds } from '../ui/HeroFloatingClouds.js';
import { FadeUpSection } from './FadeUpSection.js';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice.js';
import VariableProximity from '../home/VariableProximity.js';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';

interface PageHeroProps {
  eyebrow?: string;
  headingMain: string;
  headingAccent?: string;
  subheading?: string;
  children?: ReactNode;
}

export function PageHero({
  eyebrow,
  headingMain,
  headingAccent,
  subheading,
  children,
}: PageHeroProps) {
  const isTouch = useIsTouchDevice();
  const containerRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden px-6 py-16 text-center"
      style={{ backgroundColor: '#f1e6d6' }}
    >
      <HeroFloatingClouds variant="functional" />

      <img
        src={flowerLeft}
        alt=""
        className="pointer-events-none absolute left-0 top-1/2 w-24 -translate-y-1/2 opacity-20 md:w-44 md:opacity-40"
        aria-hidden="true"
      />
      <img
        src={flowerRight}
        alt=""
        className="pointer-events-none absolute right-0 top-1/2 w-24 -translate-y-1/2 opacity-20 md:w-44 md:opacity-40"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-4xl">
        {eyebrow && (
          <p
            className="mb-3 font-bold uppercase tracking-widest text-teal-brand"
            style={{ fontFamily: 'Lato, sans-serif', fontSize: '11px' }}
          >
            {eyebrow}
          </p>
        )}

        <h1
          className="font-headline font-black leading-tight tracking-tight"
          style={{ fontSize: 'clamp(32px, 5vw, 52px)', color: '#00577C' }}
        >
          {isTouch ? (
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              {headingMain}
            </motion.span>
          ) : (
            <VariableProximity
              label={headingMain}
              containerRef={containerRef}
              fromFontVariationSettings="'wght' 700"
              toFontVariationSettings="'wght' 900"
              radius={200}
              falloff="gaussian"
              style={{ color: '#00577C' }}
            />
          )}
          {headingAccent && (
            <span className="italic" style={{ color: '#FCBC5A' }}>
              {' '}
              {headingAccent}
            </span>
          )}
        </h1>

        {subheading && (
          <FadeUpSection>
            <p
              className="mx-auto mt-4 max-w-[560px] text-center"
              style={{
                fontFamily: 'Lato, sans-serif',
                fontSize: '18px',
                color: '#363737',
                opacity: 0.7,
                lineHeight: 1.6,
              }}
            >
              {subheading}
            </p>
          </FadeUpSection>
        )}

        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}
