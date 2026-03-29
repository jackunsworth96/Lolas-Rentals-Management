import { useState } from 'react';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import { resolveImage } from '../../utils/vehicle-images.js';
import { formatCurrency } from '../../utils/currency.js';

function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

interface VehicleCardProps {
  modelId: string;
  modelName: string;
  availableCount: number;
  dailyRate: number | null;
  securityDeposit: number | null;
  nextAvailablePickup?: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export function VehicleCard({
  modelId,
  modelName,
  availableCount,
  dailyRate,
  securityDeposit,
  nextAvailablePickup,
  onToast,
}: VehicleCardProps) {
  const [loading, setLoading] = useState(false);
  const [pressDown, setPressDown] = useState(false);
  const basket = useBookingStore((s) => s.basket);
  const addToBasket = useBookingStore((s) => s.addToBasket);
  const setDates = useBookingStore((s) => s.setDates);
  const triggerSearch = useBookingStore((s) => s.triggerSearch);
  const sessionToken = useBookingStore((s) => s.sessionToken);
  const storeId = useBookingStore((s) => s.storeId);
  const pickupDatetime = useBookingStore((s) => s.pickupDatetime);
  const dropoffDatetime = useBookingStore((s) => s.dropoffDatetime);

  const isUnavailable = availableCount === 0 && !!nextAvailablePickup;

  const inBasket = basket.some((b) => b.vehicleModelId === modelId);
  const imgSrc = resolveImage(modelName);

  async function handleAddToBasket() {
    if (inBasket || loading) return;
    setPressDown(true);
    await new Promise((r) => setTimeout(r, 100));
    setPressDown(false);
    await new Promise((r) => setTimeout(r, 100));
    setLoading(true);
    try {
      const result = await api.post<{ holdId: string; sessionToken: string; expiresAt: string }>(
        '/public/booking/hold',
        { vehicleModelId: modelId, storeId, pickupDatetime, dropoffDatetime, sessionToken },
      );
      addToBasket({
        holdId: result.holdId,
        vehicleModelId: modelId,
        modelName,
        dailyRate: dailyRate ?? 0,
        securityDeposit: securityDeposit ?? 0,
        expiresAt: result.expiresAt,
      });
      onToast(`${modelName} added to your basket`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to hold vehicle';
      if (msg.toLowerCase().includes('available') || msg.includes('409')) {
        onToast('Sorry, this vehicle was just taken. Please try another.', 'error');
      } else {
        onToast(msg, 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  const scaleClass = pressDown ? 'scale-95' : 'scale-100';

  function handleNextAvailable() {
    if (!nextAvailablePickup) return;
    const pickup = new Date(nextAvailablePickup);
    const rentalMs = new Date(dropoffDatetime).getTime() - new Date(pickupDatetime).getTime();
    const newDropoff = new Date(pickup.getTime() + Math.max(rentalMs, 86400000));
    setDates(pickup.toISOString(), newDropoff.toISOString());
    triggerSearch();
    onToast('Dates updated to next available slot', 'success');
  }

  return (
    <div className={`group overflow-hidden rounded-4xl border border-sand-brand/50 bg-cream-brand shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl${isUnavailable ? ' opacity-70' : ''}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={modelName}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-sand-brand">
            <span className="text-4xl opacity-30">🏍️</span>
          </div>
        )}
        <div className="absolute left-4 top-4 flex gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${isUnavailable ? 'bg-charcoal-brand/10 text-charcoal-brand/60' : 'bg-[#D1E7E4] text-teal-brand'}`}>
            {isUnavailable ? 'Unavailable' : `${availableCount} available`}
          </span>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-2 flex items-start justify-between">
          <h3 className="font-headline text-xl font-black text-charcoal-brand">{modelName}</h3>
          <div className="text-right">
            {dailyRate != null ? (
              <p className="text-lg font-black leading-tight text-teal-brand">
                {formatCurrency(dailyRate)}
                <span className="text-xs font-bold text-charcoal-brand/60">/day</span>
              </p>
            ) : (
              <p className="text-sm text-charcoal-brand/50">—</p>
            )}
          </div>
        </div>

        {securityDeposit != null && securityDeposit > 0 && (
          <p className="mb-4 text-xs font-bold text-charcoal-brand/60">
            {formatCurrency(securityDeposit)} refundable deposit
          </p>
        )}

        {isUnavailable ? (
          <button
            type="button"
            onClick={handleNextAvailable}
            className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-teal-brand bg-transparent py-4 font-black text-teal-brand transition-all duration-300 hover:bg-teal-brand/10"
          >
            Next available: {formatSlotTime(nextAvailablePickup!)}
          </button>
        ) : inBasket ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-3xl bg-teal-brand py-4 font-black text-white transition-all duration-300 ease-in-out">
            In Basket ✓
          </div>
        ) : (
          <PrimaryCtaButton
            type="button"
            onClick={handleAddToBasket}
            disabled={loading}
            className={`flex w-full items-center justify-center gap-2 py-4 font-black transition-transform duration-150 ease-out ${scaleClass}`}
          >
            {loading ? 'Holding…' : '🛒 Add to Basket'}
          </PrimaryCtaButton>
        )}
      </div>
    </div>
  );
}
