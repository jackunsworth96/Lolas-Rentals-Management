export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
  /** Shown as a tooltip, e.g. why the option is disabled. */
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  /** A value that matches no option (e.g. a custom mix) leaves every segment unselected. */
  value: string;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel, size = 'md', disabled = false,
}: SegmentedControlProps<T>) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-0.5"
    >
      {options.map((o) => {
        const selected = o.id === value;
        const isDisabled = disabled || o.disabled;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isDisabled}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`shrink-0 whitespace-nowrap rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${pad} ${
              selected
                ? 'bg-white text-teal-brand shadow-sm ring-1 ring-gray-200'
                : 'text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-gray-600'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
