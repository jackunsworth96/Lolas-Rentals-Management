import { useState, useRef, useCallback } from 'react';
import { Modal } from '../common/Modal.js';
import { useCreateAccident, uploadAccidentPhoto } from '../../api/accidents.js';
import type { CreateAccidentBody } from '../../api/accidents.js';
import { useEnrichedOrders } from '../../api/orders.js';
import type { EnrichedOrder } from '../../types/api.js';
import { useUIStore } from '../../stores/ui-store.js';

interface AccidentReportModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill from an order (e.g. clicked from Active Orders). */
  prefillOrder?: {
    orderId: string;
    orderReference: string;
    vehicleId: string;
    vehicleName: string;
    customerId: string | null;
    customerName: string;
    peaceOfMindActive: boolean;
  };
  onSuccess?: () => void;
}

type Step = 1 | 2 | 3 | 4;

interface FormState {
  // Step 1
  orderId: string;
  orderReference: string;
  vehicleId: string;
  vehicleName: string;
  customerId: string | null;
  customerName: string;
  peaceOfMindActive: boolean | null;
  accidentDate: string;
  accidentTime: string;
  location: string;
  description: string;
  // Step 2
  damageDescription: string;
  customerInjured: boolean;
  injuryDescription: string;
  medicalAttention: boolean;
  emergencyServicesCalled: boolean;
  policeReportFiled: boolean;
  policeReportNumber: string;
  helmetsWorn: string;
  thirdPartyNotes: string;
  // Step 3
  photoUrls: string[];
  customerSignatureUrl: string | null;
  additionalNotes: string;
}

const DEFAULT_FORM: FormState = {
  orderId: '',
  orderReference: '',
  vehicleId: '',
  vehicleName: '',
  customerId: null,
  customerName: '',
  peaceOfMindActive: null,
  accidentDate: new Date().toISOString().slice(0, 10),
  accidentTime: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false }),
  location: '',
  description: '',
  damageDescription: '',
  customerInjured: false,
  injuryDescription: '',
  medicalAttention: false,
  emergencyServicesCalled: false,
  policeReportFiled: false,
  policeReportNumber: '',
  helmetsWorn: '',
  thirdPartyNotes: '',
  photoUrls: [],
  customerSignatureUrl: null,
  additionalNotes: '',
};

function hasPomAddon(order: EnrichedOrder): boolean {
  const addons = (order as unknown as { addons?: Array<{ addonName: string }> }).addons ?? [];
  return addons.some((a) => a.addonName.toLowerCase().includes('peace'));
}

