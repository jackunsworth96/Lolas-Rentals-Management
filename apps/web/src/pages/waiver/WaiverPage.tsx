import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import lolasLogo from '../../assets/Lolas Original Logo.svg';
import { SEO } from '../../components/seo/SEO.js';
import { WaiverSigningTermsContent } from '../../components/waiver/WaiverSigningTermsContent.js';
import { formatPickupDatetimeManila } from '../../utils/date.js';
import { api } from '../../api/client.js';

interface OrderWaiverPayload {
  orderReference: string;
  customerName: string;
  customerEmail?: string | null;
  vehicleModelName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  waiverStatus: 'pending' | 'signed';
  signedAt: string | null;
}

const cardClass = 'bg-white rounded-xl border border-charcoal-brand/10 p-6';
const goldCtaClass =
  'w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-gold-brand border-2 border-charcoal-brand text-charcoal-brand font-bold font-lato px-6 py-3.5 transition-opacity disabled:opacity-40 disabled:pointer-events-none';
const inputClass =
  'w-full font-lato text-sm border border-charcoal-brand/20 rounded-lg px-3 py-2.5 focus:outline-none focus:border-teal-brand bg-white';

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 255;
    const g = data[i + 1] ?? 255;
    const b = data[i + 2] ?? 255;
    if (r < 248 || g < 248 || b < 248) return false;
  }
  return true;
}

function setupCanvasSize(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }
}

interface SignaturePadProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onDrawingChange?: (hasInk: boolean) => void;
}

function SignaturePad({ canvasRef, onDrawingChange }: SignaturePadProps) {
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const refreshSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupCanvasSize(canvas);
  }, [canvasRef]);

  useEffect(() => {
    refreshSize();
    const ro = new ResizeObserver(() => refreshSize());
    const canvas = canvasRef.current;
    if (canvas) ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvasRef, refreshSize]);

  const getPos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = getPos(e);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    onDrawingChange?.(!isCanvasBlank(canvas));
  };

  const endStroke = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const canvas = canvasRef.current;
    if (canvas) onDrawingChange?.(!isCanvasBlank(canvas));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupCanvasSize(canvas);
    onDrawingChange?.(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full h-[200px] touch-none rounded-lg border-2 border-charcoal-brand bg-white"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={(e) => {
          if (drawing.current) endStroke(e);
        }}
      />
      <button
        type="button"
        className="mt-2 font-lato text-sm text-teal-brand underline underline-offset-2"
        onClick={clear}
      >
        Clear signature
      </button>
    </div>
  );
}

