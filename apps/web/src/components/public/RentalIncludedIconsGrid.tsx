import { HOME_INCLUDED_RENTAL_ITEMS, HOME_OPTIONAL_ADDON_ITEMS } from '../../data/home-included-rental-items.js';

interface Props {
  /** Larger icons + heading inside bordered panel (confirmation / extend) */
  variant?: 'card' | 'compact';
  /** Show "What's included" heading (default true for card) */
  showHeading?: boolean;
  /** Also render the optional add-on icons (no fade, single line on desktop) */
  showOptionals?: boolean;
  className?: string;
}

export function RentalIncludedIconsGrid({
  variant = 'card',
  showHeading,
  showOptionals = false,
  className = '',
}: Props) {
  const showTitle = showHeading ?? variant === 'card';
  const isCompact = variant === 'compact';

  const iconCls = `object-contain ${isCompact ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-8 w-8'}`;
  const itemCls = `flex flex-col items-center gap-1.5 ${isCompact ? 'w-[3.75rem] sm:w-[4.25rem]' : 'w-[4.5rem]'}`;
  const labelCls = `font-lato text-center font-semibold leading-tight text-charcoal-brand/85 ${
    isCompact ? 'text-[9px] sm:text-[10px]' : 'text-[10px]'
  }`;

  const allItems = showOptionals
    ? [...HOME_INCLUDED_RENTAL_ITEMS, ...HOME_OPTIONAL_ADDON_ITEMS]
    : HOME_INCLUDED_RENTAL_ITEMS;

  if (showOptionals) {
    return (
      <div className={className}>
        {showTitle && (
          <p
            className={`font-lato mb-2 text-center font-black uppercase tracking-wider text-charcoal-brand/50 ${
              isCompact ? 'text-[9px]' : 'text-[10px]'
            }`}
          >
            What&apos;s included
          </p>
        )}

        {/* Mobile: two wrapped rows with a divider between included and add-ons */}
        <div className="sm:hidden">
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-3">
            {HOME_INCLUDED_RENTAL_ITEMS.map(({ icon, label }) => (
              <div key={label} className={itemCls}>
                <img src={icon} alt="" className={iconCls} width={32} height={32} />
                <span className={labelCls}>{label}</span>
              </div>
            ))}
          </div>
          <div className="mx-auto my-3 max-w-xs border-t border-teal-brand/15" />
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-3">
            {HOME_OPTIONAL_ADDON_ITEMS.map(({ icon, label }) => (
              <div key={label} className={itemCls}>
                <img src={icon} alt="" className={iconCls} width={32} height={32} />
                <span className={labelCls}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: all 11 in one line */}
        <div className="hidden sm:flex sm:flex-wrap sm:justify-center sm:gap-x-3 sm:gap-y-3">
          {allItems.map(({ icon, label }) => (
            <div key={label} className="flex w-[4.25rem] flex-col items-center gap-1.5">
              <img src={icon} alt="" className="h-8 w-8 object-contain" width={32} height={32} />
              <span className="font-lato text-center text-[10px] font-semibold leading-tight text-charcoal-brand/85">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* Default (no optionals) — original behaviour */
  return (
    <div className={className}>
      {showTitle && (
        <p
          className={`font-lato text-center font-black uppercase tracking-wider text-charcoal-brand/50 ${
            isCompact ? 'mb-2 text-[9px]' : 'mb-3 text-[10px]'
          }`}
        >
          What&apos;s included
        </p>
      )}
      <div
        className={
          isCompact
            ? 'flex flex-wrap justify-center gap-x-2 gap-y-3 sm:gap-x-3'
            : 'flex flex-wrap justify-center gap-x-3 gap-y-4 sm:gap-x-4'
        }
      >
        {HOME_INCLUDED_RENTAL_ITEMS.map(({ icon, label }) => (
          <div key={label} className={itemCls}>
            <img src={icon} alt="" className={iconCls} width={32} height={32} />
            <span className={labelCls}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
