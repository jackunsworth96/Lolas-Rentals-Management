import type { Addon, TransferDetails } from './basket-types.js';

const TRANSFER_ROUTES = [
  'Airport → General Luna',
  'General Luna → Airport',
  'Airport → Cloud 9',
  'Cloud 9 → Airport',
];

interface Props {
  transferAddons: Addon[];
  transfer: TransferDetails | null;
  onTransferChange: (t: TransferDetails | null) => void;
  errors: Record<string, string>;
}

export function TransferSection({ transferAddons, transfer, onTransferChange, errors }: Props) {
  if (transferAddons.length === 0) return null;

  const sharedAddon = transferAddons.find((a) =>
    a.name.toLowerCase().includes('shared'),
  );
  const privateAddon = transferAddons.find((a) =>
    a.name.toLowerCase().includes('private') || a.name.toLowerCase().includes('tuktuk') || a.name.toLowerCase().includes('tuk'),
  );

  function selectType(type: 'shared' | 'private') {
    if (transfer?.transferType === type) {
      onTransferChange(null);
      return;
    }
    onTransferChange({
      transferType: type,
      flightNumber: transfer?.flightNumber ?? '',
      flightArrivalTime: transfer?.flightArrivalTime ?? '',
      transferRoute: transfer?.transferRoute ?? '',
    });
  }

  function updateField(field: keyof Omit<TransferDetails, 'transferType'>, value: string) {
    if (!transfer) return;
    onTransferChange({ ...transfer, [field]: value });
  }

  function priceFor(addon: Addon | undefined): string {
    if (!addon) return '';
    return addon.addonType === 'per_day'
      ? `₱${addon.pricePerDay.toLocaleString()}`
      : `₱${addon.priceOneTime.toLocaleString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sharedAddon && (
          <button
            type="button"
            onClick={() => selectType('shared')}
            className={`rounded-3xl p-5 text-left shadow-md shadow-charcoal-brand/5 transition-all duration-300 ${
              transfer?.transferType === 'shared'
                ? 'bg-cream-brand ring-2 ring-teal-brand/20'
                : 'bg-cream-brand hover:shadow-lg'
            }`}
          >
            <div className="mb-2 text-2xl">🚐</div>
            <h4 className="font-headline font-bold text-charcoal-brand">Shared Airport Transfer</h4>
            <p className="text-xs text-charcoal-brand/60">{priceFor(sharedAddon)}</p>
          </button>
        )}

        {privateAddon && (
          <button
            type="button"
            onClick={() => selectType('private')}
            className={`rounded-3xl p-5 text-left shadow-md shadow-charcoal-brand/5 transition-all duration-300 ${
              transfer?.transferType === 'private'
                ? 'bg-cream-brand ring-2 ring-teal-brand/20'
                : 'bg-cream-brand hover:shadow-lg'
            }`}
          >
            <div className="mb-2 text-2xl">🛺</div>
            <h4 className="font-headline font-bold text-charcoal-brand">Private TukTuk Transfer</h4>
            <p className="text-xs text-charcoal-brand/60">{priceFor(privateAddon)}</p>
          </button>
        )}
      </div>

      {transfer && (
        <div className="grid grid-cols-1 gap-4 rounded-3xl bg-cream-brand/60 p-5 md:grid-cols-2">
          <div className="space-y-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-teal-brand">
              Flight Number
            </label>
            <input
              type="text"
              value={transfer.flightNumber}
              onChange={(e) => updateField('flightNumber', e.target.value)}
              placeholder="e.g. 5J 123"
              autoComplete="off"
              className={`w-full rounded-2xl border-none bg-sand-brand p-4 font-bold text-charcoal-brand shadow-inner placeholder:text-charcoal-brand/30 transition-all duration-200 focus:scale-[1.01] focus:bg-white focus:ring-2 focus:ring-teal-brand ${
                errors.flightNumber ? 'ring-2 ring-red-400' : ''
              }`}
            />
            {errors.flightNumber && (
              <p className="ml-1 text-xs text-red-500">{errors.flightNumber}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-teal-brand">
              Flight Arrival Time
            </label>
            <input
              type="datetime-local"
              value={transfer.flightArrivalTime}
              onChange={(e) => updateField('flightArrivalTime', e.target.value)}
              className={`w-full rounded-2xl border-none bg-sand-brand p-4 font-bold text-charcoal-brand shadow-inner transition-all duration-200 focus:scale-[1.01] focus:bg-white focus:ring-2 focus:ring-teal-brand ${
                errors.flightArrivalTime ? 'ring-2 ring-red-400' : ''
              }`}
            />
            {errors.flightArrivalTime && (
              <p className="ml-1 text-xs text-red-500">{errors.flightArrivalTime}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-teal-brand">
              Transfer Route
            </label>
            <div className="relative">
              <select
                value={transfer.transferRoute}
                onChange={(e) => updateField('transferRoute', e.target.value)}
                className={`w-full appearance-none rounded-2xl border-none bg-sand-brand p-4 font-bold text-charcoal-brand shadow-inner transition-all duration-200 focus:scale-[1.01] focus:bg-white focus:ring-2 focus:ring-teal-brand ${
                  errors.transferRoute ? 'ring-2 ring-red-400' : ''
                }`}
              >
                <option value="">Select route…</option>
                {TRANSFER_ROUTES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-brand/40">
                ▾
              </span>
            </div>
            {errors.transferRoute && (
              <p className="ml-1 text-xs text-red-500">{errors.transferRoute}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
