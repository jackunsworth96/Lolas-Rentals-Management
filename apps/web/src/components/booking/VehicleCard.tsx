import { useState } from 'react';
import { api } from '../../api/client.js';
import { useBookingStore, type BasketItem } from '../../stores/bookingStore.js';
import hondaBeatImg from '../../assets/Honda Beat Image.png';
import tukTukImg from '../../assets/TukTuk Image.png';

const MODEL_IMAGES: Record<string, string> = {
  'honda-beat': hondaBeatImg,
  'honda beat': hondaBeatImg,
  'tuktuk': tukTukImg,
  'tuk-tuk': tukTukImg,
  'tuk tuk': tukTukImg,
};

function resolveImage(modelName: string): string | null {
  const lower = modelName.toLowerCase();
  for (const [key, src] of Object.entries(MODEL_IMAGES)) {
    if (lower.includes(key)) return src;
  }
  return null;
}

interface VehicleCardProps {
  modelId: string;
  modelName: string;
  availableCount: number;
  dailyRate: number | null;
  securityDeposit: number | null;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export function VehicleCard({
  modelId,
  modelName,
  availableCount,
  dailyRate,
  securityDeposit,
  onToast,
}: VehicleCardProps) {
  const [loading, setLoading] = useState(false);
  const basket = useBookingStore((s) => s.basket);
  const addToBasket = useBookingStore((s) => s.addToBasket);
  const sessionToken = useBookingStore((s) => s.sessionToken);
  const storeId = useBookingStore((s) => s.storeId);
  const pickupDatetime = useBookingStore((s) => s.pickupDatetime);
  const dropoffDatetime = useBookingStore((s) => s.dropoffDatetime);

  const inBasket = basket.some((b) => b.vehicleModelId === modelId);
  const imgSrc = resolveImage(modelName);

  async function handleAddToBasket() {
    if (inBasket || loading) return;
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

  return (
    <div className="overflow-hidden rounded-4xl border border-sand-brand/50 bg-cream-brand shadow-sm group">
      <div className="relative h-64 overflow-hidden">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={modelName}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-sand-brand">
            <span className="text-4xl opacity-30">🏍️</span>
          </div>
        )}
        <div className="absolute left-4 top-4 flex gap-2">
          <span className="rounded-full bg-[#D1E7E4] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-teal-brand">
            {availableCount} available
          </span>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-2 flex items-start justify-between">
          <h3 className="font-headline text-xl font-black text-charcoal-brand">{modelName}</h3>
          <div className="text-right">
            {dailyRate != null ? (
              <p className="text-lg font-black leading-tight text-teal-brand">
                ₱{dailyRate.toLocaleString()}
                <span className="text-xs font-bold text-charcoal-brand/60">/day</span>
              </p>
            ) : (
              <p className="text-sm text-charcoal-brand/50">—</p>
            )}
          </div>
        </div>

        {securityDeposit != null && securityDeposit > 0 && (
          <p className="mb-4 text-xs font-bold text-charcoal-brand/60">
            ₱{securityDeposit.toLocaleString()} refundable deposit
          </p>
        )}

        <button
          onClick={handleAddToBasket}
          disabled={loading || inBasket}
          className={`flex w-full items-center justify-center gap-2 rounded-3xl py-4 font-black transition-all ${
            inBasket
              ? 'bg-teal-brand text-white'
              : 'bg-sand-brand text-teal-brand hover:bg-teal-brand hover:text-white'
          } disabled:opacity-70`}
        >
          {loading ? (
            'Holding…'
          ) : inBasket ? (
            <>In Basket ✓</>
          ) : (
            <>🛒 Add to Basket</>
          )}
        </button>
      </div>
    </div>
  );
}
