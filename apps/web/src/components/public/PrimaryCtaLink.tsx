import { useState } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

const BASE_SHADOW = '4px 4px 0 #363737';
const HOVER_SHADOW = '6px 6px 0 #363737';
const PRESS_SHADOW = '2px 2px 0 #363737';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode };

export function PrimaryCtaLink({ className = '', children, ...props }: Props) {
  const [shadow, setShadow] = useState(BASE_SHADOW);

  return (
    <a
      {...props}
      className={`relative inline-flex items-center justify-center rounded-[6px] border-2 border-charcoal-brand bg-gold-brand font-lato text-sm font-extrabold uppercase tracking-[0.05em] text-charcoal-brand transition-[box-shadow,transform] duration-150 ease-out ${className}`}
      style={{ boxShadow: shadow }}
      onMouseEnter={() => setShadow(HOVER_SHADOW)}
      onMouseLeave={() => setShadow(BASE_SHADOW)}
      onMouseDown={() => setShadow(PRESS_SHADOW)}
      onMouseUp={() => setShadow(HOVER_SHADOW)}
    >
      <span className="relative z-10 flex w-full items-center justify-center gap-2">{children}</span>
    </a>
  );
}
