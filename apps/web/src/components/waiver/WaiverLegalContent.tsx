import { getWaiverSections } from '../../content/waiver-agreement-text.js';

type WaiverLegalContentProps = {
  /** e.g. text-xs sm:text-sm for the signing flow */
  bodyTextClassName?: string;
  className?: string;
};

export function WaiverLegalContent({ bodyTextClassName = 'text-sm', className = '' }: WaiverLegalContentProps) {
  const sections = getWaiverSections();
  return (
    <div className={`space-y-5 ${className}`}>
      {sections.map(({ heading, body }, index) => (
        <section key={`${index}-${heading.slice(0, 24)}`}>
          <h3 className="mb-2 font-lato font-bold text-charcoal-brand">{heading}</h3>
          <p className={`font-lato leading-relaxed text-charcoal-brand whitespace-pre-line ${bodyTextClassName}`}>
            {body}
          </p>
        </section>
      ))}
    </div>
  );
}
