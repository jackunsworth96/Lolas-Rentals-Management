import type { ReactNode } from 'react';

interface SectionWrapperProps {
  children: ReactNode;
  background?: 'cream' | 'sand' | 'teal' | 'transparent';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const BG: Record<string, string> = {
  cream: 'bg-cream-brand',
  sand: 'bg-sand-brand',
  teal: 'bg-teal-brand',
  transparent: '',
};

const MW: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-7xl',
  full: 'max-w-full',
};

export function SectionWrapper({
  children,
  background = 'transparent',
  maxWidth = 'xl',
  className = '',
}: SectionWrapperProps) {
  return (
    <section className={`px-6 py-16 ${BG[background]} ${className}`}>
      <div className={`mx-auto ${MW[maxWidth]}`}>{children}</div>
    </section>
  );
}
