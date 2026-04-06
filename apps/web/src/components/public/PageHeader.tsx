interface PageHeaderProps {
  eyebrow?: string;
  headingMain: string;
  headingAccent?: string;
  subheading?: string;
  /** Override the outer wrapper's padding/spacing classes (default: "px-6 py-16 text-center") */
  className?: string;
}

export function PageHeader({
  eyebrow,
  headingMain,
  headingAccent,
  subheading,
  className = 'px-6 py-16 text-center',
}: PageHeaderProps) {
  return (
    <div className={className}>
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
            className="mx-auto mt-4 max-w-xl font-lato"
            style={{ fontSize: 18, color: '#363737', lineHeight: 1.6 }}
          >
            {subheading}
          </p>
        )}
      </div>
    </div>
  );
}
