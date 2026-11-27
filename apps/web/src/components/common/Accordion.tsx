import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionItemProps {
  title: React.ReactNode;
  /** Shown beside the title, always visible (e.g. a level picker). Clicks here do not toggle the item. */
  aside?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state; overrides internal state when set. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AccordionItem({ title, aside, subtitle, children, defaultOpen = false, open, onOpenChange }: AccordionItemProps) {
  const [internal, setInternal] = useState(defaultOpen);
  const isOpen = open ?? internal;
  const id = useId();
  const toggle = () => {
    setInternal(!isOpen);
    onOpenChange?.(!isOpen);
  };

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={id}
          className="flex min-w-0 flex-1 items-start gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900">{title}</span>
            {subtitle && <span className="block text-xs text-gray-500">{subtitle}</span>}
          </span>
        </button>
        {aside && <div className="pl-6 sm:pl-0">{aside}</div>}
      </div>
      {isOpen && (
        <div id={id} className="pb-4 pl-6">
          {children}
        </div>
      )}
    </div>
  );
}
