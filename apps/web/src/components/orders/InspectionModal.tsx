import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../api/client.js';
import type { AvailableVehicle } from '../../api/fleet.js';
import type { InspectionItem } from '../../api/inspections.js';

interface InspectionResult {
  result: 'accepted' | 'issue_noted' | 'na' | 'declined';
  qty?: number;
  notes?: string;
  logMaintenance?: boolean;
}

interface InspectionModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderReference: string;
  storeId: string;
  employeeName: string;
  onComplete: () => void;
}

const RESULT_BUTTONS: Record<
  InspectionItem['itemType'],
  { value: InspectionResult['result']; label: string; activeClass: string }[]
> = {
  accepted_issue: [
    { value: 'accepted', label: 'Accepted', activeClass: 'bg-teal-brand' },
    { value: 'issue_noted', label: 'Issue Noted', activeClass: 'bg-amber-500' },
  ],
  accepted_issue_qty: [
    { value: 'accepted', label: 'Accepted', activeClass: 'bg-teal-brand' },
    { value: 'issue_noted', label: 'Issue Noted', activeClass: 'bg-amber-500' },
  ],
  accepted_issue_na: [
    { value: 'accepted', label: 'Accepted', activeClass: 'bg-teal-brand' },
    { value: 'issue_noted', label: 'Issue Noted', activeClass: 'bg-amber-500' },
    { value: 'na', label: 'N/A', activeClass: 'bg-gray-400' },
  ],
  accepted_issue_declined: [
    { value: 'accepted', label: 'Accepted', activeClass: 'bg-teal-brand' },
    { value: 'issue_noted', label: 'Issue Noted', activeClass: 'bg-amber-500' },
    { value: 'declined', label: 'Declined', activeClass: 'bg-gray-400' },
  ],
};

