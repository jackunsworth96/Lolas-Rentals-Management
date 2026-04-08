import { useState } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

const BASE_SHADOW = '4px 4px 0 #363737';
const HOVER_SHADOW = '6px 6px 0 #363737';
const PRESS_SHADOW = '2px 2px 0 #363737';

/** Retro box-shadow CTA button. Matches the "Book Your Ride" style on the home page. */
const baseClass =
  'relative inline-flex items-center justify-center rounded-[6px] border-2 border-charcoal-brand bg-gold-brand font-lato text-sm font-extrabold uppercase tracking-[0.05em] text-charcoal-brand transition-[box-shadow,transform] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none';

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; href?: string };

export function PrimaryCtaButton({ className = '', children, type = 'button', href, ...props }: Props) {
  const [shadow, setShadow] = useState(BASE_SHADOW);

  const cls = `${baseClass} ${className}`;
  const style = { boxShadow: shadow };

  const interact = {
    onMouseEnter: () => setShadow(HOVER_SHADOW),
    onMouseLeave: () => setShadow(BASE_SHADOW),
    onMouseDown: () => setShadow(PRESS_SHADOW),
    onMouseUp: () => setShadow(HOVER_SHADOW),
  };

  if (href) {
    return (
      <a href={href} {...props} className={cls} style={style} {...interact}>
        <span className="relative z-10 flex w-full items-center justify-center gap-2">{children}</span>
      </a>
    );
  }
  return (
    <button type={type} {...props} className={cls} style={style} {...interact}>
      <span className="relative z-10 flex w-full items-center justify-center gap-2">{children}</span>
    </button>
  );
}
