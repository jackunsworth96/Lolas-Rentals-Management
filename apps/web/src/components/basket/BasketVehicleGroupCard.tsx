import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api } from '../../api/client.js';
import { useBookingStore, type BasketItem } from '../../stores/bookingStore.js';
import { HoldCountdown } from '../booking/HoldCountdown.js';
import { resolvePublicId } from '../../utils/vehicle-images.js';
import { CloudinaryImage } from '../ui/CloudinaryImage.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  items: BasketItem[];
  rentalDays: number;
  pickupLabel: string;
  dropoffLabel: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export function BasketVehicleGroupCard({ items, rentalDays, pickupLabel, dropoffLabel, onToast }: Props) {
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const sessionToken = useBookingStore((s) => s.sessionToken);
  const removeFromBasket = useBookingStore((s) => s.removeFromBasket);

  const first = items[0];
  const count = items.length;
  const publicId = resolvePublicId(first.modelName);
  const ratePerUnit = first.dailyRate;
  const groupSubtotal = ratePerUnit * rentalDays * count;

  async function handleRemove(item: BasketItem) {
    setRemovingIds((prev) => new Set(prev).add(item.holdId));
    try {
      await api.delete(`/public/booking/hold/${item.holdId}`, { sessionToken });
    } catch { /* hold may already be expired */ }
    removeFromBasket(item.holdId);
    onToast(`${item.modelName} removed from cart`, 'success');
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-charcoal-brand/10 bg-white animate-card-enter">
      {/* Image + quantity badge */}
      <div className="relative w-full overflow-hidden bg-white" style={{ maxHeight: 160 }}>
        {publicId ? (
          <CloudinaryImage
            publicId={publicId}
            alt={first.modelName}
            className="h-40 w-full object-contain p-4"
          />
        ) : (
          <div className="flex h-40 items-center justify-center">
            <span className="text-5xl opacity-20">🏍️</span>
          </div>
        )}
        {count > 1 && (
          <span className="absolute right-3 top-3 flex h-7 min-w-[28px] items-center justify-center rounded-full bg-teal-brand px-2 text-[12px] font-bold text-white shadow">
            ×{count}
          </span>
        )}
      </div>

      <div className="space-y-3 p-4">
        {/* Name + date + days pill */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-medium text-charcoal-brand">{first.modelName}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-charcoal-brand/50">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-teal-brand/70" strokeWidth={2} aria-hidden />
              <span>{pickupLabel} → {dropoffLabel}</span>
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-sand-brand px-2.5 py-0.5 text-[11px] font-medium text-charcoal-brand/70">
            {rentalDays} Day{rentalDays !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Rate + group total */}
        <div className="flex items-center justify-between border-t border-charcoal-brand/[0.08] pt-3">
          <p className="text-[13px] text-charcoal-brand/50">
            {formatCurrency(ratePerUnit)}/day{count > 1 ? ` × ${count}` : ''}
          </p>
          <p className="text-[14px] font-medium text-charcoal-brand">
            {formatCurrency(groupSubtotal)}
          </p>
        </div>

        {/* Individual hold rows */}
        <div className="space-y-1.5 border-t border-charcoal-brand/[0.08] pt-3">
          {items.map((item, i) => (
            <div key={item.holdId} className="flex items-center justify-between gap-2">
              {count > 1 && (
                <span className="shrink-0 text-[11px] font-semibold text-charcoal-brand/40">
                  #{i + 1}
                </span>
              )}
              <HoldCountdown
                expiresAt={item.expiresAt}
                onExpired={() => {
                  removeFromBasket(item.holdId);
                  onToast(`${item.modelName} hold expired`, 'error');
                }}
              />
              <button
                type="button"
                onClick={() => { void handleRemove(item); }}
                disabled={removingIds.has(item.holdId)}
                className="shrink-0 text-[12px] font-medium text-red-400 transition-colors hover:text-red-600 disabled:opacity-40"
              >
                {removingIds.has(item.holdId) ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
