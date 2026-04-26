import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Search, CheckCircle, ClipboardList, FileSignature, ArrowLeft, User } from 'lucide-react';
import { api } from '../../api/client.js';
import { useStores } from '../../api/config.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { InspectionModal } from './InspectionModal.js';
import type { CustomerSummary } from '../../api/customers.js';

interface CheckInModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'lookup' | 'actions' | 'waiver';

// ── Signature canvas hook (shared between waiver and inspection) ───────────

function useSignatureCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasSig, setHasSig] = useState(false);

  const getPos = useCallback(
    (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e) {
        const t = e.touches[0];
        if (!t) return null;
        return { x: t.clientX - rect.left, y: t.clientY - rect.top };
      }
      return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
    },
    [],
  );

  const initCanvas = useCallback(() => {
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width } = canvas.getBoundingClientRect();
      canvas.width = Math.max(width, 300);
      canvas.height = 160;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function start(e: MouseEvent | TouchEvent) {
      const pos = getPos(e);
      if (!pos) return;
      isDrawingRef.current = true;
      ctx!.beginPath();
      ctx!.moveTo(pos.x, pos.y);
      e.preventDefault();
    }

    function draw(e: MouseEvent | TouchEvent) {
      if (!isDrawingRef.current) return;
      const pos = getPos(e);
      if (!pos) return;
      ctx!.lineWidth = 2;
      ctx!.lineCap = 'round';
      ctx!.strokeStyle = '#1a1a1a';
      ctx!.lineTo(pos.x, pos.y);
      ctx!.stroke();
      setHasSig(true);
      e.preventDefault();
    }

    function stop() {
      isDrawingRef.current = false;
    }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseleave', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stop);

    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stop);
      canvas.removeEventListener('mouseleave', stop);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stop);
    };
  }, [getPos]);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  function getDataUrl(): string | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  }

  return { canvasRef, hasSig, initCanvas, clear, getDataUrl };
}

// ── Main component ─────────────────────────────────────────────────────────

