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
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-3xl bg-sand-brand" />
        ))}
      </div>
    );
  }

  if (addons.length === 0) return null;

  const standard = addons.filter(
    (a) => !a.name.toLowerCase().includes('transfer'),
  );

  return (
    <div className="space-y-4">
      {standard.map((addon) => {
        const id = Number(addon.id);
        const selected = selectedIds.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            className={`flex w-full items-center justify-between rounded-3xl p-5 shadow-md shadow-charcoal-brand/5 transition-all duration-300 ${
              selected
                ? 'bg-cream-brand ring-2 ring-teal-brand/20'
                : 'bg-cream-brand hover:shadow-lg'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${selected ? 'bg-gold-brand/20' : 'bg-teal-brand/10'}`}>
                {iconForAddon(addon.name)}
              </div>
              <div className="text-left">
                <h4 className="font-headline font-bold text-charcoal-brand">{addon.name}</h4>
                <p className="text-xs text-charcoal-brand/60">{priceLabel(addon)}</p>
              </div>
            </div>
            {selected ? (
              <span className="rounded-full bg-gold-brand px-4 py-2 text-xs font-bold uppercase text-charcoal-brand">
                Selected
              </span>
            ) : (
              <div className="h-8 w-14 rounded-full bg-sand-brand p-1">
                <div className="h-6 w-6 rounded-full bg-white/50" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
