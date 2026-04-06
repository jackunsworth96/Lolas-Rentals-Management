import { useState } from 'react';
import { PlaneTakeoff, PlaneLanding, Users, Car, Minus, Plus, CheckCircle2, MessageCircle, Loader2 } from 'lucide-react';
import { PageLayout } from '../components/layout/PageLayout.js';
import { PageHeader } from '../components/public/PageHeader.js';
import { PrimaryCtaButton } from '../components/public/PrimaryCtaButton.js';
import { FadeUpSection } from '../components/public/FadeUpSection.js';
import { today } from '../utils/date.js';
import { WHATSAPP_URL } from '../config/contact.js';

const ROUTES = [
  { value: 'General Luna → IAO Airport', icon: PlaneTakeoff, label: 'General Luna → IAO Airport', sub: 'Departing Siargao' },
  { value: 'IAO Airport → General Luna', icon: PlaneLanding, label: 'IAO Airport → General Luna', sub: 'Arriving in Siargao' },
] as const;

const SHARED_PRICE = 330;
const PRIVATE_PRICE = 2500;

type VanType = 'Shared' | 'Private';

function calcTotal(vanType: VanType, paxCount: number): number {
  return vanType === 'Shared' ? SHARED_PRICE * paxCount : PRIVATE_PRICE;
}

function normalizeApiBase(value: string | undefined): string {
  const raw = (value ?? '').trim() || '/api';
  const base = raw.replace(/\/+$/, '');
  if (base.startsWith('http')) return base.endsWith('/api') ? base : `${base}/api`;
  return base || '/api';
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);

const cardBase = 'rounded-2xl p-6 border-2 cursor-pointer transition-colors';
const cardUnselected = `${cardBase} bg-cream-brand border-charcoal-brand/10 hover:border-teal-brand/40`;
const cardSelected = `${cardBase} border-teal-brand bg-teal-brand/5`;

const inputClass =
  'w-full font-lato text-sm border border-charcoal-brand/20 rounded-lg px-3 py-2.5 focus:outline-none focus:border-teal-brand bg-white';

