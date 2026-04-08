import { useState, useEffect, useMemo } from 'react';
import { PlaneTakeoff, PlaneLanding, Minus, Plus, CheckCircle2, MessageCircle, Loader2 } from 'lucide-react';
import { PageLayout } from '../components/layout/PageLayout.js';
import { PageHeader } from '../components/public/PageHeader.js';
import { PrimaryCtaButton } from '../components/public/PrimaryCtaButton.js';
import { FadeUpSection } from '../components/public/FadeUpSection.js';
import { today } from '../utils/date.js';
import { WHATSAPP_URL } from '../config/contact.js';
import { api } from '../api/client.js';

/** Matches public standalone transfer booking (`public-transfers.ts`). */
const TRANSFER_STORE_ID = 'store-lolas';

interface TransferRouteRow {
  id: number;
  route: string;
  vanType: string | null;
  price: number;
  pricingType: string;
  storeId: string | null;
  isActive: boolean;
}

type VanType = 'Shared' | 'Private' | 'TukTuk';

interface VanSelection {
  transferRouteId: number;
  vanType: VanType;
  unitPrice: number;
  pricingType: 'fixed' | 'per_head';
  displayName: string;
}

function mapVanTypeMeta(vanType: string | null): {
  displayName: string;
  icon: string;
  submitVan: VanType;
  defaultPerHead: boolean;
} {
  const lower = (vanType ?? '').toLowerCase();
  if (lower.includes('shared')) {
    return { displayName: 'Shared Van', icon: '🚐', submitVan: 'Shared', defaultPerHead: true };
  }
  if (lower.includes('tuk')) {
    return { displayName: 'Private TukTuk', icon: '🛺', submitVan: 'TukTuk', defaultPerHead: false };
  }
  return { displayName: 'Private Van', icon: '🚌', submitVan: 'Private', defaultPerHead: false };
}

function pricingFromRow(row: TransferRouteRow, meta: { defaultPerHead: boolean }): 'fixed' | 'per_head' {
  const p = (row.pricingType ?? '').toLowerCase();
  if (p === 'per_head') return 'per_head';
  if (p === 'fixed') return 'fixed';
  return meta.defaultPerHead ? 'per_head' : 'fixed';
}

