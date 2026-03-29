interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  accent?: string;
}

export function SectionHeading({ title, subtitle, align = 'center', accent }: SectionHeadingProps) {
  return (
    <div className={`mb-12 ${align === 'center' ? 'text-center' : 'text-left'}`}>
      <h2 className="font-headline text-3xl font-black text-charcoal-brand md:text-4xl">
        {title}
        {accent && <span className="italic text-gold-brand"> {accent}</span>}
      </h2>
      {subtitle && <p className="mt-3 text-sm text-charcoal-brand/70 md:text-base">{subtitle}</p>}
    </div>
  );
}
