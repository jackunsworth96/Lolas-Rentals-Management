import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import logo from '../../assets/Lolas Original Logo.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import {
  holdCounterVehicle,
  releaseCounterVehicle,
  useCounterExtras,
  useCounterOptions,
  useCreateCounterBooking,
  usePrefetchCounterExtras,
  type CollectionArea,
  type CounterApi,
  type CounterModel,
} from '../../api/counter.js';
import { ApiError } from '../../api/client.js';
import { useIdleReset } from '../../hooks/useIdleReset.js';
import { useVehiclePublicId } from '../../utils/vehicle-images.js';
import { CloudinaryImage } from '../../components/ui/CloudinaryImage.js';
import { PesoSign } from '../../components/ui/PesoSign.js';
import { formatPhpNumber } from '../../utils/currency.js';
import { WhatsAppNumberInput, whatsAppNumberError } from '../../components/common/WhatsAppNumberInput.js';
import { CounterWelcome, type CounterBrand } from './CounterWelcome.js';
import { CounterExtras } from './CounterExtras.js';
import { CounterWhen } from './CounterWhen.js';

type Step = 'welcome' | 'when' | 'days' | 'vehicle' | 'extras' | 'details';

const DAY_CHOICES = [1, 2, 3, 5, 7, 14];
const MAX_DAYS = 30;
const IDLE_MS = 90_000;
const LOGO_HOLD_MS = 3_000;

const goldButton =
  'inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-charcoal-brand bg-gold-brand px-8 py-5 font-lato text-lg font-black uppercase tracking-wide text-charcoal-brand shadow-[4px_4px_0_#363737] transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#363737] disabled:opacity-40';
const inputClass =
  'w-full rounded-xl border-2 border-charcoal-brand/15 bg-white px-4 py-4 font-lato text-lg text-charcoal-brand focus:border-teal-brand focus:outline-none';

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
}

function returnLabel(iso: string): string {
  const day = new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', weekday: 'long', day: 'numeric', month: 'long' });
  return `${day} at ${timeLabel(iso)}`;
}

