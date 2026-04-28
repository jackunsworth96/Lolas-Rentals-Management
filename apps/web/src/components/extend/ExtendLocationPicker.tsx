import { formatCurrency } from '../../utils/currency.js';

export interface AvailableLocation {
  id: number;
  name: string;
  deliveryCost: number;
  collectionCost: number;
  locationType: string | null;
}

interface Props {
  availableLocations: AvailableLocation[];
  currentDropoffLocationId: number | null;
  currentDropoffFee: number;
  selectedLocationId: number | null;
  locationAddress: string;
  onSelectLocation: (id: number | null) => void;
  onChangeAddress: (address: string) => void;
}

function isStoreLocation(loc: AvailableLocation): boolean {
  return (
    Number(loc.collectionCost) === 0 &&
    Number(loc.deliveryCost) === 0 &&
    (loc.locationType === 'store' || loc.locationType === null)
  );
}

export function ExtendLocationPicker({
  availableLocations,
  currentDropoffLocationId,
  currentDropoffFee,
  selectedLocationId,
  locationAddress,
  onSelectLocation,
  onChangeAddress,
}: Props) {
  if (availableLocations.length === 0) return null;

  const currentLoc = availableLocations.find((l) => l.id === currentDropoffLocationId);
  const selectedLoc = selectedLocationId != null
    ? availableLocations.find((l) => l.id === selectedLocationId)
    : null;

  const effectiveLoc = selectedLoc ?? currentLoc;
  const isNonStore = effectiveLoc ? !isStoreLocation(effectiveLoc) : false;

  // delta vs current fee
  const newFee = selectedLoc ? Number(selectedLoc.collectionCost) : currentDropoffFee;
  const delta = Math.round((newFee - currentDropoffFee) * 100) / 100;
  const locationChanged = selectedLocationId != null && selectedLocationId !== currentDropoffLocationId;

  return (
    <div className="rounded-2xl border border-sand-brand bg-white p-5 shadow-sm">
      <p className="mb-1 font-headline text-base font-black text-charcoal-brand">Return Location</p>
      {currentLoc && (
        <p className="mb-3 text-xs font-semibold text-charcoal-brand/50">
          Current: {currentLoc.name}
          {currentDropoffFee > 0 ? ` — ${formatCurrency(currentDropoffFee)} collection fee` : ' — Free'}
        </p>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-charcoal-brand/70 mb-1">
            Change return location
          </label>
          <select
            value={selectedLocationId ?? currentDropoffLocationId ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              onSelectLocation(val === '' ? null : Number(val));
              onChangeAddress('');
            }}
            className="w-full rounded-xl border border-sand-brand bg-white px-3 py-2.5 text-sm font-semibold text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
          >
            {availableLocations.map((loc) => {
              const free = isStoreLocation(loc);
              const cost = Number(loc.collectionCost);
              const label = free
                ? `${loc.name} — Free (Store)`
                : `${loc.name} — ${formatCurrency(cost)} collection fee`;
              return (
                <option key={loc.id} value={loc.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        {/* Address input — shown for non-store locations */}
        {isNonStore && (
          <div>
            <label className="block text-xs font-bold text-charcoal-brand/70 mb-1">
              Exact address / landmark <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={locationAddress}
              onChange={(e) => onChangeAddress(e.target.value)}
              placeholder="e.g. Blue Lagoon Resort, Cloud 9 area"
              className="w-full rounded-xl border border-sand-brand px-3 py-2.5 text-sm text-charcoal-brand placeholder:text-charcoal-brand/30 focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
            />
          </div>
        )}

        {/* Delta indicator */}
        {locationChanged && (
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
              delta > 0
                ? 'bg-amber-50 text-amber-700'
                : delta < 0
                  ? 'bg-teal-50 text-teal-700'
                  : 'bg-sand-brand/60 text-charcoal-brand/60'
            }`}
          >
            {delta > 0 && <span>+{formatCurrency(delta)} collection fee will be added</span>}
            {delta < 0 && <span>{formatCurrency(Math.abs(delta))} credit — your balance will be reduced</span>}
            {delta === 0 && <span>No change in collection fee</span>}
          </div>
        )}
      </div>
    </div>
  );
}
