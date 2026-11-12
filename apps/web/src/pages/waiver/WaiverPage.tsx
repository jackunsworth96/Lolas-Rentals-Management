import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import lolasLogo from '../../assets/Lolas Original Logo.svg';
import { SEO } from '../../components/seo/SEO.js';
import { WaiverSigningTermsContent } from '../../components/waiver/WaiverSigningTermsContent.js';
import { formatPickupDatetimeManila } from '../../utils/date.js';
import { api } from '../../api/client.js';
import { WhatsAppNumberInput, whatsAppNumberError } from '../../components/common/WhatsAppNumberInput.js';
import { SignaturePad, isCanvasBlank } from '../../components/common/SignaturePad.js';

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

const REFERRAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'google', label: 'Google / Search engine' },
  { value: 'friend', label: 'A friend or family member' },
  { value: 'accommodation', label: 'My hotel or accommodation' },
  { value: 'travel_site', label: 'A travel website (TripAdvisor, Klook, etc.)' },
  { value: 'ai', label: 'AI assistant (ChatGPT, etc.)' },
  { value: 'social_media', label: 'Social media (Facebook, Instagram, TikTok)' },
  { value: 'repeat', label: "I've rented with you before" },
  { value: 'walk_in', label: 'Saw your shop in person' },
  { value: 'other', label: 'Other' },
];

const cardClass = 'bg-white rounded-xl border border-charcoal-brand/10 p-6';
const goldCtaClass =
  'w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-gold-brand border-2 border-charcoal-brand text-charcoal-brand font-bold font-lato px-6 py-3.5 transition-opacity disabled:opacity-40 disabled:pointer-events-none';
const inputClass =
  'w-full font-lato text-sm border border-charcoal-brand/20 rounded-lg px-3 py-2.5 focus:outline-none focus:border-teal-brand bg-white';

