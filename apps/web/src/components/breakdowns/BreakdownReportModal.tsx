import { useState, useRef, useCallback } from 'react';
import { Modal } from '../common/Modal.js';
import { useCreateBreakdown, uploadBreakdownPhoto, ISSUE_TYPE_LABELS, RESOLUTION_TYPE_LABELS } from '../../api/breakdowns.js';
import type { CreateBreakdownBody, BreakdownIssueType, BreakdownResolutionType } from '../../api/breakdowns.js';
import { useEnrichedOrders } from '../../api/orders.js';
import type { EnrichedOrder } from '../../types/api.js';
import { useUIStore } from '../../stores/ui-store.js';

interface BreakdownReportModalProps {
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
  };
  onSuccess?: () => void;
}

type Step = 1 | 2 | 3;

const ISSUE_TYPES: BreakdownIssueType[] = ['flat_tyre', 'flat_battery', 'engine_mechanical', 'electrical', 'user_error', 'other'];
const RESOLUTION_TYPES: BreakdownResolutionType[] = ['roadside_fix', 'vehicle_swap', 'towed', 'customer_continued', 'other'];

interface FormState {
  // Step 1
  orderId: string;
  orderReference: string;
  vehicleId: string;
  vehicleName: string;
  customerId: string | null;
  customerName: string;
  breakdownDate: string;
  breakdownTime: string;
  location: string;
  issueType: BreakdownIssueType | null;
  issueDetail: string;
  description: string;
  // Step 2
  photoUrls: string[];
  additionalNotes: string;
  // Step 3 — resolution (optional at creation time)
  alreadyResolved: boolean;
  resolutionType: BreakdownResolutionType | null;
  resolutionNotes: string;
  resolvedDate: string;
  resolvedTime: string;
}

function nowDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function nowTime(): string {
  return new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const DEFAULT_FORM: FormState = {
  orderId: '',
  orderReference: '',
  vehicleId: '',
  vehicleName: '',
  customerId: null,
  customerName: '',
  breakdownDate: nowDate(),
  breakdownTime: nowTime(),
  location: '',
  issueType: null,
  issueDetail: '',
  description: '',
  photoUrls: [],
  additionalNotes: '',
  alreadyResolved: false,
  resolutionType: null,
  resolutionNotes: '',
  resolvedDate: nowDate(),
  resolvedTime: nowTime(),
};

export function BreakdownReportModal({ open, onClose, prefillOrder, onSuccess }: BreakdownReportModalProps) {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const createBreakdown = useCreateBreakdown();
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
      };
    }
    return { ...DEFAULT_FORM };
  });
  const [orderSearch, setOrderSearch] = useState(prefillOrder?.orderReference ?? '');
  const [orderDropdownOpen, setOrderDropdownOpen] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const rawCustomerId = (o as unknown as Record<string, unknown>).customerId as string | null | undefined;
    setForm((f) => ({
      ...f,
      orderId: o.id,
      orderReference: o.bookingToken ?? '',
      vehicleId: o.primaryVehicleId ?? '',
      vehicleName: o.primaryVehicleName ?? o.vehicleNames ?? '',
      customerId: rawCustomerId ?? null,
      customerName: o.customerName,
    }));
    setOrderSearch(o.bookingToken ?? o.customerName);
    setOrderDropdownOpen(false);
  }

  function validateStep(s: Step): string | null {
    if (s === 1) {
      if (!form.orderId) return 'Please select an order.';
      if (!form.vehicleId) return 'The selected order has no vehicle assigned.';
      if (!form.issueType) return 'Please select the type of issue.';
      if (form.issueType === 'other' && !form.issueDetail.trim()) return 'Please describe the issue.';
      if (!form.description.trim()) return 'Please describe what happened.';
    }
    if (s === 3 && form.alreadyResolved) {
      if (!form.resolutionType) return 'Please select how it was resolved.';
    }
    return null;
  }

  function nextStep() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => Math.min(s + 1, 3) as Step);
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
        const url = await uploadBreakdownPhoto(file);
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

  async function handleSubmit() {
    const err = validateStep(3);
    if (err) { setError(err); return; }
    setError(null);
    setSubmitting(true);
    try {
      // Convert local datetime to UTC ISO so Postgres stores it correctly.
      const breakdownAt = new Date(`${form.breakdownDate}T${form.breakdownTime}:00`).toISOString();
      const resolvedAt = form.alreadyResolved
        ? new Date(`${form.resolvedDate}T${form.resolvedTime}:00`).toISOString()
        : null;

      const body: CreateBreakdownBody = {
        storeId,
        orderId: form.orderId,
        vehicleId: form.vehicleId,
        customerId: form.customerId,
        breakdownAt,
        location: form.location || null,
        issueType: form.issueType as BreakdownIssueType,
        issueDetail: form.issueDetail || null,
        description: form.description,
        photoUrls: form.photoUrls,
        additionalNotes: form.additionalNotes || null,
        resolved: form.alreadyResolved,
        resolutionType: form.alreadyResolved ? form.resolutionType : null,
        resolutionNotes: form.alreadyResolved ? (form.resolutionNotes || null) : null,
        resolvedAt,
      };
      await createBreakdown.mutateAsync(body);
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
    onClose();
  }

  if (!open) return null;

  return (
    <Modal open onClose={handleClose} title="Report Breakdown" size="xl">
      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step === s ? 'bg-amber-600 text-white' :
                step > s ? 'bg-green-500 text-white' :
                'bg-gray-100 text-gray-400'
              }`}
            >
              {step > s ? '✓' : s}
            </div>
            <span className={`text-[10px] font-medium ${step === s ? 'text-amber-600' : 'text-gray-400'}`}>
              {s === 1 ? 'Issue' : s === 2 ? 'Evidence' : 'Resolution'}
            </span>
          </div>
        ))}
      </div>

      {/* ─── Step 1: Issue Details ─── */}
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
                    setForm((f) => ({ ...f, orderId: '', vehicleId: '', vehicleName: '', customerId: null, customerName: '' }));
                  }
                }}
                onFocus={() => setOrderDropdownOpen(true)}
                onBlur={() => setTimeout(() => setOrderDropdownOpen(false), 150)}
                placeholder="Type order ref or customer name..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
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
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Date of Breakdown <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.breakdownDate}
                onChange={(e) => set('breakdownDate', e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Time <span className="text-xs font-normal text-gray-400">(24-hr)</span>
              </label>
              <input
                type="time"
                value={form.breakdownTime}
                onChange={(e) => set('breakdownTime', e.target.value)}
                step="60"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Type of issue <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ISSUE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('issueType', t)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    form.issueType === t
                      ? t === 'user_error'
                        ? 'border-gray-500 bg-gray-100 text-gray-800'
                        : 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {ISSUE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            {form.issueType === 'user_error' && (
              <p className="mt-2 text-xs text-gray-500">
                Vehicle was actually fine — e.g. kickstand left down, kill switch, or similar customer mistake.
                These are logged but do not count as a real issue in quarterly stats.
              </p>
            )}
            {form.issueType === 'other' && (
              <input
                type="text"
                value={form.issueDetail}
                onChange={(e) => set('issueDetail', e.target.value)}
                placeholder="Briefly describe the issue type..."
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              What happened? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="Describe the breakdown and how it was discovered/reported..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
        </div>
      )}

      {/* ─── Step 2: Evidence ─── */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Photos (optional)</label>
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                id="breakdown-photos"
                className="hidden"
                onChange={(e) => handlePhotoFiles(e.target.files)}
              />
              <label htmlFor="breakdown-photos" className="cursor-pointer">
                <div className="text-sm text-gray-500">
                  {uploadingPhotos ? (
                    <span className="text-blue-600">Uploading...</span>
                  ) : (
                    <>
                      <span className="font-medium text-amber-600 hover:text-amber-700">Click to upload photos</span>
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
            <label className="mb-1 block text-sm font-medium text-gray-700">Additional notes</label>
            <textarea
              value={form.additionalNotes}
              onChange={(e) => set('additionalNotes', e.target.value)}
              rows={3}
              placeholder="Any other relevant information..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
        </div>
      )}

      {/* ─── Step 3: Resolution & Review ─── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <button
              type="button"
              onClick={() => set('alreadyResolved', !form.alreadyResolved)}
              className="flex items-center gap-3 text-sm font-medium text-gray-700"
            >
              <div className={`relative h-5 w-9 rounded-full transition-colors ${form.alreadyResolved ? 'bg-green-600' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.alreadyResolved ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              This has already been resolved
            </button>

            {form.alreadyResolved && (
              <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    How was it resolved? <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {RESOLUTION_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set('resolutionType', t)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                          form.resolutionType === t
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {RESOLUTION_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Resolved date</label>
                    <input
                      type="date"
                      value={form.resolvedDate}
                      onChange={(e) => set('resolvedDate', e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Resolved time</label>
                    <input
                      type="time"
                      value={form.resolvedTime}
                      onChange={(e) => set('resolvedTime', e.target.value)}
                      step="60"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Resolution notes</label>
                  <textarea
                    value={form.resolutionNotes}
                    onChange={(e) => set('resolutionNotes', e.target.value)}
                    rows={2}
                    placeholder="Any further detail on how it was fixed..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                  />
                </div>
              </div>
            )}

            {!form.alreadyResolved && (
              <p className="mt-2 text-xs text-gray-400">
                This report will be logged as <span className="font-medium text-amber-600">Open</span> — you can mark it resolved later from the report detail view.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Review</p>
            </div>
            <div className="divide-y divide-gray-100 px-4">
              <ReviewRow label="Order" value={form.orderReference} />
              <ReviewRow label="Vehicle" value={form.vehicleName} />
              <ReviewRow label="Customer" value={form.customerName} />
              <ReviewRow label="Date &amp; Time" value={`${form.breakdownDate} ${form.breakdownTime}`} />
              <ReviewRow label="Issue" value={form.issueType ? `${ISSUE_TYPE_LABELS[form.issueType]}${form.issueDetail ? ` — ${form.issueDetail}` : ''}` : '—'} />
              <ReviewRow label="Description" value={form.description} multiline />
              <ReviewRow label="Photos" value={form.photoUrls.length > 0 ? `${form.photoUrls.length} uploaded` : 'None'} />
              <ReviewRow
                label="Status"
                value={form.alreadyResolved && form.resolutionType ? `Resolved — ${RESOLUTION_TYPE_LABELS[form.resolutionType]}` : 'Open'}
              />
            </div>
          </div>
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
        {step < 3 ? (
          <button
            type="button"
            onClick={nextStep}
            className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        )}
      </div>
    </Modal>
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
