import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import logo from '../../assets/Lolas Original Logo.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import { useCounterOptions, useCreateCounterBooking, type CounterModel } from '../../api/counter.js';
import { ApiError } from '../../api/client.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useIdleReset } from '../../hooks/useIdleReset.js';
import { useVehiclePublicId } from '../../utils/vehicle-images.js';
import { CloudinaryImage } from '../../components/ui/CloudinaryImage.js';
import { PesoSign } from '../../components/ui/PesoSign.js';
import { formatPhpNumber } from '../../utils/currency.js';
import { WhatsAppNumberInput, whatsAppNumberError } from '../../components/common/WhatsAppNumberInput.js';
import { CounterWelcome } from './CounterWelcome.js';

type Step = 'welcome' | 'days' | 'vehicle' | 'details';

const DAY_CHOICES = [1, 2, 3, 5, 7, 14];
const MAX_DAYS = 30;
const IDLE_MS = 90_000;
const SIGN_OUT_HOLD_MS = 3_000;

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

function Peso({ amount }: { amount: number }) {
  return <><PesoSign />{formatPhpNumber(amount)}</>;
}

function VehicleCard({ model, days, onChoose }: { model: CounterModel; days: number; onChoose: () => void }) {
  const publicId = useVehiclePublicId(model.modelName);
  const fullyBooked = model.availableCount < 1;
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={fullyBooked}
      className={`flex flex-col overflow-hidden rounded-3xl border-2 border-charcoal-brand/10 bg-[#FAF6F0] text-left shadow-sm transition ${
        fullyBooked ? 'cursor-not-allowed' : 'active:scale-[0.98] hover:border-gold-brand'
      }`}
    >
      <div className="relative h-44 w-full bg-white">
        <div className={`h-full w-full ${fullyBooked ? 'opacity-40 grayscale' : ''}`}>
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
          </>
        ) : (
          <p className="font-lato text-sm italic text-charcoal-brand/60">Ask our team for the price</p>
        )}
      </div>
    </button>
  );
}

export default function CounterPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [step, setStep] = useState<Step>('welcome');
  const [days, setDays] = useState(1);
  const [model, setModel] = useState<CounterModel | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const holdTimer = useRef<number | null>(null);

  const options = useCounterOptions(days, step !== 'welcome');
  const createBooking = useCreateCounterBooking();

  const reset = () => {
    setStep('welcome');
    setDays(1);
    setModel(null);
    setName('');
    setEmail('');
    setMobile('');
    setError('');
  };
  useIdleReset(step !== 'welcome', IDLE_MS, reset);

  const startSignOutHold = () => {
    holdTimer.current = window.setTimeout(() => {
      if (window.confirm('Sign this tablet out of the counter?')) {
        logout();
        navigate('/login', { replace: true });
      }
    }, SIGN_OUT_HOLD_MS);
  };
  const cancelSignOutHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const back = () => {
    setError('');
    setStep(step === 'details' ? 'vehicle' : step === 'vehicle' ? 'days' : 'welcome');
  };

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
        customerName: name.trim(),
        customerEmail: email.trim(),
        customerMobile: mobile,
      });
      navigate(`/waiver/${encodeURIComponent(orderReference)}?counter=1`, { state: { mobile } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VEHICLE_UNAVAILABLE') {
        setModel(null);
        setStep('vehicle');
        void options.refetch();
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please ask our team for help.');
    }
  };

  const models = options.data?.models ?? [];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden font-body" style={{ backgroundColor: '#f1e6d6' }}>
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
        <img
          src={logo}
          alt="Lola's Rentals"
          className="h-14 w-auto select-none"
          draggable={false}
          onPointerDown={startSignOutHold}
          onPointerUp={cancelSignOutHold}
          onPointerLeave={cancelSignOutHold}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="w-28" />
      </header>

      {step === 'welcome' && <CounterWelcome onStart={() => setStep('days')} />}

      <main className={`relative z-10 mx-auto w-full max-w-4xl flex-1 flex-col px-6 pb-10 ${step === 'welcome' ? 'hidden' : 'flex'}`}>
        {step === 'days' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="font-headline text-4xl font-bold text-teal-brand">How many days?</h1>
            <p className="mt-2 h-7 font-lato text-lg text-charcoal-brand/70">
              {options.data && <>Pick up today at <span className="font-bold">{timeLabel(options.data.pickupDatetime)}</span></>}
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
              {options.data && <>, from today at {timeLabel(options.data.pickupDatetime)} to {returnLabel(options.data.dropoffDatetime)}</>}
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
                Sorry, nothing is free right now for {days} {days === 1 ? 'day' : 'days'}. Try fewer days, or ask our team.
              </p>
            ) : (
              <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {models.map((m) => (
                  <VehicleCard
                    key={m.modelId}
                    model={m}
                    days={days}
                    onChoose={() => { setModel(m); setError(''); setStep('details'); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'details' && model && (
          <div className="mx-auto w-full max-w-xl">
            <h1 className="text-center font-headline text-4xl font-bold text-teal-brand">Your details</h1>
            <div className="mt-6 rounded-2xl bg-[#FAF6F0] px-5 py-4 font-lato text-base text-charcoal-brand">
              <span className="font-bold">{model.modelName}</span> for {days} {days === 1 ? 'day' : 'days'}
              {model.total !== null && <> · <span className="font-bold"><Peso amount={model.total} /></span></>}
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
