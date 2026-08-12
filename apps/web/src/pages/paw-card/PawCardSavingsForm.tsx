import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../../api/client.js';
import { PawCardReceiptArea } from './PawCardReceiptArea.js';
import { PawCardSavingsDetailsFields } from './PawCardSavingsDetailsFields.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';

type Est = { id: number; name: string };

type Props = {
  accessToken: string;
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

type PawCardApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

async function pawCardCustomerPost<T>(
  path: string,
  accessToken: string,
  body: BodyInit,
  contentType?: string,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (contentType) headers['Content-Type'] = contentType;
  const res = await fetch(`${apiBaseUrl()}${path}`, { method: 'POST', headers, body });
  let json: PawCardApiResponse<T>;
  try {
    json = await res.json();
  } catch {
    throw new Error('Invalid response from server');
  }
  if (!res.ok || !json.success || json.data === undefined) {
    throw new Error(json.error?.message ?? 'Request failed');
  }
  return json.data;
}

async function uploadPawReceipt(file: File, accessToken: string): Promise<string> {
  const formData = new FormData();
  formData.append('receipt', file);
  const result = await pawCardCustomerPost<{ receiptPath: string }>(
    '/public/paw-card/upload-receipt',
    accessToken,
    formData,
  );
  return result.receiptPath;
}

export function PawCardSavingsForm({
  accessToken,
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
        const raw = await api.get<Array<{ id: string; name: string }>>('/public/paw-card/establishments');
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
      let receiptPath: string | null = null;
      if (receiptFile) {
        try {
          receiptPath = await uploadPawReceipt(receiptFile, accessToken);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Receipt upload failed. Please try again.');
          return;
        }
      }

      const n = numPeople ? Number(numPeople) : null;
      const numberOfPeople = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;

      await pawCardCustomerPost(
        '/public/paw-card/submit',
        accessToken,
        JSON.stringify({
          establishmentId,
          discountAmount: Number(amount),
          visitDate,
          receiptPath: receiptPath ?? undefined,
          numberOfPeople,
        }),
        'application/json',
      );

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
