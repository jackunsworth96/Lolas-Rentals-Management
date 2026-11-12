import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import lolasLogo from '../../assets/Lolas Original Logo.svg';
import { SEO } from '../../components/seo/SEO.js';
import { SignaturePad, isCanvasBlank } from '../../components/common/SignaturePad.js';
import { ContractMarkdown } from '../../components/contracts/ContractMarkdown.js';
import {
  fetchPublicContract,
  publicContractPdfUrl,
  signPublicContract,
  type PublicContractView,
} from '../../api/contracts.js';

const cardClass = 'bg-white rounded-xl border border-charcoal-brand/10 p-5 sm:p-8';
const goldCtaClass =
  'w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-gold-brand border-2 border-charcoal-brand text-charcoal-brand font-bold font-lato px-6 py-3.5 transition-opacity disabled:opacity-40 disabled:pointer-events-none';
const inputClass =
  'w-full font-lato text-sm border border-charcoal-brand/20 rounded-lg px-3 py-2.5 focus:outline-none focus:border-teal-brand bg-white';

function fmt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

export default function PublicContractPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [contract, setContract] = useState<PublicContractView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicContract(token)
      .then((c) => {
        if (cancelled) return;
        setContract(c);
        setSignerName(c.recipientName);
      })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [token]);

  async function sign() {
    setError(null);
    const canvas = canvasRef.current;
    if (signerName.trim().length < 2) { setError('Please type your full name.'); return; }
    if (!canvas || isCanvasBlank(canvas)) { setError('Please draw your signature.'); return; }
    if (!agreed) { setError('Please confirm you agree to the contract.'); return; }
    setSubmitting(true);
    try {
      setContract(await signPublicContract(token, {
        signerName: signerName.trim(),
        signatureDataUrl: canvas.toDataURL('image/png'),
        agreed: true,
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-brand font-lato text-charcoal-brand">
      <SEO title="Contract | Lola's Rentals" description="Review and sign your contract with Lola's Rentals." noIndex={true} />
      <header className="pt-8">
        <img src={lolasLogo} alt="Lola's Rentals" className="mx-auto h-14 w-auto" />
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
        {loadError && (
          <div className={cardClass}>
            <h1 className="font-headline text-xl font-bold">This link can't be used</h1>
            <p className="mt-2 text-sm text-charcoal-brand/80">{loadError}</p>
          </div>
        )}

        {!contract && !loadError && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
          </div>
        )}

        {contract && (
          <>
            {contract.status === 'completed' ? (
              <div className={`${cardClass} text-center`}>
                <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
                <h1 className="mt-3 font-headline text-2xl font-bold">Signed. Thank you!</h1>
                <p className="mt-2 text-sm text-charcoal-brand/80">
                  {contract.title} was signed by {contract.signerName} on {fmt(contract.signedAt)}. A copy has been emailed to you if we have your address.
                </p>
                <a href={publicContractPdfUrl(token)} className={`${goldCtaClass} mt-5`}>Download signed PDF</a>
              </div>
            ) : (
              <div className={cardClass}>
                <p className="text-xs font-bold uppercase tracking-widest text-teal-brand">Contract for {contract.recipientName}</p>
                <h1 className="mt-1 font-headline text-2xl font-bold">{contract.title}</h1>
                <p className="mt-2 text-sm text-charcoal-brand/80">
                  Please read the contract below, then sign at the bottom.
                  {contract.lolaSignerName && ` It has already been signed for Lola's Rentals by ${contract.lolaSignerName}.`}
                </p>
              </div>
            )}

            <div className={cardClass}>
              <ContractMarkdown body={contract.renderedBody} className="text-[15px] text-charcoal-brand" />
            </div>

            {contract.status !== 'completed' && (
              <div className={`${cardClass} space-y-4`}>
                <h2 className="font-headline text-lg font-bold">Sign the contract</h2>
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold">Your full name</span>
                  <input className={inputClass} value={signerName} onChange={(e) => setSignerName(e.target.value)} autoComplete="name" />
                </label>
                <div>
                  <span className="mb-1 block text-sm font-semibold">Your signature</span>
                  <SignaturePad canvasRef={canvasRef} onDrawingChange={setHasInk} />
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>I have read and agree to this contract, and I understand that signing electronically is legally binding.</span>
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button type="button" className={goldCtaClass} disabled={submitting || !hasInk || !agreed} onClick={() => void sign()}>
                  {submitting ? 'Signing…' : 'Sign contract'}
                </button>
              </div>
            )}

            <p className="break-all text-center font-mono text-[10px] text-charcoal-brand/40">Document fingerprint {contract.bodySha256}</p>
          </>
        )}
      </main>
    </div>
  );
}