export function AccidentReportModal({ open, onClose, prefillOrder, onSuccess }: AccidentReportModalProps) {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const createAccident = useCreateAccident();
  const { data: allOrders = [] } = useEnrichedOrders(storeId) as { data: EnrichedOrder[] | undefined };

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(() => {
    if (prefillOrder) {
      return {
        ...DEFAULT_FORM,
        orderId: prefillOrder.orderId,
        orderReference: prefillOrder.orderReference,
        vehicleId: prefillOrder.vehicleId,
        vehicleName: prefillOrder.vehicleName,
        customerId: prefillOrder.customerId,
        customerName: prefillOrder.customerName,
        peaceOfMindActive: prefillOrder.peaceOfMindActive,
      };
    }
    return { ...DEFAULT_FORM };
  });
  const [orderSearch, setOrderSearch] = useState(prefillOrder?.orderReference ?? '');
  const [orderDropdownOpen, setOrderDropdownOpen] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Signature pad
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigDrawing = useRef(false);
  const sigLastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasSig, setHasSig] = useState(false);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const filteredOrders = orderSearch.trim().length >= 2
    ? (allOrders as EnrichedOrder[]).filter((o) =>
        (o.bookingToken ?? '').toLowerCase().includes(orderSearch.toLowerCase()) ||
        o.customerName.toLowerCase().includes(orderSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  function selectOrder(o: EnrichedOrder) {
    const pom = hasPomAddon(o);
    // customerId may not be in the EnrichedOrder type but the API often returns it
    const rawCustomerId = (o as unknown as Record<string, unknown>).customerId as string | null | undefined;
    setForm((f) => ({
      ...f,
      orderId: o.id,
      orderReference: o.bookingToken ?? '',
      vehicleId: o.primaryVehicleId ?? '',
      vehicleName: o.primaryVehicleName ?? o.vehicleNames ?? '',
      customerId: rawCustomerId ?? null,
      customerName: o.customerName,
      peaceOfMindActive: pom,
    }));
    setOrderSearch(o.bookingToken ?? o.customerName);
    setOrderDropdownOpen(false);
  }

  function validateStep(s: Step): string | null {
    if (s === 1) {
      if (!form.orderId) return 'Please select an order.';
      if (!form.vehicleId) return 'The selected order has no vehicle assigned.';
      if (!form.description.trim()) return 'Please describe how the accident happened.';
    }
    return null;
  }

  function nextStep() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => Math.min(s + 1, 4) as Step);
  }

  function prevStep() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1) as Step);
  }

  async function handlePhotoFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingPhotos(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadAccidentPhoto(file);
        urls.push(url);
      }
      setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, ...urls] }));
    } catch {
      setError('Photo upload failed. Please try again.');
    } finally {
      setUploadingPhotos(false);
    }
  }

  function removePhoto(url: string) {
    setForm((f) => ({ ...f, photoUrls: f.photoUrls.filter((u) => u !== url) }));
  }

  // Signature pad handlers
  function getSigPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = sigCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function onSigPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    sigDrawing.current = true;
    sigLastPos.current = getSigPos(e);
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function onSigPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!sigDrawing.current || !sigLastPos.current) return;
    const canvas = sigCanvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getSigPos(e);
    ctx.beginPath();
    ctx.moveTo(sigLastPos.current.x, sigLastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    sigLastPos.current = pos;
    setHasSig(true);
  }

  function onSigPointerUp() {
    sigDrawing.current = false;
    sigLastPos.current = null;
  }

  function clearSig() {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    setForm((f) => ({ ...f, customerSignatureUrl: null }));
  }

  function captureSig() {
    const canvas = sigCanvasRef.current;
    if (!canvas || !hasSig) return;
    setForm((f) => ({ ...f, customerSignatureUrl: canvas.toDataURL('image/png') }));
  }

  async function handleSubmit() {
    // Capture signature if drawn but not yet captured
    if (hasSig && !form.customerSignatureUrl) {
      captureSig();
    }
    setError(null);
    setSubmitting(true);
    try {
      // Convert local datetime to UTC ISO so Postgres stores it correctly.
      // new Date("YYYY-MM-DDTHH:MM:SS") parses as local time in JS.
      const accidentAt = new Date(`${form.accidentDate}T${form.accidentTime}:00`).toISOString();
      const body: CreateAccidentBody = {
        storeId,
        orderId: form.orderId,
        vehicleId: form.vehicleId,
        customerId: form.customerId,
        accidentAt,
        location: form.location || null,
        description: form.description,
        damageDescription: form.damageDescription || null,
        customerInjured: form.customerInjured,
        injuryDescription: form.injuryDescription || null,
        medicalAttention: form.medicalAttention,
        emergencyServicesCalled: form.emergencyServicesCalled,
        policeReportFiled: form.policeReportFiled,
        policeReportNumber: form.policeReportNumber || null,
        helmetsWorn: form.helmetsWorn || null,
        thirdPartyNotes: form.thirdPartyNotes || null,
        peaceOfMindActive: form.peaceOfMindActive,
        photoUrls: form.photoUrls,
        customerSignatureUrl: hasSig ? sigCanvasRef.current?.toDataURL('image/png') ?? null : null,
        additionalNotes: form.additionalNotes || null,
      };
      await createAccident.mutateAsync(body);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError((err as Error).message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setStep(1);
    setForm({ ...DEFAULT_FORM });
    setOrderSearch(prefillOrder?.orderReference ?? '');
    setError(null);
    setHasSig(false);
    onClose();
  }

  if (!open) return null;

  return (
    <Modal open onClose={handleClose} title="Report Accident" size="xl">
      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div key={s} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step === s ? 'bg-red-600 text-white' :
                step > s ? 'bg-green-500 text-white' :
                'bg-gray-100 text-gray-400'
              }`}
            >
              {step > s ? '✓' : s}
            </div>
            <span className={`text-[10px] font-medium ${step === s ? 'text-red-600' : 'text-gray-400'}`}>
              {s === 1 ? 'Incident' : s === 2 ? 'Welfare' : s === 3 ? 'Evidence' : 'Review'}
            </span>
          </div>
        ))}
      </div>

      {/* ─── Step 1: Incident Details ─── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Order Reference <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => {
                  setOrderSearch(e.target.value);
                  setOrderDropdownOpen(true);
                  if (!e.target.value) {
                    setForm((f) => ({ ...f, orderId: '', vehicleId: '', vehicleName: '', customerId: null, customerName: '', peaceOfMindActive: null }));
                  }
                }}
                onFocus={() => setOrderDropdownOpen(true)}
                onBlur={() => setTimeout(() => setOrderDropdownOpen(false), 150)}
                placeholder="Type order ref or customer name..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              />
              {orderDropdownOpen && filteredOrders.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                  {filteredOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onMouseDown={() => selectOrder(o)}
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <span className="text-sm font-semibold text-gray-900">{o.bookingToken}</span>
                      <span className="text-xs text-gray-500">{o.customerName} · {o.vehicleNames}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {form.orderId && (
              <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                <span className="font-medium text-gray-700">Vehicle:</span> <span className="text-gray-900">{form.vehicleName || '—'}</span>
                {' · '}
                <span className="font-medium text-gray-700">Customer:</span> <span className="text-gray-900">{form.customerName || '—'}</span>
                {' · '}
                <span className={`font-medium ${form.peaceOfMindActive ? 'text-green-600' : 'text-gray-500'}`}>
                  {form.peaceOfMindActive ? '✅ Peace of Mind' : 'No POM cover'}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Date of Accident <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.accidentDate}
                onChange={(e) => set('accidentDate', e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Time <span className="text-xs font-normal text-gray-400">(24-hr, e.g. 00:30)</span>
              </label>
              <input
                type="time"
                value={form.accidentTime}
                onChange={(e) => set('accidentTime', e.target.value)}
                step="60"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="e.g. Cloud 9 road, near the bridge"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              How did the accident happen? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="Describe what happened in as much detail as possible..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
        </div>
      )}

      {/* ─── Step 2: Damage & Welfare ─── */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Vehicle Damage Description</label>
            <textarea
              value={form.damageDescription}
              onChange={(e) => set('damageDescription', e.target.value)}
              rows={3}
              placeholder="Describe the vehicle damage..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-800">Customer Welfare</p>
            <div className="space-y-3">
              <Toggle
                label="Customer was injured"
                checked={form.customerInjured}
                onChange={(v) => set('customerInjured', v)}
                activeColor="red"
              />
              {form.customerInjured && (
                <div className="ml-6 space-y-2">
                  <textarea
                    value={form.injuryDescription}
                    onChange={(e) => set('injuryDescription', e.target.value)}
                    rows={2}
                    placeholder="Describe the injuries..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <Toggle
                    label="Medical attention was sought"
                    checked={form.medicalAttention}
                    onChange={(v) => set('medicalAttention', v)}
                    activeColor="amber"
                  />
                  <Toggle
                    label="Emergency services called (ambulance / police)"
                    checked={form.emergencyServicesCalled}
                    onChange={(v) => set('emergencyServicesCalled', v)}
                    activeColor="red"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-800">Police Report</p>
            <Toggle
              label="Police report was filed"
              checked={form.policeReportFiled}
              onChange={(v) => set('policeReportFiled', v)}
              activeColor="blue"
            />
            {form.policeReportFiled && (
              <div className="mt-2 ml-6">
                <input
                  type="text"
                  value={form.policeReportNumber}
                  onChange={(e) => set('policeReportNumber', e.target.value)}
                  placeholder="Police report reference number (if known)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Helmets at time of accident
            </label>
            <input
              type="text"
              value={form.helmetsWorn}
              onChange={(e) => set('helmetsWorn', e.target.value)}
              placeholder="e.g. Both riders wearing helmets / No helmet worn"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Third-party notes</label>
            <textarea
              value={form.thirdPartyNotes}
              onChange={(e) => set('thirdPartyNotes', e.target.value)}
              rows={2}
              placeholder="Name, contact, vehicle plate of any other parties involved..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
        </div>
      )}

      {/* ─── Step 3: Evidence ─── */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Photos (optional)</label>
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
              <input
                type="file"
                accept="image/*"
                multiple
                id="accident-photos"
                className="hidden"
                onChange={(e) => handlePhotoFiles(e.target.files)}
              />
              <label htmlFor="accident-photos" className="cursor-pointer">
                <div className="text-sm text-gray-500">
                  {uploadingPhotos ? (
                    <span className="text-blue-600">Uploading...</span>
                  ) : (
                    <>
                      <span className="font-medium text-red-600 hover:text-red-700">Click to upload photos</span>
                      <span className="text-gray-400"> · max 10 MB each</span>
                    </>
                  )}
                </div>
              </label>
            </div>
            {form.photoUrls.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {form.photoUrls.map((url, i) => (
                  <div key={i} className="relative group rounded overflow-hidden border border-gray-200">
                    <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(url)}
                      className="absolute right-1 top-1 hidden rounded-full bg-red-600 p-0.5 text-white group-hover:flex"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Customer signature <span className="text-gray-400 text-xs font-normal">(optional)</span>
            </label>
            <div className="rounded-lg border border-gray-200 bg-gray-50">
              <canvas
                ref={sigCanvasRef}
                width={560}
                height={140}
                className="block w-full cursor-crosshair touch-none rounded-t-lg bg-white"
                onPointerDown={onSigPointerDown}
                onPointerMove={onSigPointerMove}
                onPointerUp={onSigPointerUp}
              />
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-gray-400">Draw signature above</span>
                {hasSig && (
                  <button
                    type="button"
                    onClick={clearSig}
                    className="text-xs text-gray-500 underline hover:text-gray-700"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Additional notes</label>
            <textarea
              value={form.additionalNotes}
              onChange={(e) => set('additionalNotes', e.target.value)}
              rows={3}
              placeholder="Any other relevant information..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
        </div>
      )}

      {/* ─── Step 4: Review & Submit ─── */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm font-semibold text-red-800">
              ⚠️ Once submitted, this report cannot be edited.
            </p>
            <p className="mt-1 text-xs text-red-600">
              A tamper-evident email will be sent immediately upon submission.
            </p>
          </div>

          <ReviewSection title="Incident">
            <ReviewRow label="Order" value={form.orderReference} />
            <ReviewRow label="Vehicle" value={form.vehicleName} />
            <ReviewRow label="Customer" value={form.customerName} />
            <ReviewRow label="Peace of Mind" value={form.peaceOfMindActive === true ? '✅ Active' : form.peaceOfMindActive === false ? 'Not purchased' : '—'} />
            <ReviewRow label="Date &amp; Time" value={`${form.accidentDate} ${form.accidentTime}`} />
            <ReviewRow label="Location" value={form.location || '—'} />
            <ReviewRow label="Description" value={form.description} multiline />
          </ReviewSection>

          <ReviewSection title="Vehicle Damage &amp; Welfare">
            <ReviewRow label="Damage" value={form.damageDescription || '—'} multiline />
            <ReviewRow label="Customer injured" value={form.customerInjured ? `Yes${form.injuryDescription ? ` — ${form.injuryDescription}` : ''}` : 'No'} />
            <ReviewRow label="Medical attention" value={form.medicalAttention ? 'Yes' : 'No'} />
            <ReviewRow label="Emergency services" value={form.emergencyServicesCalled ? 'Called' : 'Not called'} />
            <ReviewRow label="Police report" value={form.policeReportFiled ? `Filed${form.policeReportNumber ? ` — ${form.policeReportNumber}` : ''}` : 'Not filed'} />
            <ReviewRow label="Helmets" value={form.helmetsWorn || '—'} />
            <ReviewRow label="Third party" value={form.thirdPartyNotes || '—'} multiline />
          </ReviewSection>

          <ReviewSection title="Evidence">
            <ReviewRow label="Photos" value={form.photoUrls.length > 0 ? `${form.photoUrls.length} uploaded` : 'None'} />
            <ReviewRow label="Customer signature" value={hasSig || form.customerSignatureUrl ? 'Captured' : 'Not captured'} />
            <ReviewRow label="Additional notes" value={form.additionalNotes || '—'} multiline />
          </ReviewSection>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex justify-between border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={step === 1 ? handleClose : prevStep}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {step === 1 ? 'Cancel' : '← Back'}
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={nextStep}
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        )}
      </div>
    </Modal>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  activeColor = 'teal',
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  activeColor?: 'teal' | 'red' | 'amber' | 'blue';
}) {
  const activeClass = {
    teal: 'bg-teal-600',
    red: 'bg-red-600',
    amber: 'bg-amber-500',
    blue: 'bg-blue-600',
  }[activeColor];

  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-sm text-gray-700"
    >
      <div className={`relative h-5 w-9 rounded-full transition-colors ${checked ? activeClass : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      {label}
    </button>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      </div>
      <div className="divide-y divide-gray-100 px-4">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={`py-2 ${multiline ? 'flex flex-col gap-0.5' : 'flex items-start justify-between gap-4'}`}>
      <span className="shrink-0 text-xs text-gray-500" dangerouslySetInnerHTML={{ __html: label }} />
      <span className={`text-sm text-gray-900 ${multiline ? '' : 'text-right'}`}>{value}</span>
    </div>
  );
}
