import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '../../stores/auth-store.js';
import { api } from '../../api/client.js';
import { PawCardReceiptArea } from './PawCardReceiptArea.js';
import { PawCardSavingsDetailsFields } from './PawCardSavingsDetailsFields.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';

type Est = { id: number; name: string };

type Props = {
  accessEmail: string;
  customerIdForSubmit: string;
  displayFullName: string;
  onLogged: () => void;
  preselectedEstablishmentId?: string;
};

function apiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '/api';
  const base = raw.replace(/\/+$/, '');
  if (base.startsWith('http')) {
    return base.endsWith('/api') ? base : `${base}/api`;
  }
  return base || '/api';
}

function formatFetchError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: string }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'Could not load data. Refresh and try again.';
}

async function uploadPawReceipt(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('receipt', file);
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBaseUrl()}/paw-card/upload-receipt`, {
    method: 'POST',
    headers,
    body: formData,
  });
  let json: { success?: boolean; data?: { url?: string }; error?: { message?: string } };
  try {
    json = await res.json();
  } catch {
    throw new Error('Invalid response from server');
  }
  if (!res.ok || !json.success || !json.data?.url) {
    throw new Error(json.error?.message ?? 'Upload failed');
  }
  return json.data.url;
}

export function PawCardSavingsForm({
  accessEmail,
  customerIdForSubmit,
  displayFullName,
  onLogged,
  preselectedEstablishmentId,
}: Props) {
  const [establishments, setEstablishments] = useState<Est[]>([]);
  const [establishmentsError, setEstablishmentsError] = useState('');
  const [establishmentId, setEstablishmentId] = useState('');
  const [amount, setAmount] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [numPeople, setNumPeople] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [successInfo, setSuccessInfo] = useState<object | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loadingEst, setLoadingEst] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitPressDown, setSubmitPressDown] = useState(false);

  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingEst(true);
      setEstablishmentsError('');
      try {
        const raw = await api.get<Array<{ id: string; name: string }>>('/paw-card/establishments');
        if (!cancelled) {
          setEstablishments(
            raw.map((e) => ({ id: Number(e.id), name: e.name })),
          );
        }
      } catch (err) {
        if (!cancelled) setEstablishmentsError(formatFetchError(err));
      } finally {
        if (!cancelled) setLoadingEst(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (
      preselectedEstablishmentId &&
      establishments.length > 0 &&
      !establishmentId
    ) {
      const match = establishments.find(
        (e) => String(e.id) === preselectedEstablishmentId,
      );
      if (match) setEstablishmentId(String(match.id));
    }
  }, [preselectedEstablishmentId, establishments, establishmentId]);

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
    setSuccessInfo(null);
    setSubmitPressDown(true);
    await new Promise((r) => setTimeout(r, 100));
    setSubmitPressDown(false);
    await new Promise((r) => setTimeout(r, 100));
    setIsSubmitting(true);

    try {
      const email = accessEmail.trim().toLowerCase();
      if (!email) {
        setSubmitError('Missing email. Please access your Paw Card again.');
        return;
      }

      let receiptUrl: string | null = null;
      if (receiptFile) {
        try {
          receiptUrl = await uploadPawReceipt(receiptFile);
        } catch {
          setUploadError('Receipt upload failed. Please try again.');
          return;
        }
      }

      const n = numPeople ? Number(numPeople) : null;
      const numberOfPeople = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;

      await api.post('/paw-card/submit', {
        customerId: customerIdForSubmit,
        email,
        fullName: displayFullName,
        establishmentId,
        discountAmount: Number(amount),
        visitDate,
        receiptUrl: receiptUrl ?? undefined,
        numberOfPeople,
      });

      setSuccessInfo({});
      setSubmitSuccess(true);
      setEstablishmentId('');
      setAmount('');
      setVisitDate('');
      setNumPeople('');
      setReceiptFile(null);
      setReceiptPreview(null);
      setUploadError('');
      onLogged();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save your entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmitSaving} className="space-y-4 font-lato">
      {submitSuccess && successInfo && (
        <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: 'rgba(26,122,110,0.1)' }}>
          <span className="text-xl">✅</span>
          <div>
            <p className="font-bold text-sm" style={{ color: '#1A7A6E' }}>
              Your saving has been logged!
            </p>
            <p className="text-xs" style={{ color: '#3e4946' }}>Lola&apos;s will match it as a donation.</p>
          </div>
        </div>
      )}

      <PawCardSavingsDetailsFields
        loadingEst={loadingEst}
        establishmentsError={establishmentsError}
        establishments={establishments}
        establishmentId={establishmentId}
        setEstablishmentId={setEstablishmentId}
        amount={amount}
        setAmount={setAmount}
        visitDate={visitDate}
        setVisitDate={setVisitDate}
        numPeople={numPeople}
        setNumPeople={setNumPeople}
      />

      <PawCardReceiptArea
        galleryRef={galleryRef}
        cameraRef={cameraRef}
        receiptPreview={receiptPreview}
        uploadError={uploadError}
        onFileChange={handleFileChange}
        onClearReceipt={() => {
          setReceiptFile(null);
          setReceiptPreview(null);
          setUploadError('');
        }}
      />

      <PrimaryCtaButton
        type="submit"
        disabled={isSubmitting}
        className={`flex w-full items-center justify-center gap-2 py-4 text-lg font-bold shadow-lg transition-transform duration-150 ease-out ${submitPressDown ? 'scale-95' : 'scale-100'}`}
      >
        {isSubmitting ? (
          <>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
            Submitting...
          </>
        ) : (
          'Log My Saving'
        )}
      </PrimaryCtaButton>

      {submitError && <p className="text-sm text-center text-red-600">{submitError}</p>}
    </form>
  );
}