function shortDateTime(iso: string): string {
  const day = new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${timeLabel(iso)}`;
}

function newSessionToken(): string {
  return `counter-${crypto.randomUUID()}`;
}

function Peso({ amount }: { amount: number }) {
  return <><PesoSign />{formatPhpNumber(amount)}</>;
}

function VehicleCard({ model, days, onChoose, busy, delivery }: {
  model: CounterModel;
  days: number;
  onChoose: () => void;
  busy: boolean;
  /** Partner kiosks deliver to the hotel, so the price includes delivery and collection. */
  delivery: boolean;
}) {
  const publicId = useVehiclePublicId(model.modelName);
  const fullyBooked = model.availableCount < 1;
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={fullyBooked || busy}
      className={`flex flex-col overflow-hidden rounded-3xl border-2 border-charcoal-brand/10 bg-[#FAF6F0] text-left shadow-sm transition ${
        fullyBooked ? 'cursor-not-allowed' : 'active:scale-[0.98] hover:border-gold-brand'
      }`}
    >
      <div className="relative h-44 w-full bg-white">
        <div className={`flex h-full w-full items-center justify-center ${fullyBooked ? 'opacity-40 grayscale' : ''}`}>
          {publicId ? (
            <CloudinaryImage publicId={publicId} alt={model.modelName} plugins={[]} className="h-full w-full object-contain p-3" />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl opacity-30">🛵</div>
          )}
        </div>
        {fullyBooked && (
          <span className="absolute left-3 top-3 -rotate-3 rounded-md border-2 border-charcoal-brand bg-white px-3 py-1 font-lato text-sm font-black uppercase tracking-wide text-charcoal-brand shadow-[2px_2px_0_#363737]">
            Fully booked
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-5">
        <h3 className={`font-headline text-2xl font-bold ${fullyBooked ? 'text-charcoal-brand/50' : 'text-teal-brand'}`}>{model.modelName}</h3>
        {fullyBooked ? (
          <p className="font-lato text-base text-charcoal-brand/80">
            {model.nextFreePickup ? (
              <>Free for {days} {days === 1 ? 'day' : 'days'} from <span className="font-bold">{shortDateTime(model.nextFreePickup)}</span>. Ask our team to reserve it.</>
            ) : (
              <>Not free for {days} {days === 1 ? 'day' : 'days'} soon. Try fewer days, or ask our team.</>
            )}
          </p>
        ) : model.total !== null && model.dailyRate !== null ? (
          <>
            <p className="font-lato text-xl font-bold text-charcoal-brand">
              <Peso amount={model.total} />
              <span className="ml-1 text-sm font-semibold text-charcoal-brand/60">
                for {days} {days === 1 ? 'day' : 'days'}
              </span>
            </p>
            <p className="font-lato text-sm text-charcoal-brand/60">
              <Peso amount={model.dailyRate} /> per day
              {model.securityDeposit ? <> · <Peso amount={model.securityDeposit} /> refundable deposit</> : null}
            </p>
            {model.rentalDiscount > 0 && (
              <p className="font-lato text-sm font-bold text-teal-brand">Includes <Peso amount={model.rentalDiscount} /> guest discount</p>
            )}
            {delivery && (
              <p className="font-lato text-sm font-semibold text-charcoal-brand/70">
                {model.deliveryFee > 0 ? <>Includes <Peso amount={model.deliveryFee} /> delivery and collection</> : 'Free delivery and collection'}
              </p>
            )}
          </>
        ) : (
          <p className="font-lato text-sm italic text-charcoal-brand/60">Ask our team for the price</p>
        )}
      </div>
    </button>
  );
}

export interface CounterKioskProps {
  counter: CounterApi;
  /** `now`: our shop, the rental starts at the nearest slot. `scheduled`: a partner desk, the guest picks a slot and we deliver. */
  mode: 'now' | 'scheduled';
  brand?: CounterBrand;
  /** Where the waiver hands the tablet back to. */
  homePath: string;
  /** Holding the logo for 3 seconds: sign out (our counter) or exit kiosk mode (partners). */
  onLogoHold: () => void;
  /** Partner kiosks without a property area: the guest picks one of these. */
  deliveryAreas?: CollectionArea[] | null;
}

export function CounterKiosk({ counter, mode, brand, homePath, onLogoHold, deliveryAreas }: CounterKioskProps) {
  const navigate = useNavigate();
  const scheduled = mode === 'scheduled';
  const [step, setStep] = useState<Step>('welcome');
  const [pickupDatetime, setPickupDatetime] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [days, setDays] = useState(1);
  const [model, setModel] = useState<CounterModel | null>(null);
  const [sessionToken, setSessionToken] = useState(newSessionToken);
  const [hold, setHold] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [addonIds, setAddonIds] = useState<Set<number>>(new Set());
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [stayingAt, setStayingAt] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const holdTimer = useRef<number | null>(null);

  const askArea = scheduled && !!deliveryAreas && deliveryAreas.length > 0;
  const windowReady = !scheduled || (pickupDatetime !== null && (!askArea || areaId !== null));
  const query = { days, pickupDatetime: scheduled ? pickupDatetime : null, deliveryAreaId: askArea ? areaId : null, sessionToken };
  const options = useCounterOptions(counter, query, step !== 'welcome' && step !== 'when' && windowReady);
  const extras = useCounterExtras(counter, { ...query, modelId: model?.modelId ?? null }, step === 'extras' || step === 'details');
  const createBooking = useCreateCounterBooking(counter);
  const prefetchExtras = usePrefetchCounterExtras(counter);

  const releaseHold = () => {
    if (hold) void releaseCounterVehicle(counter, hold, sessionToken);
    setHold(null);
  };

  const reset = () => {
    releaseHold();
    setStep('welcome');
    setPickupDatetime(null);
    setAreaId(null);
    setDays(1);
    setModel(null);
    setSessionToken(newSessionToken());
    setAddonIds(new Set());
    setCollectionId(null);
    setStayingAt('');
    setName('');
    setEmail('');
    setMobile('');
    setError('');
  };
  useIdleReset(step !== 'welcome', IDLE_MS, reset);

  const startLogoHold = () => {
    holdTimer.current = window.setTimeout(onLogoHold, LOGO_HOLD_MS);
  };
  const cancelLogoHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const back = () => {
    setError('');
    if (step === 'extras') releaseHold();
    const previous: Record<Step, Step> = {
      welcome: 'welcome',
      when: 'welcome',
      days: scheduled ? 'when' : 'welcome',
      vehicle: 'days',
      extras: 'vehicle',
      details: 'extras',
    };
    setStep(previous[step]);
  };

  const vehicleTaken = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'VEHICLE_UNAVAILABLE') {
      setModel(null);
      setHold(null);
      setStep('vehicle');
      void options.refetch();
    }
    setError(err instanceof Error ? err.message : 'Something went wrong. Please ask our team for help.');
  };

  const chooseVehicle = async (m: CounterModel) => {
    setError('');
    setHolding(true);
    prefetchExtras({ ...query, modelId: m.modelId });
    try {
      const { holdId } = await holdCounterVehicle(counter, { ...query, modelId: m.modelId, sessionToken });
      setHold(holdId);
      if (m.modelId !== model?.modelId) {
        setAddonIds(new Set());
        setCollectionId(null);
      }
      setModel(m);
      setStep('extras');
    } catch (err) {
      vehicleTaken(err);
    } finally {
      setHolding(false);
    }
  };

  const toggleAddon = (id: number) => {
    setAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosenAddons = (extras.data?.addons ?? []).filter((a) => addonIds.has(a.id));
  const collection = (extras.data?.collectionAreas ?? []).find((a) => a.id === collectionId) ?? null;
  const total = model?.total != null
    ? model.total + chosenAddons.reduce((s, a) => s + a.total, 0) + (collection?.fee ?? 0)
    : null;

  const submit = async () => {
    if (!model) return;
    if (!name.trim()) return setError('Please enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Please enter a valid email address.');
    const mobileError = whatsAppNumberError(mobile, true);
    if (mobileError) return setError(mobileError);
    setError('');
    try {
      const { orderReference } = await createBooking.mutateAsync({
        vehicleModelId: model.modelId,
        days,
        pickupDatetime: scheduled ? pickupDatetime : null,
        deliveryAreaId: query.deliveryAreaId,
        customerName: name.trim(),
        customerEmail: email.trim(),
        customerMobile: mobile,
        addonIds: [...addonIds],
        collectionLocationId: collectionId,
        stayingAt: collectionId ? stayingAt.trim() || null : null,
        holdId: hold,
        sessionToken,
      });
      setHold(null);
      const params = new URLSearchParams({ counter: '1', home: homePath });
      navigate(`/waiver/${encodeURIComponent(orderReference)}?${params.toString()}`, { state: { mobile } });
    } catch (err) {
      vehicleTaken(err);
    }
  };

  const models = options.data?.models ?? [];
  const startLabel = options.data
    ? scheduled ? shortDateTime(options.data.pickupDatetime) : `today at ${timeLabel(options.data.pickupDatetime)}`
    : null;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden font-body" style={{ backgroundColor: '#f1e6d6' }}>
      {step !== 'welcome' && (
        <>
          <img src={flowerLeft} alt="" className="pointer-events-none fixed left-0 top-0 w-40 opacity-60" />
          <img src={flowerRight} alt="" className="pointer-events-none fixed bottom-0 right-0 w-40 opacity-60" />
        </>
      )}

      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <div className="w-28">
          {step !== 'welcome' && (
            <button type="button" onClick={back} className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-lato text-base font-bold text-teal-brand">
              <ArrowLeft className="h-5 w-5" /> Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <img
            src={logo}
            alt="Lola's Rentals"
            className="h-14 w-auto select-none"
            draggable={false}
            onPointerDown={startLogoHold}
            onPointerUp={cancelLogoHold}
            onPointerLeave={cancelLogoHold}
            onContextMenu={(e) => e.preventDefault()}
          />
          {brand && (
            <>
              <span className="font-lato text-xl text-charcoal-brand/40" aria-hidden>×</span>
              {brand.logoUrl
                ? <img src={brand.logoUrl} alt={brand.partnerName} className="h-14 w-auto max-w-[180px] select-none object-contain" draggable={false} />
                : <span className="font-lato text-lg font-bold text-charcoal-brand">{brand.partnerName}</span>}
            </>
          )}
        </div>
        <div className="w-28" />
      </header>

      {step === 'welcome' && <CounterWelcome brand={brand} onStart={() => setStep(scheduled ? 'when' : 'days')} />}

      <main className={`relative z-10 mx-auto w-full max-w-4xl flex-1 flex-col px-6 pb-10 ${step === 'welcome' ? 'hidden' : 'flex'}`}>
        {step === 'when' && (
          <CounterWhen
            value={pickupDatetime}
            onChange={setPickupDatetime}
            deliverTo={brand?.partnerName ?? null}
            areas={askArea ? deliveryAreas : null}
            areaId={areaId}
            onArea={setAreaId}
            onContinue={() => setStep('days')}
            buttonClass={goldButton}
          />
        )}

        {step === 'days' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="font-headline text-4xl font-bold text-teal-brand">How many days?</h1>
            <p className="mt-2 h-7 font-lato text-lg text-charcoal-brand/70">
              {startLabel && <>{scheduled ? 'Delivered' : 'Pick up'} {scheduled ? 'on ' : ''}<span className="font-bold">{startLabel}</span></>}
            </p>
            <div className="mt-8 flex items-center gap-8">
              <button
                type="button"
                aria-label="One day fewer"
                disabled={days <= 1}
                onClick={() => setDays((d) => Math.max(1, d - 1))}
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-charcoal-brand bg-white disabled:opacity-30"
              >
                <Minus className="h-7 w-7" />
              </button>
              <div className="w-40">
                <div className="font-headline text-7xl font-bold text-charcoal-brand">{days}</div>
                <div className="font-lato text-lg font-semibold text-charcoal-brand/60">{days === 1 ? 'day' : 'days'}</div>
              </div>
              <button
                type="button"
                aria-label="One more day"
                disabled={days >= MAX_DAYS}
                onClick={() => setDays((d) => Math.min(MAX_DAYS, d + 1))}
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-charcoal-brand bg-white disabled:opacity-30"
              >
                <Plus className="h-7 w-7" />
              </button>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {DAY_CHOICES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`rounded-full border-2 px-5 py-2.5 font-lato text-base font-bold ${
                    d === days ? 'border-teal-brand bg-teal-brand text-white' : 'border-charcoal-brand/15 bg-white text-charcoal-brand'
                  }`}
                >
                  {d === 7 ? '1 week' : d === 14 ? '2 weeks' : `${d} ${d === 1 ? 'day' : 'days'}`}
                </button>
              ))}
            </div>
            <p className="mt-8 h-7 font-lato text-lg text-charcoal-brand/80">
              {options.data && <>Return by <span className="font-bold">{returnLabel(options.data.dropoffDatetime)}</span></>}
            </p>
            <button type="button" className={`${goldButton} mt-6`} onClick={() => setStep('vehicle')}>
              Choose your vehicle
            </button>
          </div>
        )}

        {step === 'vehicle' && (
          <div>
            <h1 className="text-center font-headline text-4xl font-bold text-teal-brand">Choose your vehicle</h1>
            <p className="mt-2 text-center font-lato text-lg text-charcoal-brand/70">
              {days} {days === 1 ? 'day' : 'days'}
              {options.data && startLabel && <>, from {startLabel} to {returnLabel(options.data.dropoffDatetime)}</>}
            </p>
            {error && <p className="mt-4 text-center font-lato text-base font-semibold text-red-600">{error}</p>}
            {options.isLoading ? (
              <div className="mt-16 flex justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
              </div>
            ) : options.error ? (
              <p className="mt-12 text-center font-lato text-lg text-charcoal-brand/80">
                We couldn't load the vehicles just now. Please ask our team for help.
              </p>
            ) : models.length === 0 ? (
              <p className="mt-12 text-center font-lato text-lg text-charcoal-brand/80">
                Sorry, nothing is free for {days} {days === 1 ? 'day' : 'days'}. Try fewer days, or ask our team.
              </p>
            ) : (
              <div className="mt-8 flex flex-wrap justify-center gap-5 [&>*]:w-full sm:[&>*]:w-[calc(50%-0.625rem)] lg:[&>*]:w-[calc((100%-2.5rem)/3)]">
                {models.map((m) => (
                  <VehicleCard key={m.modelId} model={m} days={days} busy={holding} delivery={scheduled} onChoose={() => void chooseVehicle(m)} />
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'extras' && model && (
          <div className="mx-auto w-full max-w-2xl pb-28">
            <h1 className="text-center font-headline text-4xl font-bold text-teal-brand">Make your ride even better</h1>
            <p className="mt-2 text-center font-lato text-lg text-charcoal-brand/70">Optional extras for your {model.modelName}</p>
            <div className="mt-8">
              <CounterExtras
                extras={extras.data}
                loading={extras.isLoading}
                days={days}
                selectedIds={addonIds}
                onToggle={toggleAddon}
                collectionId={collectionId}
                onCollection={setCollectionId}
                stayingAt={stayingAt}
                onStayingAt={setStayingAt}
                inputClass={inputClass}
              />
            </div>
            <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-charcoal-brand/10 bg-cream-brand/95 px-6 py-4 backdrop-blur">
              <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
                <div className="font-lato text-charcoal-brand">
                  <div className="text-sm font-semibold text-charcoal-brand/60">Total for {days} {days === 1 ? 'day' : 'days'}</div>
                  <div className="text-3xl font-black">{total !== null ? <Peso amount={total} /> : '—'}</div>
                </div>
                <button type="button" className={goldButton} onClick={() => setStep('details')}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'details' && model && (
          <div className="mx-auto w-full max-w-xl">
            <h1 className="text-center font-headline text-4xl font-bold text-teal-brand">Your details</h1>
            <div className="mt-6 space-y-1 rounded-2xl bg-[#FAF6F0] px-5 py-4 font-lato text-base text-charcoal-brand">
              <div><span className="font-bold">{model.modelName}</span> for {days} {days === 1 ? 'day' : 'days'}</div>
              {chosenAddons.map((a) => (
                <div key={a.id} className="text-sm">+ {a.name} · <Peso amount={a.total} /></div>
              ))}
              {collection && <div className="text-sm">+ Collection from {collection.name} · <Peso amount={collection.fee} /></div>}
              {total !== null && <div className="pt-1 font-bold">Total <Peso amount={total} /></div>}
              {options.data && (
                <div className="text-sm text-charcoal-brand/60">Return by {returnLabel(options.data.dropoffDatetime)}</div>
              )}
            </div>
            <form
              className="mt-6 space-y-5"
              onSubmit={(e) => { e.preventDefault(); void submit(); }}
            >
              <label className="block">
                <span className="mb-1.5 block font-lato text-base font-bold text-charcoal-brand">Full name</span>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-lato text-base font-bold text-charcoal-brand">Email</span>
                <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
              </label>
              <div>
                <span className="mb-1.5 block font-lato text-base font-bold text-charcoal-brand">WhatsApp number</span>
                <WhatsAppNumberInput value={mobile} onChange={(v) => setMobile(v)} className={inputClass} showPreview={false} required />
              </div>
              {error && <p className="font-lato text-base font-semibold text-red-600">{error}</p>}
              <button type="submit" className={`${goldButton} w-full`} disabled={createBooking.isPending}>
                {createBooking.isPending ? 'Booking…' : 'Continue to waiver'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
