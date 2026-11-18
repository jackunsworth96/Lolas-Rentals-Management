import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  exitPartnerKiosk,
  partnerKioskCounterApi,
  usePartnerKioskBrand,
  usePartnerKioskStore,
} from '../../api/partner-kiosk.js';
import { CounterKiosk } from '../counter/CounterKiosk.js';

function ExitPrompt({ onClose, onExited }: { onClose: () => void; onExited: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await exitPartnerKiosk(pin);
      onExited();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That PIN is not right.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-brand/60 p-6" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
        <h2 className="font-headline text-2xl font-bold text-teal-brand">Close the counter tablet</h2>
        <p className="mt-2 font-lato text-sm text-charcoal-brand/70">Staff only. Enter your portal PIN.</p>
        <input
          aria-label="PIN"
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mt-6 w-full rounded-xl border-2 border-charcoal-brand/15 px-4 py-4 text-center font-lato text-2xl tracking-[0.5em] focus:border-teal-brand focus:outline-none"
        />
        {error && <p className="mt-3 font-lato text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border-2 border-charcoal-brand/15 py-3 font-lato font-bold text-charcoal-brand">
            Cancel
          </button>
          <button type="submit" disabled={!pin || busy} className="flex-1 rounded-xl bg-teal-brand py-3 font-lato font-bold text-white disabled:opacity-40">
            {busy ? 'Checking…' : 'Close tablet'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** A partner's front-desk tablet: guests book a vehicle delivered to the property. */
export default function PartnerKioskPage() {
  const navigate = useNavigate();
  const token = usePartnerKioskStore((s) => s.token);
  const brand = usePartnerKioskBrand(!!token);
  const [exiting, setExiting] = useState(false);

  if (!token) return <Navigate to="/partner/dashboard" replace />;

  if (brand.isLoading) {
    return <div className="flex min-h-screen items-center justify-center font-lato text-charcoal-brand/60" style={{ backgroundColor: '#f1e6d6' }}>Loading…</div>;
  }

  const exitPrompt = exiting && (
    <ExitPrompt onClose={() => setExiting(false)} onExited={() => navigate('/partner/dashboard', { replace: true })} />
  );

  if (!brand.data?.ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center" style={{ backgroundColor: '#f1e6d6' }}>
        <h1 className="font-headline text-3xl font-bold text-teal-brand">This tablet isn&apos;t ready yet</h1>
        <p className="max-w-md font-lato text-lg text-charcoal-brand/80">
          {brand.error instanceof Error ? brand.error.message : "Please ask Lola's Rentals to set your delivery area."}
        </p>
        <button type="button" onClick={() => setExiting(true)} className="font-lato text-sm font-bold text-charcoal-brand/60 underline">
          Close tablet
        </button>
        {exitPrompt}
      </div>
    );
  }

  return (
    <>
      <CounterKiosk
        counter={partnerKioskCounterApi}
        mode="scheduled"
        brand={{
          partnerName: brand.data.partnerName,
          logoUrl: brand.data.logoUrl ?? undefined,
          welcomeMessage: brand.data.welcomeMessage ?? undefined,
        }}
        homePath="/partner/kiosk"
        onLogoHold={() => setExiting(true)}
      />
      {exitPrompt}
    </>
  );
}