export default function WaiverPage() {
  const { orderReference: orderReferenceParam } = useParams<{ orderReference: string }>();
  const orderReference = orderReferenceParam ?? '';

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState<OrderWaiverPayload | null>(null);
  const [driverName, setDriverName] = useState('');
  const [driverEmail, setDriverEmail] = useState('');
  const [driverMobile, setDriverMobile] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [licenceFrontUrl, setLicenceFrontUrl] = useState('');
  const [licenceBackUrl, setLicenceBackUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [driverHasSignature, setDriverHasSignature] = useState(false);
  const [passengerSlots, setPassengerSlots] = useState(0);
  const passengerRef0 = useRef<HTMLCanvasElement | null>(null);
  const passengerRef1 = useRef<HTMLCanvasElement | null>(null);
  const passengerRef2 = useRef<HTMLCanvasElement | null>(null);
  const passengerRef3 = useRef<HTMLCanvasElement | null>(null);
  const passengerRefsList = [passengerRef0, passengerRef1, passengerRef2, passengerRef3] as const;
  const [passengerHasInk, setPassengerHasInk] = useState([false, false, false, false]);

  const [alreadySignedOnLoad, setAlreadySignedOnLoad] = useState(false);

  const setPassengerInk = (index: number, has: boolean) => {
    setPassengerHasInk((prev) => {
      const next = [...prev];
      next[index] = has;
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orderReference) {
        setLoading(false);
        setError('Missing booking reference.');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const data = await api.get<OrderWaiverPayload>(
          `/public/waiver/${encodeURIComponent(orderReference)}`,
        );
        if (cancelled) return;
        setOrderData(data);
        setDriverName(data.customerName ?? '');
        if (data.customerEmail && !driverEmail) {
          setDriverEmail(data.customerEmail);
        }
        if (data.waiverStatus === 'signed') {
          setAlreadySignedOnLoad(true);
          setStep(3);
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : 'Something went wrong loading your booking. Please try again.',
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orderReference]);

  const uploadLicence = async (file: File, side: 'front' | 'back') => {
    const fd = new FormData();
    fd.append('file', file);
    const result = await api.upload<{ url: string }>(
      `/public/waiver/${encodeURIComponent(orderReference)}/upload-licence?side=${side}`,
      fd,
    );
    return result.url;
  };

  const onPickLicence = (side: 'front' | 'back') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void (async () => {
      try {
        setError('');
        const url = await uploadLicence(file, side);
        if (side === 'front') setLicenceFrontUrl(url);
        else setLicenceBackUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    })();
  };

  const submitWaiver = async () => {
    if (!orderReference || !licenceFrontUrl || !signatureCanvasRef.current) return;
    if (!driverEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driverEmail.trim())) {
      setError('A valid email address is required');
      return;
    }
    if (isCanvasBlank(signatureCanvasRef.current)) {
      setError('Please add your signature.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const driverSignatureDataUrl = signatureCanvasRef.current.toDataURL('image/png');
      const passengerSignatures: string[] = [];
      for (let i = 0; i < passengerSlots; i++) {
        const c = passengerRefsList[i].current;
        if (c && passengerHasInk[i] && !isCanvasBlank(c)) {
          passengerSignatures.push(c.toDataURL('image/png'));
        }
      }

      await api.post(`/public/waiver/${encodeURIComponent(orderReference)}/sign`, {
        driverName: driverName.trim(),
        driverEmail: driverEmail.trim(),
        driverMobile: driverMobile.trim() || undefined,
        agreedToTerms: true,
        driverSignatureDataUrl,
        licenceFrontUrl,
        licenceBackUrl: licenceBackUrl || undefined,
        passengerSignatures: passengerSignatures.length ? passengerSignatures : undefined,
      });
      setAlreadySignedOnLoad(false);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit waiver.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-brand flex items-center justify-center px-4">
        <div className="font-lato text-charcoal-brand/80">Loading your booking…</div>
      </div>
    );
  }

  if (!orderData && error && !orderReference) {
    return (
      <div className="min-h-screen bg-cream-brand flex items-center justify-center px-4">
        <p className="font-lato text-charcoal-brand text-center">{error}</p>
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className="min-h-screen bg-cream-brand flex flex-col items-center justify-center gap-4 px-6">
        <p className="font-lato text-charcoal-brand text-center max-w-md">{error || 'Booking not found.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-brand pb-12 pt-6 px-4 sm:px-6">
      <SEO
        title="Rental Waiver | Lola's Rentals"
        description="Complete your rental waiver for Lola's Rentals Siargao."
        noIndex={true}
      />
      <div className="mx-auto max-w-lg">
        {step === 1 && (
          <>
            <div className="flex justify-center mb-6">
              <img
                src={lolasLogo}
                alt="Lola's Rentals"
                className="h-16 w-auto object-contain"
              />
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl text-teal-brand text-center mb-2">
              Sign your waiver
            </h1>
            <p className="font-lato text-sm text-charcoal-brand/80 text-center mb-6">
              Booking <span className="font-semibold">{orderData.orderReference}</span>
            </p>

            <div className={`${cardClass} mb-6`}>
              <h2 className="font-headline text-lg text-teal-brand mb-3">Booking summary</h2>
              <dl className="font-lato text-sm text-charcoal-brand space-y-2">
                <div>
                  <dt className="text-charcoal-brand/60">Customer</dt>
                  <dd className="font-medium">{orderData.customerName}</dd>
                </div>
                <div>
                  <dt className="text-charcoal-brand/60">Vehicle</dt>
                  <dd className="font-medium">{orderData.vehicleModelName}</dd>
                </div>
                <div>
                  <dt className="text-charcoal-brand/60">Pickup</dt>
                  <dd>{formatPickupDatetimeManila(orderData.pickupDatetime)}</dd>
                </div>
                <div>
                  <dt className="text-charcoal-brand/60">Dropoff</dt>
                  <dd>{formatPickupDatetimeManila(orderData.dropoffDatetime)}</dd>
                </div>
              </dl>
            </div>

            <div className={`${cardClass} mb-6`}>
              <h2 className="font-headline text-lg text-teal-brand mb-3">Terms &amp; waiver</h2>
              <div className="max-h-96 overflow-y-auto rounded-lg border border-charcoal-brand/10 bg-cream-brand/50 p-4 mb-4">
                <WaiverSigningTermsContent />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="font-lato text-sm font-medium text-charcoal-brand block mb-1">
                    Full name <span className="text-red-600">*</span>
                  </label>
                  <input
                    className={inputClass}
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="font-lato text-sm font-medium text-charcoal-brand block mb-1">
                    Email <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="email"
                    className={inputClass}
                    value={driverEmail}
                    onChange={(e) => setDriverEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="font-lato text-sm font-medium text-charcoal-brand block mb-1">
                    WhatsApp number
                  </label>
                  <input
                    type="tel"
                    className={inputClass}
                    value={driverMobile}
                    onChange={(e) => setDriverMobile(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 mt-6 font-lato text-sm text-charcoal-brand cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-charcoal-brand/30"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                />
                <span>I have read and agree to all terms and conditions above</span>
              </label>

              <button
                type="button"
                className={`${goldCtaClass} mt-6 w-full`}
                disabled={!agreedToTerms || !driverName.trim()}
                onClick={() => setStep(2)}
              >
                Continue to Sign →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <button
              type="button"
              className="font-lato text-sm text-teal-brand mb-2"
              onClick={() => setStep(1)}
            >
              ← Back to terms
            </button>
            <h1 className="font-headline text-2xl text-teal-brand">Licence &amp; signature</h1>

            <div className={cardClass}>
              <h2 className="font-headline text-lg text-teal-brand mb-1">Driving licence</h2>
              <p className="font-lato text-sm text-charcoal-brand mb-1">Upload a photo of your driving licence</p>
              <p className="font-lato text-xs text-charcoal-brand/70 mb-4">Required for legal compliance</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block">
                    <span className={`${goldCtaClass} w-full text-sm py-2.5 cursor-pointer`}>Licence Front</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={onPickLicence('front')}
                    />
                  </label>
                  {licenceFrontUrl ? (
                    <img
                      src={licenceFrontUrl}
                      alt="Licence front"
                      className="mt-2 w-full rounded-lg border border-charcoal-brand/10 object-cover max-h-28"
                    />
                  ) : null}
                </div>
                <div>
                  <label className="block">
                    <span className={`${goldCtaClass} w-full text-sm py-2.5 cursor-pointer`}>Licence Back</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={onPickLicence('back')}
                    />
                  </label>
                  {licenceBackUrl ? (
                    <img
                      src={licenceBackUrl}
                      alt="Licence back"
                      className="mt-2 w-full rounded-lg border border-charcoal-brand/10 object-cover max-h-28"
                    />
                  ) : null}
                </div>
              </div>
            </div>

            <div className={cardClass}>
              <h2 className="font-headline text-lg text-teal-brand mb-3">Sign below</h2>
              <SignaturePad canvasRef={signatureCanvasRef} onDrawingChange={setDriverHasSignature} />
            </div>

            <div className={cardClass}>
              <h2 className="font-headline text-lg text-teal-brand mb-1">Additional passenger signatures</h2>
              <p className="font-lato text-xs text-charcoal-brand/70 mb-4">
                (optional) If other passengers are riding, they must also sign below
              </p>
              {Array.from({ length: passengerSlots }, (_, i) => (
                <div key={i} className="mb-6 last:mb-0">
                  <p className="font-lato text-sm text-charcoal-brand mb-2">Passenger {i + 1}</p>
                  <SignaturePad
                    canvasRef={passengerRefsList[i]}
                    onDrawingChange={(has) => setPassengerInk(i, has)}
                  />
                </div>
              ))}
              {passengerSlots < 4 ? (
                <button
                  type="button"
                  className="font-lato text-sm text-teal-brand underline underline-offset-2"
                  onClick={() => setPassengerSlots((s) => s + 1)}
                >
                  Add passenger
                </button>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 font-lato text-sm p-3">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              className={`${goldCtaClass} w-full`}
              disabled={submitting || !licenceFrontUrl || !driverHasSignature}
              onClick={() => void submitWaiver()}
            >
              {submitting ? 'Submitting…' : 'Submit Waiver'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center text-center pt-4">
            <div
              className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
              aria-hidden
            >
              <CheckCircle2 className="h-10 w-10 text-green-600" strokeWidth={2.25} />
            </div>
            {alreadySignedOnLoad ? (
              <>
                <h1 className="font-headline text-2xl sm:text-3xl text-teal-brand mb-3">Already signed</h1>
                <p className="font-lato text-charcoal-brand mb-6">
                  You have already completed your waiver for this booking. See you soon!
                </p>
              </>
            ) : (
              <>
                <h1 className="font-headline text-2xl sm:text-3xl text-teal-brand mb-3">Waiver Signed!</h1>
                <p className="font-lato text-charcoal-brand mb-6">
                  Thank you {driverName.trim() || orderData.customerName}. Your waiver has been submitted for your
                  booking <span className="font-semibold">{orderReference}</span>.
                </p>
              </>
            )}
            <div className="w-full bg-sand-brand/50 rounded-lg p-4 text-left font-lato text-sm text-charcoal-brand">
              Please show this screen to our team when you arrive. Your booking reference is:{' '}
              <span className="font-bold">{orderReference}</span>
            </div>
            <Link
              to="/book"
              className={`${goldCtaClass} mt-8 w-full max-w-xs no-underline`}
            >
              Return home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