export default function TransferBookingPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [route, setRoute] = useState<string | null>(null);
  const [vanType, setVanType] = useState<VanType | null>(null);
  const [paxCount, setPaxCount] = useState(1);

  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [flightTime, setFlightTime] = useState('');
  const [opsNotes, setOpsNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});


  function validateForm(): boolean {
    const errs: Record<string, string> = {};
    if (!customerName.trim()) errs.customerName = 'Full name is required';
    if (!contactNumber.trim()) errs.contactNumber = 'WhatsApp number is required';
    if (!serviceDate) errs.serviceDate = 'Date is required';
    if (!flightTime) errs.flightTime = 'Time is required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validateForm() || !route || !vanType) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`${API_BASE}/public/public-transfer-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          contactNumber: contactNumber.trim(),
          flightNumber: flightNumber.trim().toUpperCase() || null,
          serviceDate,
          flightTime: flightTime || null,
          paxCount,
          route,
          vanType,
          totalPrice: calcTotal(vanType, paxCount),
          opsNotes: opsNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as Record<string, unknown> | null;
        throw new Error(
          (body?.error as Record<string, string> | undefined)?.message
          ?? 'Something went wrong. Please try again or WhatsApp us directly.',
        );
      }

      setIsConfirmed(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again or WhatsApp us directly.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetAll() {
    setStep(1);
    setRoute(null);
    setVanType(null);
    setPaxCount(1);
    setCustomerName('');
    setContactNumber('');
    setFlightNumber('');
    setServiceDate('');
    setFlightTime('');
    setOpsNotes('');
    setIsConfirmed(false);
    setSubmitError(null);
    setFieldErrors({});
  }

  if (isConfirmed) {
    return (
      <PageLayout title="Booking Confirmed | Lola's Rentals">
        <div className="mx-auto max-w-2xl px-4 pt-8">
          <FadeUpSection>
            <div className="flex flex-col items-center text-center">
              <CheckCircle2 className="mb-4 text-teal-brand" size={64} />
              <h2 className="font-headline text-2xl font-black text-teal-brand">Booking Confirmed!</h2>
              <p className="mt-2 font-lato text-sm text-charcoal-brand/70">
                We'll be in touch shortly to confirm your transfer details.
              </p>

              <div className="mt-8 w-full rounded-2xl border border-charcoal-brand/10 bg-sand-brand p-5">
                <div className="space-y-3 text-left font-lato text-sm">
                  <Row label="Route" value={route ?? ''} />
                  <Row label="Van Type" value={vanType === 'Shared' ? 'Shared Van' : 'Private Van'} />
                  <Row label="Date" value={serviceDate} />
                  <Row label="Time" value={flightTime} />
                  <Row label="Passengers" value={String(paxCount)} />
                  <div className="border-t border-charcoal-brand/10 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-charcoal-brand">Total</span>
                      <span className="font-headline text-xl font-bold text-teal-brand">
                        ₱{calcTotal(vanType!, paxCount).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 font-lato font-semibold text-white transition-opacity hover:opacity-90"
              >
                <MessageCircle size={20} />
                Message us on WhatsApp
              </a>

              <button
                type="button"
                onClick={resetAll}
                className="mt-4 font-lato text-sm font-semibold text-teal-brand transition-opacity hover:opacity-70"
              >
                Book Another Transfer
              </button>
            </div>
          </FadeUpSection>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Airport Transfers | Lola's Rentals">
      <PageHeader
        eyebrow="Siargao Island"
        headingMain="Airport"
        headingAccent="Transfers"
        subheading="Reliable transfers between General Luna and IAO Airport"
      />

      <div className="mx-auto max-w-2xl px-4 pt-8">
        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-3 font-lato text-sm">
          <span className={step === 1 ? 'font-semibold text-teal-brand' : 'text-charcoal-brand/40'}>① Route</span>
          <span className="text-charcoal-brand/30">→</span>
          <span className={step === 2 ? 'font-semibold text-teal-brand' : 'text-charcoal-brand/40'}>② Your Details</span>
        </div>

        {step === 1 && (
          <FadeUpSection>
            <div className="space-y-8">
              {/* Route selection */}
              <div>
                <h3 className="mb-3 font-headline text-lg text-teal-brand">Choose your route</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {ROUTES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRoute(r.value)}
                      className={`text-left ${route === r.value ? cardSelected : cardUnselected}`}
                    >
                      <r.icon size={32} className="mb-3 text-teal-brand" />
                      <p className="font-headline text-lg text-teal-brand">{r.label}</p>
                      <p className="font-lato text-sm text-charcoal-brand/60">{r.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Van type */}
              <div>
                <h3 className="mb-3 font-headline text-lg text-teal-brand">Choose your van</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setVanType('Shared')}
                    className={`text-left ${vanType === 'Shared' ? cardSelected : cardUnselected}`}
                  >
                    <Users size={24} className="mb-2 text-teal-brand" />
                    <p className="font-headline text-base text-teal-brand">Shared Van</p>
                    <p className="font-lato text-sm text-charcoal-brand">₱330 per person</p>
                    <p className="mt-1 font-lato text-xs text-charcoal-brand/60">Perfect for solo travellers and couples</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVanType('Private')}
                    className={`text-left ${vanType === 'Private' ? cardSelected : cardUnselected}`}
                  >
                    <Car size={24} className="mb-2 text-teal-brand" />
                    <p className="font-headline text-base text-teal-brand">Private Van</p>
                    <p className="font-lato text-sm text-charcoal-brand">₱2,500 total</p>
                    <p className="mt-1 font-lato text-xs text-charcoal-brand/60">Ideal for families and groups up to 10</p>
                  </button>
                </div>
              </div>

              {/* Passenger count */}
              <div>
                <label className="mb-2 block font-lato text-sm font-semibold text-charcoal-brand">Passengers</label>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPaxCount((c) => Math.max(1, c - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-charcoal-brand/20 text-charcoal-brand transition-colors hover:border-teal-brand"
                  >
                    <Minus size={18} />
                  </button>
                  <span className="min-w-[2rem] text-center font-headline text-xl font-bold text-charcoal-brand">{paxCount}</span>
                  <button
                    type="button"
                    onClick={() => setPaxCount((c) => Math.min(10, c + 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-charcoal-brand/20 text-charcoal-brand transition-colors hover:border-teal-brand"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {vanType === 'Shared' && (
                  <p className="mt-2 font-lato text-xs text-charcoal-brand/60">
                    ₱330 × {paxCount} passenger{paxCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Continue */}
              <PrimaryCtaButton
                type="button"
                onClick={() => setStep(2)}
                disabled={!route || !vanType}
                className="flex w-full items-center justify-center gap-2 py-3.5 font-bold"
              >
                Continue to Your Details →
              </PrimaryCtaButton>
            </div>
          </FadeUpSection>
        )}

        {step === 2 && (
          <FadeUpSection>
            <div className="space-y-6">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="font-lato text-sm text-teal-brand transition-opacity hover:opacity-70"
              >
                ← Back to Route Selection
              </button>

              {/* Form */}
              <div className="space-y-5">
                <Field label="Full Name" required error={fieldErrors.customerName}>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your full name"
                    className={inputClass}
                  />
                </Field>

                <Field label="WhatsApp Number" required error={fieldErrors.contactNumber}>
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="+63 912 345 6789"
                    className={inputClass}
                  />
                </Field>

                <Field label="Flight Number" helper="Optional — helps us track your flight for delays">
                  <input
                    type="text"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. 5J621"
                    className={inputClass}
                  />
                </Field>

                <Field label="Date" required error={fieldErrors.serviceDate}>
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    min={today()}
                    className={inputClass}
                  />
                </Field>

                <Field label="Time" required error={fieldErrors.flightTime} helper="Enter your flight arrival or departure time">
                  <input
                    type="time"
                    value={flightTime}
                    onChange={(e) => setFlightTime(e.target.value)}
                    className={inputClass}
                  />
                </Field>

                <Field label="Pickup / Dropoff Notes">
                  <textarea
                    rows={3}
                    value={opsNotes}
                    onChange={(e) => setOpsNotes(e.target.value)}
                    placeholder="e.g. Hotel name, specific pickup spot, luggage info"
                    className={inputClass}
                  />
                </Field>
              </div>

              {/* Price summary */}
              <div className="rounded-2xl border border-charcoal-brand/10 bg-sand-brand p-5">
                <div className="space-y-3 font-lato text-sm">
                  <Row label="Route" value={route ?? ''} />
                  <Row label="Van Type" value={vanType === 'Shared' ? 'Shared Van' : 'Private Van'} />
                  <Row label="Passengers" value={String(paxCount)} />
                  <div className="border-t border-charcoal-brand/10 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-charcoal-brand">Total</span>
                      <span className="font-headline text-xl font-bold text-teal-brand">
                        ₱{calcTotal(vanType!, paxCount).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {submitError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 font-lato text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <PrimaryCtaButton
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 py-3.5 font-bold"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : null}
                {isSubmitting ? 'Submitting...' : 'Confirm Booking'}
              </PrimaryCtaButton>
            </div>
          </FadeUpSection>
        )}
      </div>
    </PageLayout>
  );
}

function Field({
  label,
  required,
  error,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-lato text-sm font-medium text-charcoal-brand">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </span>
      {children}
      {helper && !error && <p className="mt-1 font-lato text-xs text-charcoal-brand/50">{helper}</p>}
      {error && <p className="mt-1 font-lato text-xs text-red-500">{error}</p>}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-charcoal-brand/60">{label}</span>
      <span className="font-medium text-charcoal-brand">{value}</span>
    </div>
  );
}
