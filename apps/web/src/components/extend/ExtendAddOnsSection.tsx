import { formatCurrency } from '../../utils/currency.js';
import { isNinePmReturnAddonName } from '../basket/AddOnsSection.js';
import iconNinePm from '../../assets/Basket/9PM Return Icon.svg';

const NINE_PM_REQUIRED_TIME = '16:45';

export interface CatalogAddon {
  id: number;
  name: string;
  addon_type: string;
  price_one_time: number;
}

export interface CurrentOrderAddon {
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
}

interface Props {
  /** Existing add-ons already on the order */
  currentOrderAddons: CurrentOrderAddon[];
  /** Full catalog of active add-ons for the store */
  catalogAddons: CatalogAddon[];
  /** IDs of catalog add-ons the customer has toggled on */
  selectedAddonIds: number[];
  /** Whether the 9PM add-on is currently selected */
  ninePmSelected: boolean;
  /** Number of extension days — used to show per-day add-on adjustment cost */
  extensionDays: number;
  /** Original rental days — used to derive the actual per-day rate from total_amount */
  originalRentalDays: number;
  /** Selected return time — used to gate 9PM add-on availability */
  selectedTime: string;
  onToggleAddon: (id: number) => void;
}

function AddonIcon({ name }: { name: string }) {
  if (isNinePmReturnAddonName(name)) {
    return <img src={iconNinePm} alt="" className="h-6 w-6 shrink-0 object-contain" />;
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-brand/10 text-[11px] font-black text-teal-brand">
      +
    </span>
  );
}

export function ExtendAddOnsSection({
  currentOrderAddons,
  catalogAddons,
  selectedAddonIds,
  ninePmSelected,
  extensionDays,
  originalRentalDays,
  selectedTime,
  onToggleAddon,
}: Props) {
  // Names already on the order (lowercase for matching)
  const existingNames = new Set(currentOrderAddons.map((a) => a.addonName.toLowerCase()));

  // Only show one-time add-ons in the customer-facing picker (per-day requires staff inspection)
  const availableOneTime = catalogAddons.filter(
    (ca) => ca.addon_type === 'one_time' && !existingNames.has(ca.name.toLowerCase()),
  );

  const ninePmEligible = selectedTime === NINE_PM_REQUIRED_TIME;

  const hasExisting = currentOrderAddons.length > 0;
  const hasAvailable = availableOneTime.length > 0;

  if (!hasExisting && !hasAvailable) return null;

  return (
    <div className="rounded-2xl border border-sand-brand bg-white p-5 shadow-sm">
      <p className="mb-4 font-headline text-base font-black text-charcoal-brand">Add-ons</p>

      {/* ── Existing add-ons (read-only) ── */}
      {hasExisting && (
        <div className="mb-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-charcoal-brand/40">
            On your rental
          </p>
          {currentOrderAddons.map((addon) => {
            const isPerDay = addon.addonType === 'per_day';
            // Derive the per-day rate from total_amount / originalRentalDays to handle
            // bookings where quantity stores rental days rather than unit count.
            const perDayRate = originalRentalDays > 0 ? addon.totalAmount / originalRentalDays : addon.addonPrice;
            const extraCost = isPerDay ? Math.round(perDayRate * extensionDays * 100) / 100 : 0;
            return (
              <div
                key={addon.addonName}
                className="flex items-start justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-green-800">{addon.addonName}</p>
                  {isPerDay && extensionDays > 0 ? (
                    <p className="mt-0.5 text-xs font-semibold text-green-700">
                      Adjusted for new dates — +{formatCurrency(extraCost)} for {extensionDays} extra day{extensionDays !== 1 ? 's' : ''}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs font-semibold text-green-700">Already included</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-green-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-green-800">
                  Active
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Available one-time add-ons ── */}
      {hasAvailable && (
        <div className="space-y-2">
          {hasExisting && (
            <p className="text-[10px] font-black uppercase tracking-widest text-charcoal-brand/40">
              Add to your extension
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableOneTime.map((ca) => {
              const price = Number(ca.price_one_time ?? 0);
              const isNinePm = isNinePmReturnAddonName(ca.name);
              const isSelected = isNinePm ? ninePmSelected : selectedAddonIds.includes(ca.id);
              const isLocked = isNinePm && !ninePmEligible;

              return (
                <button
                  key={ca.id}
                  type="button"
                  onClick={() => !isLocked && onToggleAddon(ca.id)}
                  disabled={isLocked}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${
                    isLocked
                      ? 'cursor-not-allowed border-sand-brand bg-sand-brand/30 opacity-60'
                      : isSelected
                        ? 'border-teal-brand/40 bg-teal-50 text-teal-800'
                        : 'border-sand-brand bg-white text-charcoal-brand hover:bg-sand-brand/60'
                  }`}
                >
                  <AddonIcon name={ca.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{ca.name}</p>
                    {isLocked ? (
                      <p className="text-xs font-semibold text-charcoal-brand/50">
                        Select 4:45 PM to qualify
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-charcoal-brand/60">
                        {formatCurrency(price)} one-time
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-black text-sm">{formatCurrency(price)}</p>
                    {isSelected && !isLocked && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-teal-brand">
                        Added
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
