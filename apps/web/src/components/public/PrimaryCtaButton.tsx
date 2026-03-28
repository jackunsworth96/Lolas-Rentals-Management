import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import buttonYellow from '../../assets/Button (yellow).svg';

const baseClass =
  'relative inline-flex items-center justify-center overflow-hidden rounded-full font-bold text-charcoal-brand shadow-md transition-all duration-300 ease-in-out hover:scale-105 hover:brightness-110 disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100 disabled:hover:brightness-100';

const bgStyle = {
  backgroundImage: `url(${buttonYellow})`,
  backgroundSize: '100% 100%' as const,
  backgroundRepeat: 'no-repeat' as const,
  backgroundPosition: 'center' as const,
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; href?: string };

export function PrimaryCtaButton({ className = '', children, type = 'button', href, ...props }: Props) {
  const cls = `${baseClass} ${className}`;
  if (href) {
    return (
      <a href={href} className={cls} style={bgStyle} {...props}>
        <span className="relative z-10 flex w-full items-center justify-center gap-2">{children}</span>
      </a>
    );
  }
  return (
    <button type={type} {...props} className={cls} style={bgStyle}>
      <span className="relative z-10 flex w-full items-center justify-center gap-2">{children}</span>
    </button>
  );
}
