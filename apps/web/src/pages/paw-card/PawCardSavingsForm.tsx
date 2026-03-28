import { useState, useRef, useCallback, useEffect } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  generatePawOrderId,
  SAVINGS_ENTRIES_WRITE_TABLE,
} from './paw-card-utils.js';
import { fetchEstablishments } from './paw-card-queries.js';

type Est = { id: number; name: string };

type Props = {
  supabase: SupabaseClient;
  session: Session;
  displayFullName: string;
  onLogged: () => void;
};

export function PawCardSavingsForm({ supabase, session, displayFullName, onLogged }: Props) {
  const [establishments, setEstablishments] = useState<Est[]>([]);
  const [establishmentsError, setEstablishmentsError] = useState('');
  const [establishmentId, setEstablishmentId] = useState('');
  const [amount, setAmount] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [numPeople, setNumPeople] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [lastReference, setLastReference] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loadingEst, setLoadingEst] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchEstablishments(supabase);
        if (!cancelled) setEstablishments(list);
      } catch {
        if (!cancelled) setEstablishmentsError('Could not load businesses. Refresh and try again.');
      } finally {
        if (!cancelled) setLoadingEst(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const handleFileChange = useCallback((file: File | null) => {
    setUploadError('');
    if (!file) { setReceiptFile(null); setReceiptPreview(null); return; }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!allowed.includes(file.type)) {
      setUploadError('Invalid file type. Please upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File is too large. Maximum size is 5 MB.');
      return;
    }
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = () => setReceiptPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const establishmentName =
    establishments.find((e) => String(e.id) === establishmentId)?.name ?? '';

  const handleSubmitSaving = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitSuccess(false);
    setSubmitError('');
    setLastReference('');
    setIsSubmitting(true);

    try {
      const email = session.user.email;
      if (!email) {
        setSubmitError('Your account has no email. Please contact support.');
        return;
      }

      let receiptUrl: string | null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split('.').pop() ?? 'jpg';
        const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('paw-card-receipts')
          .upload(path, receiptFile, { contentType: receiptFile.type, upsert: false });
        if (upErr) {
          setUploadError('Receipt upload failed. Please try again.');
          return;
        }
        const { data: pub } = supabase.storage.from('paw-card-receipts').getPublicUrl(path);
        receiptUrl = pub.publicUrl;
      }

      const orderId = generatePawOrderId();
      const n = numPeople ? Number(numPeople) : null;
      const numberOfPeople = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;

      const { error: insErr } = await supabase.from(SAVINGS_ENTRIES_WRITE_TABLE).insert({
        order_id: orderId,
        full_name: displayFullName,
        email: email.trim().toLowerCase(),
        establishment: establishmentName || establishmentId,
        date_of_visit: visitDate,
        number_of_people: numberOfPeople,
        amount_saved: Number(amount),
        receipt_url: receiptUrl,
      });

      if (insErr) {
        setSubmitError(insErr.message || 'Could not save your entry. Please try again.');
        return;
      }

      setLastReference(orderId);
      setSubmitSuccess(true);
      setEstablishmentId('');
      setAmount('');
      setVisitDate('');
      setNumPeople('');
      setReceiptFile(null);
      setReceiptPreview(null);
      setUploadError('');
      onLogged();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmitSaving} className="space-y-4">
      {submitSuccess && lastReference && (
        <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: 'rgba(26,122,110,0.1)' }}>
          <span className="text-xl">✅</span>
          <div>
            <p className="font-bold text-sm" style={{ color: '#1A7A6E' }}>
              Your saving has been logged! Reference: {lastReference}
            </p>
            <p className="text-xs" style={{ color: '#3e4946' }}>Lola&apos;s will match it as a donation.</p>
          </div>
        </div>
      )}

      {loadingEst && <p className="text-sm" style={{ color: '#6e7976' }}>Loading partners…</p>}
      {establishmentsError && <p className="text-sm text-red-600">{establishmentsError}</p>}

      <div>
        <label className="block text-sm font-semibold mb-1.5 ml-1">Business Visited</label>
        <select
          required
          value={establishmentId}
          onChange={(e) => setEstablishmentId(e.target.value)}
          disabled={loadingEst || !!establishmentsError}
          className="w-full px-4 py-3 rounded-lg border-none focus:ring-2"
          style={{ background: '#fff', outlineColor: '#1A7A6E' }}
        >
          <option value="">Select establishment</option>
          {establishments.map((est) => (
            <option key={est.id} value={String(est.id)}>{est.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1.5 ml-1">Amount Saved (₱)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-3 rounded-lg border-none focus:ring-2"
            style={{ background: '#fff', outlineColor: '#1A7A6E' }}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5 ml-1">Date of Visit</label>
          <input
            type="date"
            required
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border-none focus:ring-2"
            style={{ background: '#fff', outlineColor: '#1A7A6E' }}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1.5 ml-1">Number of People</label>
        <input
          type="number"
          min={1}
          step={1}
          value={numPeople}
          onChange={(e) => setNumPeople(e.target.value)}
          placeholder="1"
          className="w-full px-4 py-3 rounded-lg border-none focus:ring-2"
          style={{ background: '#fff', outlineColor: '#1A7A6E' }}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1.5 ml-1">Receipt Photo</label>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />

        <div className="flex flex-col gap-2 mb-2">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="w-full py-2.5 rounded-full text-sm font-bold text-white"
            style={{ background: '#1A7A6E' }}
          >
            Upload from Gallery
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="w-full py-2.5 rounded-full text-sm font-bold"
            style={{ background: '#eae1d2', color: '#1A7A6E' }}
          >
            Take a Photo
          </button>
        </div>

        {receiptPreview ? (
          <div className="relative rounded-lg overflow-hidden border-2 border-dashed" style={{ borderColor: '#1A7A6E' }}>
            <img src={receiptPreview} alt="Receipt preview" className="w-full h-40 object-cover" />
            <button
              type="button"
              onClick={() => { setReceiptFile(null); setReceiptPreview(null); setUploadError(''); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center text-sm font-bold hover:bg-black/80"
            >
              ×
            </button>
          </div>
        ) : (
          <div
            role="presentation"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFileChange(e.dataTransfer.files?.[0] ?? null); }}
            className="w-full border-2 border-dashed rounded-lg p-4 text-center"
            style={{ borderColor: '#bdc9c5' }}
          >
            <p className="text-xs" style={{ color: '#6e7976' }}>Or drag a photo here</p>
          </div>
        )}
        {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-4 rounded-full font-bold text-lg text-white shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: '#1A7A6E' }}
      >
        {isSubmitting ? (
          <>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Submitting...
          </>
        ) : (
          'Log My Saving'
        )}
      </button>

      {submitError && <p className="text-sm text-center text-red-600">{submitError}</p>}
    </form>
  );
}
