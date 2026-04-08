import type { Addon } from './basket-types.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  addons: Addon[];
  loading: boolean;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}

const ICON_MAP: Record<string, string> = {
  peace: '🛡️',
  mind: '🛡️',
  surf: '🏄',
  helmet: '⛑️',
  phone: '📱',
  bungee: '🔗',
  bingee: '🔗',
  lesson: '📚',
  dry: '💧',
  bag: '💧',
  repair: '🔧',
  first: '🩹',
  aid: '🩹',
  coat: '🧥',
  cloth: '🧥',
  guard: '🛡️',
  crash: '🛡️',
};

function iconForAddon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(ICON_MAP)) {
    if (lower.includes(key)) return emoji;
  }
  return '✨';
}

function priceLabel(addon: Addon): string {
  if (addon.addonType === 'per_day') {
    return addon.pricePerDay > 0 ? `${formatCurrency(addon.pricePerDay)}/day` : 'Free';
  }
  return addon.priceOneTime > 0 ? `${formatCurrency(addon.priceOneTime)} one-time` : 'Included';
}

export function AddOnsSection({ addons, loading, selectedIds, onToggle }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-sand-brand" />
        ))}
      </div>
    );
  }

  const standard = addons.filter(
    (a) => !a.name.toLowerCase().includes('transfer'),
  );

  if (standard.length === 0) return null;

  return (
    <div className="divide-y divide-charcoal-brand/[0.08]">
      {standard.map((addon) => {
        const id = Number(addon.id);
        const selected = selectedIds.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-sand-brand/30 first:pt-1 last:pb-1"
          >
            {/* Icon */}
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${
              selected ? 'bg-teal-brand/10 text-teal-brand' : 'bg-sand-brand text-charcoal-brand/50'
            }`}>
              {iconForAddon(addon.name)}
            </div>

            {/* Name + type */}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-charcoal-brand">{addon.name}</p>
              <p className="text-[12px] text-charcoal-brand/50">
                {addon.addonType === 'per_day' ? 'Per day' : 'One-time charge'}
              </p>
            </div>

            {/* Price */}
            <span className="mr-3 shrink-0 text-[14px] font-medium text-charcoal-brand/70">
              {priceLabel(addon)}
            </span>

            {/* Custom toggle */}
            <div className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors ${
              selected ? 'bg-teal-brand' : 'bg-charcoal-brand/15'
            }`}>
              <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                selected ? 'translate-x-[19px]' : 'translate-x-[3px]'
              }`} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