export function CheckInModal({ open, onClose }: CheckInModalProps) {
  const queryClient = useQueryClient();
  const { data: stores = [] } = useStores();
  const storeList = stores as Array<{ id: string; name: string }>;
  const selectedStoreId = useUIStore((s) => s.selectedStoreId) ?? '';
  const authUser = useAuthStore((s) => s.user);

  const [step, setStep] = useState<Step>('lookup');
  const [storeId, setStoreId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // Waiver form state
  const [driverName, setDriverName] = useState('');
  const [driverEmail, setDriverEmail] = useState('');
  const [driverMobile, setDriverMobile] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [waiverSubmitting, setWaiverSubmitting] = useState(false);
  const [waiverError, setWaiverError] = useState('');
  const [waiverDone, setWaiverDone] = useState(false);

  // Inspection modal
  const [showInspection, setShowInspection] = useState(false);
  const [inspectionDone, setInspectionDone] = useState(false);

  const sig = useSignatureCanvas();

  const dialogRef = useRef<HTMLDialogElement>(null);

  // Pre-fill store from UI store
  useEffect(() => {
    if (selectedStoreId) setStoreId(selectedStoreId);
    else if (storeList.length === 1) setStoreId(storeList[0]!.id);
  }, [selectedStoreId, storeList]);

  // Open/close the dialog
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep('lookup');
    setEmail('');
    setName('');
    setMobile('');
    setCustomer(null);
    setIsNew(false);
    setLookupError('');
    setWaiverDone(false);
    setInspectionDone(false);
    setShowInspection(false);
  }, [open]);

  // Pre-fill waiver form when customer is loaded
  useEffect(() => {
    if (customer) {
      setDriverName(customer.name);
      setDriverEmail(customer.email ?? '');
      setDriverMobile(customer.mobile ?? '');
    }
  }, [customer]);

  // Init signature canvas when entering waiver step
  useEffect(() => {
    if (step === 'waiver') {
      setAgreedToTerms(false);
      setWaiverError('');
      setWaiverDone(false);
      sig.clear();
      sig.initCanvas();
    }
  }, [step]);

  async function handleLookup() {
    if (!email.trim() || !storeId) return;
    setLookupError('');
    setLooking(true);
    try {
      const data = await api.post<{ customer: CustomerSummary; isNew: boolean }>(
        '/customers/lookup-or-create',
        { email: email.trim(), name: name.trim() || email.trim(), mobile: mobile.trim() || undefined, storeId },
      );
      setCustomer(data.customer);
      setIsNew(data.isNew);
      setStep('actions');
    } catch (err) {
      setLookupError((err as Error).message ?? 'Lookup failed');
    } finally {
      setLooking(false);
    }
  }

  async function handleWaiverSubmit() {
    if (!customer || !agreedToTerms) return;
    const sigDataUrl = sig.getDataUrl();
    if (!sig.hasSig || !sigDataUrl) {
      setWaiverError('Please sign the waiver before submitting.');
      return;
    }
    setWaiverError('');
    setWaiverSubmitting(true);
    try {
      await api.post('/waiver/checkin', {
        customerId: customer.id,
        storeId,
        driverName: driverName.trim(),
        driverEmail: driverEmail.trim() || undefined,
        driverMobile: driverMobile.trim() || undefined,
        agreedToTerms: true,
        driverSignatureDataUrl: sigDataUrl,
      });
      void queryClient.invalidateQueries({ queryKey: ['customer-pending-checkin', customer.id] });
      setWaiverDone(true);
    } catch (err) {
      setWaiverError((err as Error).message ?? 'Submission failed');
    } finally {
      setWaiverSubmitting(false);
    }
  }

  function handleInspectionComplete() {
    setInspectionDone(true);
    void queryClient.invalidateQueries({ queryKey: ['customer-pending-checkin', customer?.id] });
  }

  const employeeName = authUser?.username ?? 'Staff';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={() => {
          if (!showInspection) onClose();
        }}
        className="m-0 box-border h-full max-h-[100dvh] w-full max-w-none border-0 bg-cream-brand p-0 text-inherit overflow-y-auto backdrop:bg-black/40 sm:m-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl"
      >
        {/* Header */}
        <header className="sticky top-0 bg-cream-brand border-b border-charcoal-brand/10 z-10">
          <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
            <div className="flex items-center gap-2">
              {step !== 'lookup' && (
                <button
                  type="button"
                  onClick={() => setStep(step === 'waiver' ? 'actions' : 'lookup')}
                  className="rounded-lg p-1.5 text-charcoal-brand/60 hover:bg-charcoal-brand/10 transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <h2 className="text-base font-semibold text-charcoal-brand">
                {step === 'lookup' && 'Quick Check-In'}
                {step === 'actions' && 'Check-In Actions'}
                {step === 'waiver' && 'Capture Waiver'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-charcoal-brand/60 hover:bg-charcoal-brand/10 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">

          {/* ── Step: Lookup ─────────────────────────────────────────── */}
          {step === 'lookup' && (
            <div className="space-y-5">
              <p className="text-sm text-charcoal-brand/70">
                Enter the customer's email to find or create their profile, then capture
                the waiver and inspection before adding the booking.
              </p>

              <div className="space-y-3">
                {/* Store */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-charcoal-brand/60">Store</label>
                  <select
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="w-full rounded-xl border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand"
                  >
                    <option value="">Select store…</option>
                    {storeList.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-charcoal-brand/60">Customer Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                    placeholder="customer@email.com"
                    className="w-full rounded-xl border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand"
                  />
                </div>

                {/* Name (shown when email filled to help with new customers) */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-charcoal-brand/60">
                    Customer Name <span className="text-charcoal-brand/40">(for new customers)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-xl border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand"
                  />
                </div>

                {/* Mobile */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-charcoal-brand/60">
                    Mobile <span className="text-charcoal-brand/40">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+63 900 000 0000"
                    className="w-full rounded-xl border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand"
                  />
                </div>
              </div>

              {lookupError && (
                <p className="text-sm text-red-600">{lookupError}</p>
              )}

              <button
                type="button"
                onClick={handleLookup}
                disabled={!email.trim() || !storeId || looking}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-brand/90 disabled:opacity-50"
              >
                <Search className="h-4 w-4" />
                {looking ? 'Looking up…' : 'Find Customer'}
              </button>
            </div>
          )}

          {/* ── Step: Actions ────────────────────────────────────────── */}
          {step === 'actions' && customer && (
            <div className="space-y-5">
              {/* Customer card */}
              <div className="rounded-xl border border-charcoal-brand/10 bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-brand/10">
                    <User className="h-5 w-5 text-teal-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-charcoal-brand">{customer.name}</p>
                    <p className="truncate text-xs text-charcoal-brand/60">{customer.email ?? '—'}</p>
                  </div>
                  {isNew ? (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      New
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                      Returning
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sm text-charcoal-brand/70">
                Choose what to capture for this customer. The booking can be added later —
                both records will auto-link when it is processed.
              </p>

              {/* Action buttons */}
              <div className="space-y-3">
                {/* Inspection */}
                <button
                  type="button"
                  onClick={() => setShowInspection(true)}
                  className="flex w-full items-center gap-4 rounded-xl border border-charcoal-brand/10 bg-white p-4 text-left transition-colors hover:border-teal-brand/40 hover:bg-teal-brand/5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                    <ClipboardList className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal-brand">Vehicle Inspection</p>
                    <p className="text-xs text-charcoal-brand/60">Record vehicle condition and KM reading</p>
                  </div>
                  {inspectionDone && <CheckCircle className="ml-auto h-5 w-5 shrink-0 text-teal-brand" />}
                </button>

                {/* Waiver */}
                <button
                  type="button"
                  onClick={() => setStep('waiver')}
                  className="flex w-full items-center gap-4 rounded-xl border border-charcoal-brand/10 bg-white p-4 text-left transition-colors hover:border-teal-brand/40 hover:bg-teal-brand/5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100">
                    <FileSignature className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal-brand">Rental Waiver</p>
                    <p className="text-xs text-charcoal-brand/60">Capture customer signature and agreement</p>
                  </div>
                  {waiverDone && <CheckCircle className="ml-auto h-5 w-5 shrink-0 text-teal-brand" />}
                </button>
              </div>

              {(inspectionDone || waiverDone) && (
                <div className="rounded-xl border border-teal-brand/20 bg-teal-brand/5 px-4 py-3 text-sm text-teal-brand">
                  Saved to customer profile. These will automatically link to the booking
                  when it is processed.
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-charcoal-brand/20 py-2.5 text-sm font-medium text-charcoal-brand/70 hover:bg-charcoal-brand/5"
              >
                Done
              </button>
            </div>
          )}

          {/* ── Step: Waiver ─────────────────────────────────────────── */}
          {step === 'waiver' && customer && (
            <div className="space-y-5">
              {waiverDone ? (
                <div className="space-y-4 text-center">
                  <CheckCircle className="mx-auto h-12 w-12 text-teal-brand" />
                  <p className="font-semibold text-charcoal-brand">Waiver Captured</p>
                  <p className="text-sm text-charcoal-brand/70">
                    The signed waiver has been saved to {customer.name}'s profile.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep('actions')}
                    className="rounded-xl bg-teal-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-brand/90"
                  >
                    Back to Actions
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-charcoal-brand/60">Driver Name</label>
                      <input
                        type="text"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        className="w-full rounded-xl border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-charcoal-brand/60">Driver Email</label>
                      <input
                        type="email"
                        value={driverEmail}
                        onChange={(e) => setDriverEmail(e.target.value)}
                        className="w-full rounded-xl border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-charcoal-brand/60">Driver Mobile</label>
                      <input
                        type="tel"
                        value={driverMobile}
                        onChange={(e) => setDriverMobile(e.target.value)}
                        className="w-full rounded-xl border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand"
                      />
                    </div>
                  </div>

                  {/* Terms */}
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-charcoal-brand/10 bg-white p-4">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-teal-brand"
                    />
                    <span className="text-sm text-charcoal-brand">
                      I agree to the rental terms and conditions, including the vehicle use
                      policy, damage liability, and insurance coverage as outlined in the
                      waiver agreement.
                    </span>
                  </label>

                  {/* Signature */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-medium text-charcoal-brand/60">Customer Signature</label>
                      <button
                        type="button"
                        onClick={sig.clear}
                        className="text-xs text-charcoal-brand/50 hover:text-charcoal-brand"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="overflow-hidden rounded-xl border-2 border-dashed border-charcoal-brand/20 bg-white">
                      <canvas
                        ref={sig.canvasRef}
                        className="block h-40 w-full touch-none"
                      />
                    </div>
                    {!sig.hasSig && (
                      <p className="mt-1 text-center text-xs text-charcoal-brand/40">
                        Sign above
                      </p>
                    )}
                  </div>

                  {waiverError && (
                    <p className="text-sm text-red-600">{waiverError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleWaiverSubmit}
                    disabled={!agreedToTerms || !sig.hasSig || waiverSubmitting || !driverName.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-brand/90 disabled:opacity-50"
                  >
                    {waiverSubmitting ? 'Saving…' : 'Submit Waiver'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </dialog>

      {/* Inspection modal — opens on top of the check-in dialog */}
      {customer && (
        <InspectionModal
          open={showInspection}
          onClose={() => setShowInspection(false)}
          customerId={customer.id}
          storeId={storeId}
          employeeName={employeeName}
          onComplete={handleInspectionComplete}
        />
      )}
    </>
  );
}
