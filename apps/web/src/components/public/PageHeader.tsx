import { AnimatedHeading } from './AnimatedHeading.js';

interface PageHeaderProps {
  eyebrow?: string;
  headingMain: string;
  headingAccent?: string;
  subheading?: string;
  /** Override the outer wrapper's padding/spacing classes (default: "px-6 py-16 text-center") */
  className?: string;
  /**
   * Smaller type and gaps below the `sm` breakpoint so the block fits common mobile
   * viewports above the fold (e.g. with a form directly underneath).
   */
  fitAboveFold?: boolean;
}

export function PageHeader({
  eyebrow,
  headingMain,
  headingAccent,
  subheading,
  className = 'px-6 py-16 text-center',
  fitAboveFold = false,
}: PageHeaderProps) {
  const eyebrowMb = fitAboveFold ? 'mb-1 sm:mb-3' : 'mb-3';
  const subheadingClass = fitAboveFold
    ? 'mx-auto mt-2 max-w-xl font-lato text-[15px] leading-snug text-[#363737] sm:mt-4 sm:text-lg sm:leading-[1.6]'
    : 'mx-auto mt-4 max-w-xl font-lato text-lg leading-relaxed text-[#363737]';

  return (
    <div className={className}>
      <div className="mx-auto max-w-3xl">
        {eyebrow && (
          <p
            className={`${eyebrowMb} font-bold uppercase tracking-widest text-teal-brand`}
            style={{ fontFamily: 'Lato, sans-serif', fontSize: '11px' }}
          >
            {eyebrow}
          </p>
        )}

        <h1
          className={`font-headline font-black text-teal-brand ${
            fitAboveFold
              ? 'text-[clamp(1.35rem,5.5vw,3rem)] leading-[1.12] sm:text-[clamp(2rem,5vw,3rem)] sm:leading-[1.15]'
              : ''
          }`}
          style={fitAboveFold ? undefined : { fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.15 }}
          aria-label={`${headingMain}${headingAccent ? ' ' + headingAccent : ''}`}
        >
          <AnimatedHeading
            text={headingMain}
            tag="span"
            className="text-teal-brand"
          />
          {headingAccent && (
            <>
              {' '}
              <AnimatedHeading
                text={headingAccent}
                tag="span"
                delay={20}
                className="italic text-gold-brand"
              />
            </>
          )}
        </h1>

        {subheading && (
          <p className={subheadingClass}>
            {subheading}
          </p>
        )}
      </div>
    </div>
  );
}