export function InspectionModal({
  open,
  onClose,
  orderId,
  orderReference,
  storeId,
  employeeName,
  onComplete,
}: InspectionModalProps) {
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [results, setResults] = useState<Record<string, InspectionResult>>({});
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [kmReading, setKmReading] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [damageLogMaintenance, setDamageLogMaintenance] = useState(false);
  const [helmetNumbers, setHelmetNumbers] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [availableVehicles, setAvailableVehicles] = useState<AvailableVehicle[]>([]);
  const [hasSignature, setHasSignature] = useState(false);
  const [vehicleType, setVehicleType] = useState<'scooter' | 'tuktuk'>('scooter');

  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isClosingRef = useRef(false);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
    } else if (!open && d.open) {
      isClosingRef.current = true;
      d.close();
    }
  }, [open]);

  // Load data and reset state on open
  useEffect(() => {
    if (!open) return;

    setResults({});
    setVehicleId('');
    setVehicleName('');
    setKmReading('');
    setDamageNotes('');
    setDamageLogMaintenance(false);
    setHelmetNumbers('');
    setError('');
    setHasSignature(false);
    setItems([]);
    setAvailableVehicles([]);

    const now = new Date().toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    api
      .get<AvailableVehicle[]>(
        `/fleet/available?storeId=${storeId}&pickupDatetime=${encodeURIComponent(now)}&dropoffDatetime=${encodeURIComponent(future)}`,
      )
      .then((data) => {
        setAvailableVehicles(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => console.error('Vehicles error:', err));

    // Init canvas after layout
    requestAnimationFrame(() => {
      const canvas = signatureCanvasRef.current;
      if (!canvas) return;
      const { width } = canvas.getBoundingClientRect();
      canvas.width = Math.max(width, 300);
      canvas.height = 180;
    });
  }, [open, storeId]);

  useEffect(() => {
    if (!open) return;
    api
      .get<InspectionItem[]>(`/inspections/items?vehicleType=${vehicleType}`)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setItems(list);
        const initial: Record<string, InspectionResult> = {};
        list.forEach((item: InspectionItem) => {
          initial[item.id] = { result: 'accepted' };
        });
        setResults(initial);
      })
      .catch((err: unknown) => console.error('Items error:', err));
  }, [vehicleType, open]);

  // ── Signature drawing ──────────────────────────────────────────────────────

  function getPointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPointerPos(e);
    ctx.strokeStyle = '#363737';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    isDrawingRef.current = true;
    canvas.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPointerPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function handlePointerUp() {
    isDrawingRef.current = false;
    setHasSignature(true);
  }

  const clearSignature = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }, []);

  // ── Result state helpers ───────────────────────────────────────────────────

  function setItemResult(itemId: string, value: InspectionResult['result']) {
    setResults((prev) => {
      const current = prev[itemId] ?? { result: 'accepted' };
      if (value !== 'issue_noted') {
        return { ...prev, [itemId]: { ...current, result: value, notes: undefined, logMaintenance: false } };
      }
      return { ...prev, [itemId]: { ...current, result: value } };
    });
  }

  function updateResult(itemId: string, patch: Partial<InspectionResult>) {
    setResults((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? { result: 'accepted' }), ...patch } }));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setError('');

    if (!vehicleId) {
      setError('Please select a vehicle.');
      return;
    }
    if (!hasSignature) {
      setError('Customer signature is required.');
      return;
    }

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const sigDataUrl = canvas.toDataURL('image/png');

    const resultsArray = items.map((item) => {
      const r = results[item.id] ?? { result: 'accepted' as const };
      return {
        inspectionItemId: item.id,
        itemName: item.name,
        result: r.result,
        qty: r.qty,
        notes: r.notes || undefined,
        logMaintenance: r.logMaintenance ?? false,
      };
    });

    if (damageLogMaintenance && damageNotes.trim()) {
      resultsArray.push({
        inspectionItemId: undefined,
        itemName: 'General damage notes',
        result: 'issue_noted' as const,
        qty: undefined,
        notes: damageNotes.trim(),
        logMaintenance: true,
      });
    }

    setSubmitting(true);
    try {
      await api.post('/inspections', {
        orderId,
        orderReference,
        storeId,
        vehicleId: vehicleId || undefined,
        vehicleName: vehicleName || undefined,
        kmReading: kmReading || undefined,
        damageNotes: damageNotes || undefined,
        helmetNumbers: helmetNumbers || undefined,
        customerSignatureUrl: sigDataUrl,
        results: resultsArray,
      });
      onComplete();
      onClose();
    } catch (err) {
      setError((err as Error).message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        if (!isClosingRef.current) {
          onClose();
        }
        isClosingRef.current = false;
      }}
      className="m-0 box-border h-full max-h-[100dvh] w-full max-w-none border-0 bg-cream-brand p-0 text-inherit overflow-y-auto backdrop:bg-black/40"
    >
      {/* Sticky header */}
      <header className="sticky top-0 bg-cream-brand border-b border-charcoal-brand/10 z-10">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-charcoal-brand/60 hover:bg-charcoal-brand/10 transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h1 className="font-headline text-lg font-semibold text-teal-brand">Vehicle Inspection</h1>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasSignature || submitting}
            className="bg-gold-brand text-charcoal-brand font-lato font-semibold text-sm px-5 py-2 rounded-lg transition-colors hover:bg-gold-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="px-4 py-6 space-y-6 max-w-2xl mx-auto pb-16">

        {/* Section 1 — Booking info */}
        <div className="bg-white rounded-xl border border-charcoal-brand/10 p-4 space-y-1.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-lato text-xs text-charcoal-brand/50 uppercase tracking-wide">Order</p>
              <p className="font-lato font-semibold text-charcoal-brand">{orderReference}</p>
            </div>
            <div className="text-right">
              <p className="font-lato text-xs text-charcoal-brand/50 uppercase tracking-wide">Staff</p>
              <p className="font-lato font-medium text-charcoal-brand">{employeeName}</p>
            </div>
          </div>
          <p className="font-lato text-xs text-charcoal-brand/50">{todayLabel}</p>
        </div>

        {/* Section 2 — Vehicle + KM */}
        <div className="space-y-3">
          <label className="block">
            <span className="font-lato text-sm font-semibold text-charcoal-brand">Select vehicle</span>
            <select
              value={vehicleId}
              onChange={(e) => {
                const v = availableVehicles.find((x) => x.id === e.target.value);
                setVehicleId(e.target.value);
                setVehicleName(v?.name ?? '');
                if (v) {
                  const isTuktuk = v.name.toLowerCase().includes('tuk');
                  const detectedType = isTuktuk ? 'tuktuk' : 'scooter';
                  setVehicleType(detectedType);
                }
              }}
              className="mt-1.5 block w-full rounded-lg border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm font-lato text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand appearance-none"
            >
              <option value="">— Select vehicle —</option>
              {availableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-lato text-sm font-semibold text-charcoal-brand">KM reading</span>
            <input
              type="number"
              min={0}
              value={kmReading}
              onChange={(e) => setKmReading(e.target.value)}
              placeholder="e.g. 12450"
              className="mt-1.5 block w-full rounded-lg border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm font-lato text-charcoal-brand placeholder:text-charcoal-brand/30 focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
            />
          </label>
        </div>

        {/* Section 3 — Checklist */}
        <div className="space-y-3">
          <div>
            <p className="font-lato text-sm font-semibold text-charcoal-brand">Pre-ride inspection</p>
            <p className="font-lato text-xs text-charcoal-brand/50 mt-0.5">
              Go through each item with the customer
            </p>
          </div>

          {items.length === 0 && (
            <div className="text-center py-8 text-charcoal-brand/40 font-lato text-sm">
              Loading checklist…
            </div>
          )}

          {items.map((item) => {
            const r = results[item.id] ?? { result: 'accepted' as const };
            const buttons = RESULT_BUTTONS[item.itemType] ?? RESULT_BUTTONS.accepted_issue;

            return (
              <div key={item.id} className="bg-white rounded-xl border border-charcoal-brand/10 p-4">
                <p className="font-lato font-medium text-charcoal-brand text-sm mb-3">
                  {item.name}
                </p>

                {/* Result buttons */}
                <div className="flex flex-wrap gap-2">
                  {buttons.map((btn) => (
                    <button
                      key={btn.value}
                      type="button"
                      onClick={() => setItemResult(item.id, btn.value)}
                      className={`font-lato text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
                        r.result === btn.value
                          ? `${btn.activeClass} text-white`
                          : 'bg-gray-100 text-charcoal-brand/60'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* QTY selector for accepted_issue_qty when accepted */}
                {item.itemType === 'accepted_issue_qty' && r.result === 'accepted' && (
                  <div className="flex gap-2 mt-3">
                    {[1, 2].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => updateResult(item.id, { qty: q })}
                        className={`font-lato text-sm px-4 py-1.5 rounded-lg font-medium border transition-colors ${
                          r.qty === q
                            ? 'bg-teal-brand text-white border-teal-brand'
                            : 'bg-white text-charcoal-brand border-charcoal-brand/20'
                        }`}
                      >
                        QTY {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Issue noted extras */}
                {r.result === 'issue_noted' && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={r.notes ?? ''}
                      onChange={(e) => updateResult(item.id, { notes: e.target.value })}
                      placeholder="Describe the issue…"
                      rows={2}
                      className="w-full rounded-lg border border-charcoal-brand/20 bg-white text-sm font-lato p-2 text-charcoal-brand placeholder:text-charcoal-brand/30 focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand resize-none"
                    />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.logMaintenance ?? false}
                        onChange={(e) => updateResult(item.id, { logMaintenance: e.target.checked })}
                        className="h-4 w-4 rounded border-charcoal-brand/30 text-teal-brand focus:ring-teal-brand"
                      />
                      <span className="font-lato text-sm text-charcoal-brand/70">Log in maintenance</span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Section 4 — Helmet numbers */}
        <div>
          <label className="block">
            <span className="font-lato text-sm font-semibold text-charcoal-brand">Helmet number(s)</span>
            <input
              type="text"
              value={helmetNumbers}
              onChange={(e) => setHelmetNumbers(e.target.value)}
              placeholder="e.g. H-042, H-067"
              className="mt-1.5 block w-full rounded-lg border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm font-lato text-charcoal-brand placeholder:text-charcoal-brand/30 focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
            />
          </label>
        </div>

        {/* Section 5 — Damage notes */}
        <div className="space-y-2">
          <div>
            <p className="font-lato text-sm font-semibold text-charcoal-brand">Visible damage notes</p>
            <p className="font-lato text-xs text-charcoal-brand/50 mt-0.5">
              Note any existing damage observed
            </p>
          </div>
          <textarea
            value={damageNotes}
            onChange={(e) => setDamageNotes(e.target.value)}
            rows={3}
            placeholder="Describe any visible damage…"
            className="block w-full rounded-lg border border-charcoal-brand/20 bg-white px-3 py-2.5 text-sm font-lato text-charcoal-brand placeholder:text-charcoal-brand/30 focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand resize-none"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={damageLogMaintenance}
              onChange={(e) => setDamageLogMaintenance(e.target.checked)}
              className="h-4 w-4 rounded border-charcoal-brand/30 text-teal-brand focus:ring-teal-brand"
            />
            <span className="font-lato text-sm text-charcoal-brand/70">Log damage notes in maintenance</span>
          </label>
        </div>

        {/* Section 6 — Customer signature */}
        <div className="space-y-2">
          <div>
            <p className="font-lato text-sm font-semibold text-charcoal-brand">Customer signature</p>
            <p className="font-lato text-xs text-charcoal-brand/50 mt-0.5">
              Customer confirms they have inspected the vehicle and are satisfied with its condition
            </p>
          </div>

          <canvas
            ref={signatureCanvasRef}
            style={{ width: '100%', height: '180px' }}
            className="block rounded-xl border border-charcoal-brand/20 bg-white touch-none cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />

          <div className="flex justify-between items-center">
            <p className="font-lato text-xs text-charcoal-brand/50 max-w-xs">
              By signing, the customer confirms all items marked Accepted are in satisfactory condition
              and any issues noted have been brought to their attention.
            </p>
            <button
              type="button"
              onClick={clearSignature}
              className="font-lato text-xs text-teal-brand underline underline-offset-2 hover:text-teal-brand/70 transition-colors shrink-0 ml-4"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="font-lato text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Bottom submit (fallback for long scrolls) */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasSignature || submitting}
          className="w-full bg-gold-brand text-charcoal-brand font-lato font-semibold text-sm py-3 rounded-xl transition-colors hover:bg-gold-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Submit Inspection'}
        </button>
      </div>
    </dialog>
  );
}
