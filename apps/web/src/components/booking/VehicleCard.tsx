import { useState } from 'react';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { resolveImage } from '../../utils/vehicle-images.js';
import { formatPhpNumber } from '../../utils/currency.js';
import { hasBookingDatetimeWithTime } from '../../utils/booking-datetime.js';
import { BrandCard } from '../public/BrandCard.js';
import basketIcon from '../../assets/Buttons/basket icon.svg';

const VEHICLE_NAME_MAP: Record<string, string> = {
  'Honda Beat': 'Scooter Honda Beat 110cc',
  'TukTuk (RE)': 'TukTuk Bajaj RE 250cc',
  'TukTuk (TVS)': 'TukTuk TVS King 200cc',
};


function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/** Convert a Date to an ISO string in Manila time (UTC+8) with explicit offset. */
function toManilaDatetimeStr(d: Date): string {
  const manila = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = manila.getUTCFullYear();
  const mm = String(manila.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(manila.getUTCDate()).padStart(2, '0');
  const hh = String(manila.getUTCHours()).padStart(2, '0');
  const min = String(manila.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+08:00`;
}

function formatNextAvailableDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** e.g. "Mon 7 Apr" — short weekday, day, month name */
function formatNextAvailableWeekdayDayMonth(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday} ${day} ${month}`;
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

const GOLD_BTN: React.CSSProperties = {
  backgroundColor: '#FCBC5A',
  color: '#363737',
  border: '2px solid #363737',
  borderRadius: 8,
  fontWeight: 800,
  fontSize: 14,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  boxShadow: '3px 3px 0 #363737',
  fontFamily: 'Lato, sans-serif',
  cursor: 'pointer',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function VehicleCard({
  modelId,
  modelName,
  availableCount,
  dailyRate,
  securityDeposit,
  nextAvailablePickup,
  onToast,
}: VehicleCardProps) {
  const [addLoading, setAddLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [pressDown, setPressDown] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const basket = useBookingStore((s) => s.basket);
  const addToBasket = useBookingStore((s) => s.addToBasket);
  const removeFromBasket = useBookingStore((s) => s.removeFromBasket);
  const setDates = useBookingStore((s) => s.setDates);
  const triggerSearch = useBookingStore((s) => s.triggerSearch);
  const sessionToken = useBookingStore((s) => s.sessionToken);
  const storeId = useBookingStore((s) => s.storeId);
  const pickupDatetime = useBookingStore((s) => s.pickupDatetime);
  const dropoffDatetime = useBookingStore((s) => s.dropoffDatetime);

  const isUnavailable = availableCount === 0 && !!nextAvailablePickup;

  const basketItems = basket.filter((b) => b.vehicleModelId === modelId);
  const count = basketItems.length;
  const displayName = VEHICLE_NAME_MAP[modelName] ?? modelName;
  const imgSrc = resolveImage(modelName);

  const maxQuantityReached =
    count >= 1 && availableCount > 0 && count >= availableCount;

  async function handleAddOne() {
    if (
      addLoading ||
      removeLoading ||
      count >= availableCount ||
      !hasBookingDatetimeWithTime(pickupDatetime) ||
      !hasBookingDatetimeWithTime(dropoffDatetime)
    ) {
      return;
    }
    if (count === 0) {
      setPressDown(true);
      await new Promise((r) => setTimeout(r, 100));
      setPressDown(false);
      await new Promise((r) => setTimeout(r, 100));
    }
    setAddLoading(true);
    try {
      const result = await api.post<{ holdId: string; sessionToken: string; expiresAt: string }>(
        '/public/booking/hold',
        { vehicleModelId: modelId, storeId, pickupDatetime, dropoffDatetime, sessionToken },
      );
      addToBasket({
        holdId: result.holdId,
        vehicleModelId: modelId,
        modelName: displayName,
        dailyRate: dailyRate ?? 0,
        securityDeposit: securityDeposit ?? 0,
        expiresAt: result.expiresAt,
      });
      onToast(`${displayName} added to your basket`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to hold vehicle';
      if (msg.toLowerCase().includes('available') || msg.includes('409')) {
        onToast('Sorry, this vehicle was just taken. Please try another.', 'error');
      } else {
        onToast(msg, 'error');
      }
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemoveOne() {
    if (removeLoading || addLoading || basketItems.length === 0) return;
    const lastItem = basketItems[basketItems.length - 1];
    setRemoveLoading(true);
    try {
      await api.delete(`/public/booking/hold/${lastItem.holdId}`, { sessionToken });
    } catch {
      // Non-fatal: remove from local basket regardless
    } finally {
      removeFromBasket(lastItem.holdId);
      setRemoveLoading(false);
    }
  }

  const btnTransform = pressDown ? 'scale(0.95)' : btnHovered ? 'translate(-2px, -2px)' : 'none';
  const btnShadow = btnHovered && !pressDown ? '5px 5px 0 #363737' : '3px 3px 0 #363737';

  function handleNextAvailable() {
    if (!nextAvailablePickup) return;
    const pickup = new Date(nextAvailablePickup);
    const currentPickup = new Date(pickupDatetime);
    const currentDropoff = new Date(dropoffDatetime);
    const rentalMs = currentDropoff.getTime() - currentPickup.getTime();
    const newDropoff = new Date(pickup.getTime() + Math.max(rentalMs, 86400000));

    const pickupStr = toManilaDatetimeStr(pickup);
    const dropoffStr = toManilaDatetimeStr(newDropoff);
    setDates(pickupStr, dropoffStr);
    triggerSearch();
    onToast(`Dates updated to ${formatNextAvailableDate(nextAvailablePickup)}`, 'success');
  }

  return (
    <BrandCard
      glowColor="36 96 67"
      className={`animate-card-enter ${isUnavailable ? 'opacity-70' : ''}`}
    >
      <div className="group flex h-full flex-col overflow-hidden rounded-[22px] bg-[#FAF6F0]">
        <div className="relative h-40 w-full overflow-hidden rounded-t-[22px] bg-white">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={displayName}
              className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-sand-brand">
              <span className="text-4xl opacity-30">🏍️</span>
            </div>
          )}
          <div className="absolute left-4 top-4 flex gap-2">
            <span className={`font-lato rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow-sm ${isUnavailable ? 'bg-charcoal-brand/10 text-charcoal-brand/60' : 'bg-teal-brand text-white'}`}>
              {isUnavailable ? 'Unavailable' : `${availableCount} available`}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-6">
          <div className="mb-1 flex items-start justify-between">
            <h3 className="font-headline text-xl font-bold text-teal-brand">{displayName}</h3>
            <div className="ml-3 shrink-0 text-right">
              {dailyRate != null ? (
                <p className="text-lg leading-tight">
                  <span className="font-headline font-bold text-teal-brand">
                    ₱{formatPhpNumber(dailyRate)}
                  </span>
                  <span
                    className="font-headline text-xs font-bold text-charcoal-brand/60"
                  >
                    /day
                  </span>
                </p>
              ) : (
                <p className="font-lato text-sm italic text-charcoal-brand/40">Price on request</p>
              )}
            </div>
          </div>

          {securityDeposit != null && securityDeposit > 0 && (
            <p className="font-lato mb-4 text-xs text-charcoal-brand/50">
              <span className="font-headline font-bold">
                ₱{formatPhpNumber(securityDeposit)}
              </span>
              {' '}refundable deposit
            </p>
          )}

          <div className="mt-auto pt-4">
            {isUnavailable ? (
              <button
                type="button"
                onClick={handleNextAvailable}
                className="font-lato flex w-full flex-col items-center justify-center gap-1 rounded-full border-2 border-teal-brand bg-transparent py-3.5 font-bold text-teal-brand transition-all duration-300 hover:bg-teal-brand/10"
              >
                <span className="font-lato text-[11px] text-charcoal-brand/50">Next available from</span>
                <span className="font-lato text-sm">{formatNextAvailableDate(nextAvailablePickup!)} at {formatSlotTime(nextAvailablePickup!)}</span>
                <span className="font-lato text-[10px] font-bold uppercase tracking-wider text-teal-brand/60">Tap to use these dates</span>
              </button>
            ) : count === 0 ? (
              <button
                type="button"
                onClick={handleAddOne}
                disabled={addLoading}
                onMouseEnter={() => { if (!addLoading) setBtnHovered(true); }}
                onMouseLeave={() => setBtnHovered(false)}
                style={{
                  ...GOLD_BTN,
                  padding: '12px 0',
                  width: '100%',
                  boxShadow: btnShadow,
                  transform: btnTransform,
                  opacity: addLoading ? 0.6 : 1,
                  cursor: addLoading ? 'not-allowed' : 'pointer',
                  gap: 8,
                }}
              >
                {addLoading
                  ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#363737] border-t-transparent" />
                  : (
                    <>
                      <img
                        src={basketIcon}
                        alt=""
                        className="h-[1.65rem] w-[1.65rem] shrink-0 object-contain"
                        width={27}
                        height={27}
                      />
                      <span>Add to Basket</span>
                    </>
                  )}
              </button>
            ) : (
              <div className="w-full">
                <div className="flex w-full items-center gap-2">
                  {/* − button */}
                  <button
                    type="button"
                    onClick={handleRemoveOne}
                    disabled={removeLoading || addLoading}
                    style={{
                      ...GOLD_BTN,
                      width: 44,
                      height: 44,
                      flexShrink: 0,
                      fontSize: 20,
                      opacity: removeLoading || addLoading ? 0.5 : 1,
                      cursor: removeLoading || addLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {removeLoading
                      ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#363737] border-t-transparent" />
                      : '−'}
                  </button>

                  {/* count label */}
                  <div
                    className="font-lato flex flex-1 items-center justify-center font-bold text-teal-brand"
                    style={{ fontSize: 14, letterSpacing: '0.03em' }}
                  >
                    {count} in basket
                  </div>

                  {/* + button */}
                  <button
                    type="button"
                    onClick={handleAddOne}
                    disabled={addLoading || removeLoading || count >= availableCount}
                    style={{
                      ...GOLD_BTN,
                      width: 44,
                      height: 44,
                      flexShrink: 0,
                      fontSize: 20,
                      opacity: addLoading || removeLoading || count >= availableCount ? 0.5 : 1,
                      cursor: addLoading || removeLoading || count >= availableCount ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {addLoading
                      ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#363737] border-t-transparent" />
                      : '+'}
                  </button>
                </div>
                {maxQuantityReached && (
                  <p className="mt-1 text-center font-lato text-xs text-[#363737]/60">
                    Maximum available quantity reached
                  </p>
                )}
                {maxQuantityReached && nextAvailablePickup && (
                  <p className="mt-0.5 text-center font-lato text-xs font-semibold text-[#00577C]">
                    Next available: {formatNextAvailableWeekdayDayMonth(nextAvailablePickup)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </BrandCard>
  );
}
