import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { PesoSign } from '../ui/PesoSign.js';
import {
  presentLeg,
  type FeeKind,
  type FeeLocation,
  type FeePresentation,
} from '../../utils/locationFeeDisplay.js';

interface LocationFeeMenuProps {
  label: string;
  feeLabel: string;
  locations: FeeLocation[];
  value: number | null;
  kind: FeeKind;
  /** Locations included in the partner's free-delivery offer. Badged in the open list. */
  offerLocationIds: ReadonlySet<number>;
  /** True only when the current pickup and return pair actually receives the waiver. */
  pairIsFree: boolean;
  describedBy?: string;
  onChange: (locationId: number) => void;
}

const triggerClass =
  'flex w-full items-center justify-between gap-2 rounded-xl border border-[#d1c4b0] bg-white px-4 py-2.5 text-left text-sm font-medium text-charcoal-brand shadow-sm transition-all duration-200 focus:border-[#00577C] focus:outline-none focus:ring-2 focus:ring-[#00577C]/25';

function formatAmount(amount: number): string {
  return amount.toLocaleString('en-PH', { maximumFractionDigits: 0 });
}

function PriceTag({ presentation, onDark }: { presentation: FeePresentation; onDark: boolean }) {
  if (presentation.type === 'hidden') return null;
  if (presentation.type === 'price') {
    return (
      <span className={`shrink-0 font-semibold ${onDark ? 'text-white' : 'text-charcoal-brand/70'}`}>
        <PesoSign />{formatAmount(presentation.amount)}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span className={`font-medium line-through ${onDark ? 'text-white/70' : 'text-charcoal-brand/40'}`}>
        <PesoSign />{formatAmount(presentation.amount)}
      </span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide ${
          onDark ? 'bg-white text-teal-800' : 'bg-teal-700 text-white'
        }`}
      >
        Free
      </span>
    </span>
  );
}

/**
 * Custom location menu. Native select options cannot draw a struck-through
 * price or a Free badge, including on phone pickers.
 */
export function LocationFeeMenu({
  label,
  feeLabel,
  locations,
  value,
  kind,
  offerLocationIds,
  pairIsFree,
  describedBy,
  onChange,
}: LocationFeeMenuProps) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = locations.find((loc) => loc.id === value) ?? null;
  const selectedIndex = Math.max(0, locations.findIndex((loc) => loc.id === value));
  const selectedWaived = Boolean(selected && pairIsFree && offerLocationIds.has(selected.id));
  const selectedPresentation = selected
    ? presentLeg(selected, kind, selectedWaived)
    : { type: 'hidden' as const };

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!list || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [open, activeIndex]);

  function openMenu() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function commit(index: number) {
    const loc = locations[index];
    if (!loc) return;
    onChange(loc.id);
    setOpen(false);
  }

  function move(index: number) {
    if (locations.length === 0) return;
    const next = (index + locations.length) % locations.length;
    setActiveIndex(next);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) openMenu();
      else move(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) openMenu();
      else move(activeIndex - 1);
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      move(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      move(locations.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) openMenu();
      else commit(activeIndex);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const activeLocation = locations[activeIndex];

  return (
    <div ref={rootRef} className="space-y-1.5">
      <label id={`${uid}-label`} className="ml-1 block text-xs font-bold uppercase tracking-wider text-teal-700">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          className={triggerClass}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={selected ? `${label}, ${selected.name}` : label}
          aria-controls={`${uid}-list`}
          aria-activedescendant={open && activeLocation ? `${uid}-opt-${activeLocation.id}` : undefined}
          aria-describedby={describedBy}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="truncate">{selected?.name ?? 'Select…'}</span>
          <span className="shrink-0 text-xs text-charcoal-brand/40" aria-hidden>▾</span>
        </button>
        {open && (
          <ul
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            aria-labelledby={`${uid}-label`}
            className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[#d1c4b0] bg-white py-1 shadow-lg"
          >
            {locations.map((loc, index) => {
              const offered = offerLocationIds.has(loc.id);
              const presentation = presentLeg(loc, kind, offered);
              const active = index === activeIndex;
              return (
                <li
                  key={loc.id}
                  id={`${uid}-opt-${loc.id}`}
                  data-index={index}
                  role="option"
                  aria-selected={loc.id === value}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm ${
                    active ? 'bg-[#00577C] text-white' : 'text-charcoal-brand'
                  } ${loc.id === value && !active ? 'font-semibold' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(index)}
                >
                  <span className="min-w-0 flex-1 text-left leading-snug">{loc.name}</span>
                  <PriceTag presentation={presentation} onDark={active} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selectedPresentation.type === 'price' && (
        <p className="ml-1 text-xs font-semibold text-teal-700">
          {feeLabel}: <PesoSign />{formatAmount(selectedPresentation.amount)}
        </p>
      )}
      {selectedPresentation.type === 'waived' && (
        <p className="ml-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-teal-700">
          <span>{feeLabel}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium text-charcoal-brand/40 line-through">
              <PesoSign />{formatAmount(selectedPresentation.amount)}
            </span>
            <span className="rounded-full bg-teal-700 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white">
              Free
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