export default function WaiverPage() {
  const { orderReference: orderReferenceParam } = useParams<{ orderReference: string }>();
  const orderReference = orderReferenceParam ?? '';

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState<OrderWaiverPayload | null>(null);
  const [driverName, setDriverName] = useState('');
  const [driverEmail, setDriverEmail] = useState('');
  const [driverMobile, setDriverMobile] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [referralDetail, setReferralDetail] = useState('');
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
  const { t } = useTranslation();

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
        setError(t('waiver.missingRef'));
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
            err instanceof Error ? err.message : t('waiver.loadingError'),
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
        setError(err instanceof Error ? err.message : t('waiver.uploadFailed'));
      }
    })();
  };

  const submitWaiver = async () => {
    if (!orderReference || !licenceFrontUrl || !signatureCanvasRef.current) return;
    if (!driverEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driverEmail.trim())) {
      setError(t('waiver.emailRequired'));
      return;
    }
    if (whatsAppNumberError(driverMobile, false)) {
      setError(t('waiver.whatsappInvalid'));
      return;
    }
    if (isCanvasBlank(signatureCanvasRef.current)) {
      setError(t('waiver.signatureRequired'));
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
        referralSource,
        referralDetail: referralDetail.trim() || undefined,
        agreedToTerms: true,
        driverSignatureDataUrl,
        licenceFrontUrl,
        licenceBackUrl: licenceBackUrl || undefined,
        passengerSignatures: passengerSignatures.length ? passengerSignatures : undefined,
      });
      setAlreadySignedOnLoad(false);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('waiver.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-brand flex items-center justify-center px-4">
        <div className="font-lato text-charcoal-brand/80">{t('waiver.loading')}</div>
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
        <p className="font-lato text-charcoal-brand text-center max-w-md">{error || t('waiver.notFound')}</p>
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
              {t('waiver.signYourWaiver')}
            </h1>
            <p className="font-lato text-sm text-charcoal-brand/80 text-center mb-6">
              {t('waiver.booking')} <span className="font-semibold">{orderData.orderReference}</span>
            </p>

            <div className={`${cardClass} mb-6`}>
              <h2 className="font-headline text-lg text-teal-brand mb-3">{t('waiver.bookingSummary')}</h2>
              <dl className="font-lato text-sm text-charcoal-brand space-y-2">
                <div>
                  <dt className="text-charcoal-brand/60">{t('waiver.customer')}</dt>
                  <dd className="font-medium">{orderData.customerName}</dd>
                </div>
                <div>
                  <dt className="text-charcoal-brand/60">{t('waiver.vehicle')}</dt>
                  <dd className="font-medium">{orderData.vehicleModelName}</dd>
                </div>
                <div>
                  <dt className="text-charcoal-brand/60">{t('waiver.pickup')}</dt>
                  <dd>{formatPickupDatetimeManila(orderData.pickupDatetime)}</dd>
                </div>
                <div>
                  <dt className="text-charcoal-brand/60">{t('waiver.dropoff')}</dt>
                  <dd>{formatPickupDatetimeManila(orderData.dropoffDatetime)}</dd>
                </div>
              </dl>
            </div>

            <div className={`${cardClass} mb-6`}>
              <h2 className="font-headline text-lg text-teal-brand mb-3">{t('waiver.termsAndWaiver')}</h2>

              {/* Legal notice — translated per the user's language */}
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="font-lato text-sm text-amber-800">{t('waiver.legalNotice')}</p>
              </div>

              {/* Waiver body stays in English for legal reasons */}
              <div className="max-h-96 overflow-y-auto rounded-lg border border-charcoal-brand/10 bg-cream-brand/50 p-4 mb-4">
                <WaiverSigningTermsContent />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="font-lato text-sm font-medium text-charcoal-brand block mb-1">
                    {t('waiver.fullName')} <span className="text-red-600">*</span>
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
                    {t('waiver.email')} <span className="text-red-600">*</span>
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
                    {t('waiver.whatsappNumber')}
                  </label>
                  <WhatsAppNumberInput
                    value={driverMobile}
                    onChange={(value) => setDriverMobile(value)}
                    className={inputClass}
                    showPreview={false}
                  />
                </div>
                <div>
                  <label className="font-lato text-sm font-medium text-charcoal-brand block mb-1">
                    How did you hear about us? <span className="text-red-600">*</span>
                  </label>
                  <select
                    className={`${inputClass} bg-white`}
                    value={referralSource}
                    onChange={(e) => {
                      setReferralSource(e.target.value);
                      if (e.target.value !== 'accommodation') setReferralDetail('');
                    }}
                  >
                    <option value="" disabled>Select an option…</option>
                    {REFERRAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {referralSource === 'accommodation' && (
                  <div>
                    <label className="font-lato text-sm font-medium text-charcoal-brand block mb-1">
                      Which hotel or accommodation? <span className="text-red-600">*</span>
                    </label>
                    <input
                      className={inputClass}
                      value={referralDetail}
                      onChange={(e) => setReferralDetail(e.target.value)}
                      placeholder="e.g. Bravo Beach Resort"
                      autoComplete="off"
                    />
                  </div>
                )}
              </div>

              <label className="flex items-start gap-3 mt-6 font-lato text-sm text-charcoal-brand cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-charcoal-brand/30"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                />
                <span>{t('waiver.agreeTerms')}</span>
              </label>

              <button
                type="button"
                className={`${goldCtaClass} mt-6 w-full`}
                disabled={!agreedToTerms || !driverName.trim() || !referralSource || (referralSource === 'accommodation' && !referralDetail.trim())}
                onClick={() => setStep(2)}
              >
                {t('waiver.continueToSign')}
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
              {t('waiver.backToTerms')}
            </button>
            <h1 className="font-headline text-2xl text-teal-brand">{t('waiver.licenceAndSig')}</h1>

            <div className={cardClass}>
              <h2 className="font-headline text-lg text-teal-brand mb-1">{t('waiver.drivingLicence')}</h2>
              <p className="font-lato text-sm text-charcoal-brand mb-1">{t('waiver.uploadPhoto')}</p>
              <p className="font-lato text-xs text-charcoal-brand/70 mb-4">{t('waiver.legalCompliance')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block">
                    <span className={`${goldCtaClass} w-full text-sm py-2.5 cursor-pointer`}>{t('waiver.licenceFront')}</span>
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
                    <span className={`${goldCtaClass} w-full text-sm py-2.5 cursor-pointer`}>{t('waiver.licenceBack')}</span>
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
              <h2 className="font-headline text-lg text-teal-brand mb-3">{t('waiver.signBelow')}</h2>
              <SignaturePad canvasRef={signatureCanvasRef} onDrawingChange={setDriverHasSignature} />
            </div>

            <div className={cardClass}>
              <h2 className="font-headline text-lg text-teal-brand mb-1">{t('waiver.passengerSigs')}</h2>
              <p className="font-lato text-xs text-charcoal-brand/70 mb-4">
                {t('waiver.passengerOptional')}
              </p>
              {Array.from({ length: passengerSlots }, (_, i) => (
                <div key={i} className="mb-6 last:mb-0">
                  <p className="font-lato text-sm text-charcoal-brand mb-2">{t('waiver.passenger', { n: i + 1 })}</p>
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
                  {t('waiver.addPassenger')}
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
              {submitting ? t('waiver.submitting') : t('waiver.submitWaiver')}
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
                <h1 className="font-headline text-2xl sm:text-3xl text-teal-brand mb-3">{t('waiver.alreadySigned')}</h1>
                <p className="font-lato text-charcoal-brand mb-6">
                  {t('waiver.alreadySignedBody')}
                </p>
              </>
            ) : (
              <>
                <h1 className="font-headline text-2xl sm:text-3xl text-teal-brand mb-3">{t('waiver.waiverSigned')}</h1>
                <p className="font-lato text-charcoal-brand mb-6">
                  {t('waiver.waiverSignedBody', { name: driverName.trim() || orderData.customerName })} <span className="font-semibold">{orderReference}</span>.
                </p>
              </>
            )}
            <div className="w-full bg-sand-brand/50 rounded-lg p-4 text-left font-lato text-sm text-charcoal-brand">
              {t('waiver.showScreen')} <span className="font-bold">{orderReference}</span>
            </div>
            <Link
              to="/book"
              className={`${goldCtaClass} mt-8 w-full max-w-xs no-underline`}
            >
              {t('waiver.returnHome')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
