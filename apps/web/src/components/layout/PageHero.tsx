import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';

interface PageHeroProps {
  headline: string;
  headlineAccent?: string;
  subheadline?: string;
  cta?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  centred?: boolean;
}

export function PageHero({ headline, headlineAccent, subheadline, cta, centred = true }: PageHeroProps) {
  const align = centred ? 'text-center items-center' : 'text-left items-start';
  return (
    <section className={`mx-auto flex max-w-5xl flex-col ${align} px-6 py-16 md:py-24`}>
      <h1 className="mb-4 font-headline text-5xl font-black leading-tight tracking-tighter text-charcoal-brand md:text-7xl">
        {headline}
        {headlineAccent && (
          <>
            <br />
            <span className="italic text-teal-brand">{headlineAccent}</span>
          </>
        )}
      </h1>
      {subheadline && (
        <p className="max-w-2xl text-lg font-medium text-charcoal-brand/80 md:text-2xl">{subheadline}</p>
      )}
      {cta && (
        <div className="mt-8">
          <PrimaryCtaButton
            href={cta.href}
            onClick={cta.onClick}
            className="inline-flex min-h-[44px] gap-3 px-8 py-4 text-lg shadow-lg"
          >
            {cta.label}
          </PrimaryCtaButton>
        </div>
      )}
    </section>
  );
}
