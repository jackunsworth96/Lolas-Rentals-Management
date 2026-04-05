interface PageHeaderProps {
  eyebrow?: string;
  headingMain: string;
  headingAccent?: string;
  subheading?: string;
}

export function PageHeader({
  eyebrow,
  headingMain,
  headingAccent,
  subheading,
}: PageHeaderProps) {
  return (
    <div
      className="px-6 py-0 text-center"
      style={{ backgroundColor: '#f1e6d6' }}
    >
      <div className="mx-auto max-w-3xl">
        {eyebrow && (
          <p
            className="mb-3 font-bold uppercase tracking-widest text-teal-brand"
            style={{ fontFamily: 'Lato, sans-serif', fontSize: '11px' }}
          >
            {eyebrow}
          </p>
        )}

        <h1
          className="font-headline font-black text-teal-brand"
          style={{ fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.15 }}
        >
          {headingMain}
          {headingAccent && (
            <span className="italic text-gold-brand"> {headingAccent}</span>
          )}
        </h1>

        {subheading && (
          <p
            className="mx-auto mt-4 max-w-xl leading-relaxed text-charcoal-brand/70"
            style={{ fontFamily: 'Lato, sans-serif', fontSize: '16px' }}
          >
            {subheading}
          </p>
        )}
      </div>
    </div>
  );
}