function buildVanOptionsForRoute(rows: TransferRouteRow[]): Array<VanSelection & { icon: string }> {
  const seen = new Set<string>();
  const out: Array<VanSelection & { icon: string }> = [];
  for (const row of rows) {
    const key = (row.vanType ?? '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = mapVanTypeMeta(row.vanType);
    const pricingType = pricingFromRow(row, meta);
    out.push({
      transferRouteId: row.id,
      vanType: meta.submitVan,
      unitPrice: row.price,
      pricingType,
      displayName: meta.displayName,
      icon: meta.icon,
    });
  }
  return out;
}

/** Display order: Shared → TukTuk (center when three options) → Private */
const VAN_DISPLAY_ORDER: Record<VanType, number> = {
  Shared: 0,
  TukTuk: 1,
  Private: 2,
};

function sortVanOptionsForDisplay(options: Array<VanSelection & { icon: string }>) {
  return [...options].sort((a, b) => VAN_DISPLAY_ORDER[a.vanType] - VAN_DISPLAY_ORDER[b.vanType]);
}

function calcTotal(selection: VanSelection, paxCount: number): number {
  return selection.pricingType === 'per_head' ? selection.unitPrice * paxCount : selection.unitPrice;
}

function vanTypeLabel(v: VanType): string {
  if (v === 'Shared') return 'Shared Van';
  if (v === 'TukTuk') return 'Private TukTuk';
  return 'Private Van';
}

function routeCardMeta(routeStr: string): { Icon: typeof PlaneTakeoff; label: string; sub: string } {
  const first = routeStr.split(/→|->/).map((s) => s.trim().toLowerCase())[0] ?? '';
  const outbound = first.includes('luna') || first.includes('general luna');
  return outbound
    ? { Icon: PlaneTakeoff, label: routeStr, sub: 'Departing Siargao' }
    : { Icon: PlaneLanding, label: routeStr, sub: 'Arriving in Siargao' };
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
  const [vanSelection, setVanSelection] = useState<VanSelection | null>(null);
  const [paxCount, setPaxCount] = useState(1);

  const [allRows, setAllRows] = useState<TransferRouteRow[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    setRoutesLoading(true);
    setRoutesError(null);
    api
      .get<TransferRouteRow[]>(`/public/booking/transfer-routes?storeId=${TRANSFER_STORE_ID}`)
      .then((data) => {
        if (!cancelled) setAllRows(data ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRoutesError(err instanceof Error ? err.message : 'Failed to load transfer options');
          setAllRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setRoutesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const uniqueRouteStrings = useMemo(() => {
    const set = new Set(allRows.map((r) => r.route));
    return Array.from(set).sort();
  }, [allRows]);

  const vanOptions = useMemo(() => {
    if (!route) return [];
    const forRoute = allRows.filter((r) => r.route === route);
    return sortVanOptionsForDisplay(buildVanOptionsForRoute(forRoute));
  }, [allRows, route]);

  function onRoutePick(routeStr: string) {
    setRoute(routeStr);
    setVanSelection(null);
    setPaxCount(1);
  }

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
    if (!validateForm() || !route || !vanSelection) return;
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
          vanType: vanSelection.vanType,
          totalPrice: calcTotal(vanSelection, paxCount),
          opsNotes: opsNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
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
    setVanSelection(null);
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

  if (isConfirmed && vanSelection) {
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
                  <Row label="Van Type" value={vanSelection.displayName} />
                  <Row label="Date" value={serviceDate} />
                  <Row label="Time" value={flightTime} />
                  <Row label="Passengers" value={String(paxCount)} />
                  <div className="border-t border-charcoal-brand/10 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-charcoal-brand">Total</span>
                      <span className="font-headline text-xl font-bold text-teal-brand">
                        ₱{calcTotal(vanSelection, paxCount).toLocaleString()}
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
    <PageLayout title="Airport Transfers | Lola's Rentals" fullBleed>
      <PageHeader
        eyebrow="Siargao Island"
        headingMain="Airport"
        headingAccent="Transfers"
        subheading="Reliable transfers between General Luna and IAO Airport"
        className="px-6 pt-20 pb-6 text-center"
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
              {routesLoading && (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 animate-pulse rounded-lg bg-sand-brand" />
                  ))}
                </div>
              )}

              {!routesLoading && routesError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 font-lato text-sm text-red-700">{routesError}</p>
              )}

              {!routesLoading && !routesError && uniqueRouteStrings.length === 0 && (
                <p className="font-lato text-sm text-charcoal-brand/70">
                  No transfer routes are available right now. Please contact us on WhatsApp.
                </p>
              )}

              {!routesLoading && !routesError && uniqueRouteStrings.length > 0 && (
                <>
                  {/* Route selection */}
                  <div>
                    <h3 className="mb-3 font-headline text-lg text-teal-brand">Choose your route</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {uniqueRouteStrings.map((routeStr) => {
                        const { Icon, label, sub } = routeCardMeta(routeStr);
                        return (
                          <button
                            key={routeStr}
                            type="button"
                            onClick={() => onRoutePick(routeStr)}
                            className={`text-left ${route === routeStr ? cardSelected : cardUnselected}`}
                          >
                            <Icon size={32} className="mb-3 text-teal-brand" />
                            <p className="font-headline text-lg text-teal-brand">{label}</p>
                            <p className="font-lato text-sm text-charcoal-brand/60">{sub}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Transport options — dynamic from API for selected route */}
                  <div>
                    <h3 className="mb-3 font-headline text-lg text-teal-brand">Choose your transport</h3>
                    {!route && (
                      <p className="font-lato text-sm text-charcoal-brand/50">Select a route first.</p>
                    )}
                    {route && vanOptions.length === 0 && (
                      <p className="font-lato text-sm text-charcoal-brand/70">No van options for this route.</p>
                    )}
                    {route && vanOptions.length > 0 && (
                      <div
                        className={`grid grid-cols-1 gap-4 ${
                          vanOptions.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
                        }`}
                      >
                        {vanOptions.map((opt) => {
                          const selected =
                            vanSelection !== null && vanSelection.transferRouteId === opt.transferRouteId;
                          const isTukTuk = opt.vanType === 'TukTuk';
                          const priceLine =
                            opt.pricingType === 'per_head'
                              ? `₱${opt.unitPrice.toLocaleString()} per person`
                              : `₱${opt.unitPrice.toLocaleString()} total`;
                          const blurb =
                            opt.vanType === 'Shared'
                              ? 'Perfect for solo travellers and couples'
                              : opt.vanType === 'TukTuk'
                                ? 'Private three-wheel transfer'
                                : 'Ideal for families and groups up to 10';
                          const transportCardClass = isTukTuk
                            ? `text-left rounded-2xl border-2 cursor-pointer transition-colors relative overflow-hidden p-0 ${
                                selected
                                  ? 'border-teal-brand bg-teal-brand/5 shadow-[0_8px_24px_rgba(62,124,120,0.12)] ring-2 ring-gold-brand/35'
                                  : 'border-teal-brand/45 bg-cream-brand hover:border-teal-brand hover:shadow-md ring-1 ring-teal-brand/20'
                              }`
                            : selected
                              ? cardSelected
                              : cardUnselected;
                          return (
                            <button
                              key={opt.transferRouteId}
                              type="button"
                              onClick={() => {
                                setVanSelection({
                                  transferRouteId: opt.transferRouteId,
                                  vanType: opt.vanType,
                                  unitPrice: opt.unitPrice,
                                  pricingType: opt.pricingType,
                                  displayName: opt.displayName,
                                });
                                if (opt.pricingType === 'per_head') {
                                  setPaxCount((c) => Math.max(1, c));
                                } else {
                                  setPaxCount(1);
                                }
                              }}
                              className={transportCardClass}
                            >
                              {isTukTuk && (
                                <div className="bg-gradient-to-r from-teal-brand via-teal-brand to-teal-brand/90 py-2 text-center font-lato text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                                  Recommended
                                </div>
                              )}
                              {isTukTuk ? (
                                <div className="px-6 pb-6 pt-4">
                                  <span className="mb-2 block text-2xl leading-none" aria-hidden>
                                    {opt.icon}
                                  </span>
                                  <p className="font-headline text-base text-teal-brand">{opt.displayName}</p>
                                  <p className="font-lato text-sm font-semibold text-charcoal-brand">{priceLine}</p>
                                  <p className="mt-1 font-lato text-xs text-charcoal-brand/60">{blurb}</p>
                                </div>
                              ) : (
                                <>
                                  <span className="mb-2 block text-2xl leading-none" aria-hidden>
                                    {opt.icon}
                                  </span>
                                  <p className="font-headline text-base text-teal-brand">{opt.displayName}</p>
                                  <p className="font-lato text-sm text-charcoal-brand">{priceLine}</p>
                                  <p className="mt-1 font-lato text-xs text-charcoal-brand/60">{blurb}</p>
                                </>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Passenger count */}
                  <div className="flex flex-col items-center text-center">
                    <label className="mb-3 block font-lato text-sm font-semibold text-charcoal-brand">
                      Passengers
                    </label>
                    <div className="flex items-center justify-center gap-5">
                      <button
                        type="button"
                        onClick={() => setPaxCount((c) => Math.max(1, c - 1))}
                        className="inline-flex h-11 min-w-[2.75rem] items-center justify-center rounded-lg bg-gold-brand px-3 text-charcoal-brand shadow-[0_2px_0_rgba(54,55,55,0.12)] transition hover:brightness-[0.97] active:translate-y-px active:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-brand focus-visible:ring-offset-2"
                        aria-label="Decrease passengers"
                      >
                        <Minus size={18} strokeWidth={2.25} />
                      </button>
                      <span className="min-w-[2.5rem] text-center font-headline text-2xl font-bold text-teal-brand tabular-nums">
                        {paxCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPaxCount((c) => Math.min(10, c + 1))}
                        className="inline-flex h-11 min-w-[2.75rem] items-center justify-center rounded-lg bg-gold-brand px-3 text-charcoal-brand shadow-[0_2px_0_rgba(54,55,55,0.12)] transition hover:brightness-[0.97] active:translate-y-px active:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-brand focus-visible:ring-offset-2"
                        aria-label="Increase passengers"
                      >
                        <Plus size={18} strokeWidth={2.25} />
                      </button>
                    </div>
                    {vanSelection?.pricingType === 'per_head' && (
                      <p className="mt-3 max-w-sm font-lato text-xs text-charcoal-brand/60">
                        ₱{vanSelection.unitPrice.toLocaleString()} × {paxCount} passenger{paxCount !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  {/* Continue */}
                  <PrimaryCtaButton
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!route || !vanSelection || routesLoading}
                    className="flex w-full items-center justify-center gap-2 py-3.5 font-bold"
                  >
                    Continue to Your Details →
                  </PrimaryCtaButton>
                </>
              )}
            </div>
          </FadeUpSection>
        )}

        {step === 2 && vanSelection && (
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
                  <Row label="Transport" value={vanTypeLabel(vanSelection.vanType)} />
                  <Row label="Passengers" value={String(paxCount)} />
                  <div className="border-t border-charcoal-brand/10 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-charcoal-brand">Total</span>
                      <span className="font-headline text-xl font-bold text-teal-brand">
                        ₱{calcTotal(vanSelection, paxCount).toLocaleString()}
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
