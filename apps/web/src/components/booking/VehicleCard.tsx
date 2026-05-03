import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { resolvePublicId } from '../../utils/vehicle-images.js';
import { CloudinaryImage } from '../ui/CloudinaryImage.js';
import { formatPhpNumber } from '../../utils/currency.js';
import { hasBookingDatetimeWithTime } from '../../utils/booking-datetime.js';
import { BrandCard } from '../public/BrandCard.js';
import { PesoSign } from '../ui/PesoSign.js';
import cartIcon from '../../assets/Buttons/basket icon.svg';

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

function formatNextAvailableWeekdayDayMonth(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday} ${day} ${month}`;
}

function scarcityUrgencyCopy(availableCount: number, isHoldOnly?: boolean): string {
  if (availableCount <= 0) return isHoldOnly ? 'In another cart' : 'Unavailable';
  if (availableCount === 1) return 'Last one available!';
  if (availableCount === 2) return 'Only 2 left!';
  return 'Limited availability';
}

function minutesUntil(iso: string): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

interface VehicleCardProps {
  modelId: string;
  modelName: string;
  availableCount: number;
  dailyRate: number | null;
  securityDeposit: number | null;
  nextAvailablePickup?: string;
  holdExpiresAt?: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

/** Base gold button styles — shadow and transition handled via CSS classes to avoid React-state re-renders on hover. */
const GOLD_BTN_BASE: React.CSSProperties = {
  backgroundColor: '#FCBC5A',
  color: '#363737',
  border: '2px solid #363737',
  borderRadius: 8,
  fontWeight: 800,
  fontSize: 14,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  fontFamily: 'Lato, sans-serif',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** For small stepper buttons where we keep the inline shadow (no hover state needed). */
const GOLD_BTN_STEPPER: React.CSSProperties = {
  ...GOLD_BTN_BASE,
  boxShadow: '3px 3px 0 #363737',
};

export function VehicleCard({
  modelId,
  modelName,
  availableCount,
  dailyRate,
  securityDeposit,
  nextAvailablePickup,
  holdExpiresAt,
  onToast,
}: VehicleCardProps) {
  const navigate = useNavigate();
  const [addLoading, setAddLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [pressDown, setPressDown] = useState(false);
  const [qty, setQty] = useState(1);
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
  const isHoldOnly = availableCount === 0 && !!holdExpiresAt;

  const cartItems = basket.filter((b) => b.vehicleModelId === modelId);
  const count = cartItems.length;
  const displayName = VEHICLE_NAME_MAP[modelName] ?? modelName;
  const publicId = resolvePublicId(modelName);

  const maxQty = Math.max(1, availableCount - count);
  const clampedQty = Math.min(qty, maxQty);

  async function handleAddAndProceed() {
    if (
      addLoading ||
      removeLoading ||
      clampedQty < 1 ||
      !hasBookingDatetimeWithTime(pickupDatetime) ||
      !hasBookingDatetimeWithTime(dropoffDatetime)
    ) return;

    setPressDown(true);
    await new Promise((r) => setTimeout(r, 100));
    setPressDown(false);
    await new Promise((r) => setTimeout(r, 100));

    setAddLoading(true);
    try {
      for (let i = 0; i < clampedQty; i++) {
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
      }
      navigate('/book/basket');
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
    if (removeLoading || addLoading || cartItems.length === 0) return;
    const lastItem = cartItems[cartItems.length - 1];
    setRemoveLoading(true);
    try {
      await api.delete(`/public/booking/hold/${lastItem.holdId}`, { sessionToken });
    } catch {
      // Non-fatal: remove from local cart regardless
    } finally {
      removeFromBasket(lastItem.holdId);
      setRemoveLoading(false);
    }
  }

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
      disableTilt
      className={`animate-card-enter ${isUnavailable || isHoldOnly ? 'opacity-70' : ''}`}
    >
      <div className="group flex h-full flex-col overflow-hidden rounded-[22px] bg-[#FAF6F0]">
        {/* Image — plugins=[] prevents AdvancedImage re-initialising on any parent re-render */}
        <div className="relative h-40 w-full overflow-hidden rounded-t-[22px] bg-white">
          {publicId ? (
            <CloudinaryImage
              publicId={publicId}
              alt={displayName}
              plugins={[]}
              className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-sand-brand">
              <span className="text-4xl opacity-30">🏍️</span>
            </div>
          )}
          {(isUnavailable || isHoldOnly || availableCount <= 5) && (
            <div className="absolute left-4 top-4 flex gap-2">
              <span className={`font-lato inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow-sm ${(isUnavailable || isHoldOnly) ? 'bg-charcoal-brand/10 text-charcoal-brand/60' : 'bg-teal-brand text-white'}`}>
                {scarcityUrgencyCopy(isUnavailable || isHoldOnly ? 0 : availableCount, isHoldOnly)}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-6">
          <div className="mb-1 flex items-start justify-between">
            <h3 className="font-headline text-xl font-bold text-teal-brand">{displayName}</h3>
            <div className="ml-3 shrink-0 text-right">
              {dailyRate != null ? (
                <p className="text-lg leading-tight">
                  <span className="font-lato font-bold text-teal-brand">
                    <PesoSign />{formatPhpNumber(dailyRate)}
                  </span>
                  <span className="font-headline text-xs font-bold text-charcoal-brand/60">
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
              <span className="font-bold">
                <PesoSign />{formatPhpNumber(securityDeposit)}
              </span>
              {' '}refundable deposit
            </p>
          )}

          <div className="mt-auto pt-4">
            {isHoldOnly ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-gold-brand/40 bg-gold-brand/10 px-4 py-4 text-center">
                <p className="font-lato text-sm font-bold text-charcoal-brand">
                  In another customer's cart
                </p>
                <p className="font-lato text-xs text-charcoal-brand/70">
                  Check back in ~{minutesUntil(holdExpiresAt!)} min — it'll be free if they don't book.
                </p>
                {nextAvailablePickup && (
                  <button
                    type="button"
                    onClick={handleNextAvailable}
                    className="font-lato mt-1 text-[11px] font-semibold text-teal-brand underline underline-offset-2 hover:text-teal-brand/70"
                  >
                    Or jump to next confirmed availability ({formatNextAvailableDate(nextAvailablePickup)})
                  </button>
                )}
              </div>
            ) : isUnavailable ? (
              <button
                type="button"
                onClick={handleNextAvailable}
                className="font-lato flex w-full flex-col items-center justify-center gap-1 rounded-full border-2 border-teal-brand bg-transparent py-3.5 font-bold text-teal-brand transition-all duration-300 hover:bg-teal-brand/10"
              >
                <span className="font-lato text-[11px] text-charcoal-brand/50">Next available from</span>
                <span className="font-lato text-sm">{formatNextAvailableDate(nextAvailablePickup!)} at {formatSlotTime(nextAvailablePickup!)}</span>
                <span className="font-lato text-[10px] font-bold uppercase tracking-wider text-teal-brand/60">Tap to use these dates</span>
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Quantity selector — only shown when more than 1 unit available */}
                {availableCount > 1 && count === 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-charcoal-brand/10 bg-white px-4 py-2">
                    <span className="font-lato text-xs font-bold uppercase tracking-wider text-charcoal-brand/50">
                      Quantity
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={qty <= 1}
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        style={{ ...GOLD_BTN_STEPPER, width: 32, height: 32, fontSize: 18, opacity: qty <= 1 ? 0.4 : 1 }}
                      >
                        −
                      </button>
                      <span className="font-lato w-5 text-center text-sm font-bold text-charcoal-brand">
                        {clampedQty}
                      </span>
                      <button
                        type="button"
                        disabled={clampedQty >= maxQty}
                        onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                        style={{ ...GOLD_BTN_STEPPER, width: 32, height: 32, fontSize: 18, opacity: clampedQty >= maxQty ? 0.4 : 1 }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {/* Already in cart — show stepper to adjust */}
                {count > 0 && (
                  <div className="flex w-full items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRemoveOne}
                      disabled={removeLoading || addLoading}
                      style={{
                        ...GOLD_BTN_STEPPER,
                        width: 44, height: 44, flexShrink: 0, fontSize: 20,
                        opacity: removeLoading || addLoading ? 0.5 : 1,
                        cursor: removeLoading || addLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {removeLoading
                        ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#363737] border-t-transparent" />
                        : '−'}
                    </button>
                    <div className="font-lato flex flex-1 items-center justify-center font-bold text-teal-brand" style={{ fontSize: 14 }}>
                      {count} in cart
                    </div>
                    <button
                      type="button"
                      onClick={handleAddAndProceed}
                      disabled={addLoading || removeLoading || count >= availableCount}
                      style={{
                        ...GOLD_BTN_STEPPER,
                        width: 44, height: 44, flexShrink: 0, fontSize: 20,
                        opacity: addLoading || removeLoading || count >= availableCount ? 0.5 : 1,
                        cursor: addLoading || removeLoading || count >= availableCount ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {addLoading
                        ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#363737] border-t-transparent" />
                        : '+'}
                    </button>
                  </div>
                )}

                {/* Add to Cart & Proceed — CSS-only hover (no React state re-render) */}
                {count === 0 && (
                  <button
                    type="button"
                    onClick={handleAddAndProceed}
                    disabled={addLoading}
                    style={{
                      ...GOLD_BTN_BASE,
                      padding: '12px 0',
                      width: '100%',
                      gap: 8,
                      opacity: addLoading ? 0.6 : 1,
                      cursor: addLoading ? 'not-allowed' : 'pointer',
                      transform: pressDown ? 'scale(0.95)' : undefined,
                    }}
                    className="shadow-[3px_3px_0_#363737] transition-[box-shadow,transform] duration-150 enabled:hover:-translate-x-0.5 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[5px_5px_0_#363737]"
                  >
                    {addLoading
                      ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#363737] border-t-transparent" />
                      : (
                        <>
                          <img src={cartIcon} alt="" className="h-[1.65rem] w-[1.65rem] shrink-0 object-contain" width={27} height={27} />
                          <span>Add to Cart &amp; Proceed</span>
                        </>
                      )}
                  </button>
                )}

                {count > 0 && (availableCount - count) === 0 && nextAvailablePickup && (
                  <p className="text-center font-lato text-xs font-semibold text-[#00577C]">
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
