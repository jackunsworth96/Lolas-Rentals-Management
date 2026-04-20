import { HOME_INCLUDED_RENTAL_ITEMS, HOME_OPTIONAL_ADDON_ITEMS } from '../../data/home-included-rental-items.js';

interface Props {
  /** Larger icons + heading inside bordered panel (confirmation / extend) */
  variant?: 'card' | 'compact';
  /** Show "What's included" heading (default true for card) */
  showHeading?: boolean;
  /** Also render the optional add-on icons below a divider */
  showOptionals?: boolean;
  className?: string;
}

/**
 * Grid of standard inclusions. When showOptionals is true a second row of
 * optional add-on icons (seat cloth, damage protection, etc.) is shown
 * below a divider with a lighter label style.
 */
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
  const labelCls = `font-lato text-center font-semibold leading-tight ${isCompact ? 'text-[9px] sm:text-[10px]' : 'text-[10px]'}`;
  const rowCls = isCompact
    ? 'flex flex-wrap justify-center gap-x-2 gap-y-3 sm:gap-x-3'
    : 'flex flex-wrap justify-center gap-x-3 gap-y-4 sm:gap-x-4';

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

      {/* Included items */}
      <div className={rowCls}>
        {HOME_INCLUDED_RENTAL_ITEMS.map(({ icon, label }) => (
          <div key={label} className={itemCls}>
            <img src={icon} alt="" className={iconCls} width={32} height={32} />
            <span className={`${labelCls} text-charcoal-brand/85`}>{label}</span>
          </div>
        ))}
      </div>

      {/* Optional add-ons row */}
      {showOptionals && (
        <>
          <div className={`mx-auto my-3 border-t border-teal-brand/15 ${isCompact ? 'max-w-xs' : 'max-w-sm'}`} />
          {showTitle && (
            <p
              className={`font-lato mb-2 text-center font-black uppercase tracking-wider text-charcoal-brand/35 ${
                isCompact ? 'text-[9px]' : 'text-[10px]'
              }`}
            >
              Available add-ons
            </p>
          )}
          <div className={rowCls}>
            {HOME_OPTIONAL_ADDON_ITEMS.map(({ icon, label }) => (
              <div key={label} className={itemCls}>
                <img src={icon} alt="" className={`${iconCls} opacity-70`} width={32} height={32} />
                <span className={`${labelCls} text-charcoal-brand/55`}>{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
