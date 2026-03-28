import type { AnchorHTMLAttributes, ReactNode } from 'react';
import buttonYellow from '../../assets/Button (yellow).svg';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode };

export function PrimaryCtaLink({ className = '', children, ...props }: Props) {
  return (
    <a
      {...props}
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full font-bold text-charcoal-brand shadow-lg transition-all duration-300 ease-in-out hover:scale-105 hover:brightness-110 ${className}`}
      style={{
        backgroundImage: `url(${buttonYellow})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
      }}
    >
      <span className="relative z-10">{children}</span>
    </a>
  );
}
