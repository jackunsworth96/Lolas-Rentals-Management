import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Addon } from './basket-types.js';
import { formatCurrency } from '../../utils/currency.js';
import { phoneIcon } from '../public/customerContactIcons.js';
import peaceOfMindIcon from '../../assets/Basket/Peace of Mind.svg';
import surfRackIcon from '../../assets/Basket/Surf Rack Icon.svg';
import bungeeCordIcon from '../../assets/Basket/Bungee Cord Icon.svg';
import ninePmReturnIcon from '../../assets/Basket/9PM Return Icon.svg';

/** Matches the 9PM late-return add-on from the catalog (name varies slightly by store). */
export function isNinePmReturnAddonName(name: string): boolean {
  const n = name.toLowerCase();
  const hasReturn = n.includes('return');
  const hasNinePm =
    /\b9\s*pm\b/i.test(name) ||
    n.includes('9pm') ||
    n.includes('21:00') ||
    n.includes('ninepm');
  return hasReturn && hasNinePm;
}

interface Props {
  addons: Addon[];
  loading: boolean;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  /** When false, the 9PM return row is visible but not selectable (requires 4:45pm dropoff). */
  ninePmReturnEligible: boolean;
  ninePmRemovedNotice?: boolean;
  onDismissNinePmRemovedNotice?: () => void;
}

const ICON_MAP: Record<string, string> = {
  peace: '🛡️',
  mind: '🛡️',
  surf: '🏄',
  helmet: '⛑️',
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

function basketAssetIconSrc(name: string): string | null {
  if (isNinePmReturnAddonName(name)) return ninePmReturnIcon;
  const lower = name.toLowerCase();
  if (lower.includes('peace') || lower.includes('mind')) return peaceOfMindIcon;
  if (lower.includes('surf')) return surfRackIcon;
  if (lower.includes('bungee') || lower.includes('bingee')) return bungeeCordIcon;
  return null;
}

function renderAddonIcon(name: string): ReactNode {
  const lower = name.toLowerCase();
  if (lower.includes('phone')) {
    return <img src={phoneIcon} alt="" className="h-5 w-5 object-contain" width={20} height={20} />;
  }
  const assetSrc = basketAssetIconSrc(name);
  if (assetSrc) {
    return (
      <img
        src={assetSrc}
        alt=""
        className="h-5 w-5 object-contain"
        width={20}
        height={20}
        aria-hidden
      />
    );
  }
  return iconForAddon(name);
}

function priceLabel(addon: Addon): string {
  if (addon.addonType === 'per_day') {
    return addon.pricePerDay > 0 ? `${formatCurrency(addon.pricePerDay)}/day` : 'Free';
  }
  return addon.priceOneTime > 0 ? `${formatCurrency(addon.priceOneTime)} one-time` : 'Included';
}

export function AddOnsSection({
  addons,
  loading,
  selectedIds,
  onToggle,
  ninePmReturnEligible,
  ninePmRemovedNotice = false,
  onDismissNinePmRemovedNotice,
}: Props) {
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

  const ninePmNoticeAddonId = standard.find((a) => isNinePmReturnAddonName(a.name))?.id;

  return (
    <div className="divide-y divide-charcoal-brand/[0.08]">
      {standard.map((addon) => {
        const id = Number(addon.id);
        const selected = selectedIds.has(id);
        const isNinePm = isNinePmReturnAddonName(addon.name);
        const rowDisabled = isNinePm && !ninePmReturnEligible;
        return (
          <div key={id} className="first:pt-1 last:pb-1">
            <button
              type="button"
              disabled={rowDisabled}
              onClick={() => {
                if (!rowDisabled) onToggle(id);
              }}
              className={`flex w-full items-center gap-3 py-3 text-left transition-colors ${
                rowDisabled
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:bg-sand-brand/30'
              }`}
            >
              {/* Icon */}
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${
                selected ? 'bg-teal-brand/10 text-teal-brand' : 'bg-sand-brand text-charcoal-brand/50'
              }`}>
                {renderAddonIcon(addon.name)}
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

            {rowDisabled && (
              <p className="pb-2 pl-12 pr-2 text-[11px] leading-snug text-charcoal-brand/55">
                Only available with a 4:45pm return time — update your return time to unlock this option
              </p>
            )}

            {isNinePm &&
              ninePmRemovedNotice &&
              ninePmNoticeAddonId !== undefined &&
              Number(addon.id) === Number(ninePmNoticeAddonId) && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                <span className="min-w-0 flex-1">
                  9pm return removed — only available with a 4:45pm dropoff
                </span>
                {onDismissNinePmRemovedNotice && (
                  <button
                    type="button"
                    onClick={onDismissNinePmRemovedNotice}
                    className="shrink-0 rounded p-0.5 text-amber-800/70 hover:bg-amber-100 hover:text-amber-900"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
