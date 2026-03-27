import { useState, useEffect, useRef, useCallback } from 'react';
import {
  usePawCardLookup,
  useEstablishments,
  useLifetimeSavings,
  useSubmitPawCard,
  useCompanyImpact,
  useLeaderboard,
  useRegisterCustomer,
  useUploadReceipt,
  useMySubmissions,
  type PawCardCustomer,
} from '../../api/paw-card.js';
import { formatCurrency } from '../../utils/currency.js';

import logo from '../../assets/Logo.svg';
import discountCard from '../../assets/Discount Card.svg';
import flowerLeft from '../../assets/Flower Left.svg';
import flowerRight from '../../assets/Flower Right.svg';
import handOnHeart from '../../assets/Hand on Heart.svg';
import pawPrint from '../../assets/Lola a Paw Print.svg';
import lolaFace from '../../assets/Lola Face Icon.svg';
import cloud from '../../assets/Cloud.svg';

/* ------------------------------------------------------------------ */
/*  Session helpers                                                    */
/* ------------------------------------------------------------------ */

const SESSION_KEY = 'paw-card-customer';

function loadSession(): PawCardCustomer | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PawCardCustomer) : null;
  } catch { return null; }
}

function saveSession(c: PawCardCustomer) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(c));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/* ------------------------------------------------------------------ */
/*  Font loader                                                        */
/* ------------------------------------------------------------------ */

function usePawCardFonts() {
  useEffect(() => {
    const id = 'paw-card-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Epilogue:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
    return () => { document.getElementById(id)?.remove(); };
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PawCardPage() {
  usePawCardFonts();

  const [customer, setCustomer] = useState<PawCardCustomer | null>(loadSession);
  const [identifyEmail, setIdentifyEmail] = useState('');
  const [lookupTriggered, setLookupTriggered] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regOrderId, setRegOrderId] = useState('');

  const [establishment, setEstablishment] = useState('');
  const [amount, setAmount] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [numPeople, setNumPeople] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const logRef = useRef<HTMLElement>(null);
  const dashRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const email = customer?.email ?? '';

  const { data: lookupResults, isFetching: lookingUp } = usePawCardLookup(lookupTriggered);
  const { data: establishments } = useEstablishments();
  const { data: lifetime } = useLifetimeSavings(email);
  const { data: impact } = useCompanyImpact();
  const { data: leaderboard } = useLeaderboard(email || undefined);
  const { data: submissions } = useMySubmissions(email);
  const submitMutation = useSubmitPawCard();
  const registerMutation = useRegisterCustomer();
  const uploadMutation = useUploadReceipt();

  /* handle lookup results */
  useEffect(() => {
    if (!lookupTriggered || lookingUp) return;
    if (lookupResults && lookupResults.length > 0) {
      const c = lookupResults[0];
      setCustomer(c);
      saveSession(c);
      setShowRegister(false);
      setTimeout(() => logRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    } else if (lookupResults) {
      setShowRegister(true);
    }
  }, [lookupResults, lookingUp, lookupTriggered]);

  const handleIdentify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifyEmail.trim()) return;
    setLookupTriggered(identifyEmail.trim());
    setShowRegister(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await registerMutation.mutateAsync({
        fullName: regName,
        email: identifyEmail.trim(),
        mobile: regPhone || undefined,
        orderId: regOrderId || undefined,
      });
      setCustomer(result);
      saveSession(result);
      setShowRegister(false);
      setTimeout(() => logRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    } catch { /* error shown via mutation state */ }
  };

  const handleLogout = () => {
    clearSession();
    setCustomer(null);
    setIdentifyEmail('');
    setLookupTriggered('');
    setShowRegister(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
    if (!customer) return;
    setSubmitSuccess(false);

    let receiptUrl: string | undefined;
    if (receiptFile) {
      try {
        const result = await uploadMutation.mutateAsync(receiptFile);
        receiptUrl = result.url;
      } catch {
        setUploadError('Receipt upload failed. Please try again.');
        return;
      }
    }

    try {
      await submitMutation.mutateAsync({
        customerId: customer.email ?? customer.name,
        establishmentId: establishment,
        discountAmount: Number(amount),
        visitDate,
        numberOfPeople: numPeople ? Number(numPeople) : undefined,
        receiptUrl,
      });
      setSubmitSuccess(true);
      setEstablishment('');
      setAmount('');
      setVisitDate('');
      setNumPeople('');
      setReceiptFile(null);
      setReceiptPreview(null);
      setUploadError('');
      setTimeout(() => dashRef.current?.scrollIntoView({ behavior: 'smooth' }), 300);
    } catch { /* error shown via mutation state */ }
  };

  const isSubmitting = submitMutation.isPending || uploadMutation.isPending;
  const totalSaved = lifetime?.totalSaved ?? 0;

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", background: '#FFF8F1' }}>
      {/* ---- Decorative background flowers ---- */}
      <img src={flowerLeft} alt="" className="fixed left-0 top-1/2 -translate-y-1/2 w-36 md:w-56 h-auto opacity-60 pointer-events-none z-0" />
      <img src={flowerRight} alt="" className="fixed right-0 top-1/2 -translate-y-1/2 w-36 md:w-56 h-auto opacity-60 pointer-events-none z-0" />

      {/* ---- Header ---- */}
      <header className="fixed top-0 w-full z-50 shadow-sm" style={{ background: 'rgba(250,246,240,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex justify-between items-center px-6 py-3 max-w-5xl mx-auto">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Lola's Rentals" className="h-8 w-auto" />
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-semibold">
            <a href="#hero" className="transition-opacity hover:opacity-70" style={{ color: '#1A7A6E' }}>Home</a>
            <a href="#log-saving" className="transition-opacity hover:opacity-70" style={{ color: '#3D3D3D' }}>Log Saving</a>
            <a href="#dashboard" className="transition-opacity hover:opacity-70" style={{ color: '#3D3D3D' }}>Leaderboard</a>
          </nav>
          {customer && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: '#1A7A6E' }}>
                {customer.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="pt-14 relative">
        {/* ---- Hero ---- */}
        <section id="hero" className="relative px-6 py-16 md:py-24 overflow-hidden text-center">
          <div className="absolute inset-0 -z-10 opacity-30" style={{ background: 'linear-gradient(135deg, rgba(157,242,227,0.3), rgba(245,183,49,0.1))' }} />
          <img src={cloud} alt="" className="absolute top-4 right-8 w-28 md:w-44 opacity-20 pointer-events-none -z-10" />
          <img src={cloud} alt="" className="absolute bottom-8 left-4 w-20 md:w-32 opacity-15 pointer-events-none -z-10" />
          <div className="max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6" style={{ background: '#F5B731', color: '#271900' }}>
              <img src={pawPrint} alt="" className="w-4 h-4" />
              Paw Card Exclusive
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tighter mb-4" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1A7A6E' }}>
              Every Peso <span className="italic" style={{ color: '#F5B731' }}>Wags</span> a Tail
            </h1>
            <p className="text-lg md:text-xl max-w-2xl mx-auto mb-8 leading-relaxed" style={{ color: '#3e4946' }}>
              Log your savings at partner businesses. Every peso you save, <span className="font-bold" style={{ color: '#1A7A6E' }}>Lola's matches as a donation</span> to Be Pawsitive NGO.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a href="#log-saving" className="px-8 py-3.5 rounded-full font-bold text-lg text-white shadow-lg transition-transform hover:scale-105" style={{ background: '#1A7A6E' }}>
                Start Logging
              </a>
              <a href="#dashboard" className="px-8 py-3.5 rounded-full font-bold text-lg transition-transform hover:scale-105" style={{ background: '#eae1d2', color: '#1A7A6E' }}>
                View Impact
              </a>
            </div>
            <img src={handOnHeart} alt="Every peso helps" className="mx-auto mt-10 w-32 md:w-44 h-auto opacity-90" />
          </div>
        </section>

        {/* ---- Identify / Login ---- */}
        <section className="px-6 py-10" style={{ background: 'rgba(246,237,221,0.6)' }}>
          <div className="max-w-md mx-auto">
            <div className="bg-white p-8 md:p-10 rounded-2xl shadow-lg">
              {customer ? (
                <div className="text-center">
                  <img src={lolaFace} alt="Lola" className="w-16 h-16 mx-auto mb-3 rounded-full border-4 border-amber-200/40 bg-white p-1 object-contain" />
                  <h3 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1f1b12' }}>
                    Welcome, {customer.name.split(' ')[0]}!
                  </h3>
                  <p className="text-sm mb-4" style={{ color: '#3e4946' }}>{customer.email}</p>
                  <button onClick={handleLogout} className="text-xs font-medium underline" style={{ color: '#6e7976' }}>
                    Not you? Log out
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <img src={lolaFace} alt="Lola" className="w-16 h-16 mx-auto mb-3 rounded-full border-4 border-amber-200/40 bg-white p-1 object-contain" />
                  <h3 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1f1b12' }}>Welcome</h3>
                  <p className="text-sm mb-6" style={{ color: '#3e4946' }}>Access your Paw Card profile</p>

                  {!showRegister ? (
                    <form onSubmit={handleIdentify} className="space-y-4 text-left">
                      <div>
                        <label className="block text-sm font-semibold mb-1.5 ml-1">Email Address</label>
                        <input
                          type="email"
                          required
                          value={identifyEmail}
                          onChange={e => setIdentifyEmail(e.target.value)}
                          placeholder="hello@siargao.com"
                          className="w-full px-4 py-3 rounded-lg border-none focus:ring-2 transition-all"
                          style={{ background: '#f0e7d8', outlineColor: '#1A7A6E' }}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={lookingUp}
                        className="w-full py-3.5 rounded-full font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
                        style={{ background: '#1A7A6E' }}
                      >
                        {lookingUp ? 'Looking up...' : 'Login to My Card'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-4 text-left">
                      <p className="text-sm text-center mb-2 px-2 py-2 rounded-lg" style={{ background: '#FFF3E0', color: '#5e4200' }}>
                        No account found for <strong>{identifyEmail}</strong>. Register below to get started!
                      </p>
                      <div>
                        <label className="block text-sm font-semibold mb-1.5 ml-1">Full Name</label>
                        <input type="text" required value={regName} onChange={e => setRegName(e.target.value)} placeholder="Juan Dela Cruz"
                          className="w-full px-4 py-3 rounded-lg border-none focus:ring-2" style={{ background: '#f0e7d8', outlineColor: '#1A7A6E' }} />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1.5 ml-1">Phone Number</label>
                        <input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="+63 9XX XXX XXXX"
                          className="w-full px-4 py-3 rounded-lg border-none focus:ring-2" style={{ background: '#f0e7d8', outlineColor: '#1A7A6E' }} />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1.5 ml-1">Order ID <span className="font-normal text-xs" style={{ color: '#6e7976' }}>(optional)</span></label>
                        <input type="text" value={regOrderId} onChange={e => setRegOrderId(e.target.value)} placeholder="e.g. ORD-12345"
                          className="w-full px-4 py-3 rounded-lg border-none focus:ring-2" style={{ background: '#f0e7d8', outlineColor: '#1A7A6E' }} />
                      </div>
                      <button type="submit" disabled={registerMutation.isPending}
                        className="w-full py-3.5 rounded-full font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
                        style={{ background: '#1A7A6E' }}>
                        {registerMutation.isPending ? 'Creating...' : 'Create My Paw Card'}
                      </button>
                      {registerMutation.isError && (
                        <p className="text-sm text-center text-red-600">{registerMutation.error.message}</p>
                      )}
                      <button type="button" onClick={() => setShowRegister(false)} className="w-full text-center text-xs underline" style={{ color: '#6e7976' }}>
                        Back to login
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---- Divider ---- */}
        <div className="flex items-center justify-center gap-6 py-6 opacity-25 max-w-xs mx-auto">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
          <img src={pawPrint} alt="" className="w-7 h-7 opacity-60 grayscale" />
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
        </div>

        {/* ---- Log a Saving ---- */}
        <section ref={logRef} id="log-saving" className="px-6 py-12 max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-start">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-4xl font-bold" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1A7A6E' }}>Log a Saving</h2>
              <img src={discountCard} alt="" className="w-10 h-10" />
            </div>
            <p className="text-lg mb-6 leading-relaxed" style={{ color: '#3e4946' }}>
              Visited one of our partners? Upload your receipt and we'll match it peso for peso as a donation to Be Pawsitive.
            </p>
            <div className="p-5 rounded-lg" style={{ background: 'rgba(245,183,49,0.15)' }}>
              <h4 className="font-bold text-sm mb-1" style={{ color: '#5e4200' }}>Receipt Guidelines</h4>
              <p className="text-xs" style={{ color: 'rgba(94,66,0,0.8)' }}>
                Make sure the date, business name, and total amount are clearly visible in your photo.
              </p>
            </div>

            {/* Recent submissions */}
            {submissions && submissions.length > 0 && (
              <div className="mt-8">
                <h4 className="font-bold text-sm mb-3" style={{ color: '#3e4946' }}>Recent Submissions</h4>
                <div className="space-y-2">
                  {submissions.slice(0, 5).map(s => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(246,237,221,0.5)' }}>
                      <div>
                        <span className="font-medium">{s.establishmentName}</span>
                        <span className="ml-2 text-xs" style={{ color: '#6e7976' }}>{s.visitDate}</span>
                      </div>
                      <span className="font-bold" style={{ color: '#1A7A6E' }}>{formatCurrency(s.discountAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-8 rounded-2xl shadow-lg" style={{ background: '#fcf2e3' }}>
            {!customer ? (
              <div className="text-center py-8">
                <p className="text-sm font-medium" style={{ color: '#6e7976' }}>Please identify yourself above to log a saving.</p>
                <a href="#hero" className="inline-block mt-3 px-6 py-2 rounded-full text-sm font-bold text-white" style={{ background: '#1A7A6E' }}>
                  Go to Login
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmitSaving} className="space-y-4">
                {submitSuccess && (
                  <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: 'rgba(26,122,110,0.1)' }}>
                    <span className="text-xl">✅</span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: '#1A7A6E' }}>Saving logged!</p>
                      <p className="text-xs" style={{ color: '#3e4946' }}>Your entry has been recorded. Lola's will match it as a donation.</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold mb-1.5 ml-1">Business Visited</label>
                  <select required value={establishment} onChange={e => setEstablishment(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border-none focus:ring-2" style={{ background: '#fff', outlineColor: '#1A7A6E' }}>
                    <option value="">Select establishment</option>
                    {(establishments ?? []).map(est => (
                      <option key={est.id} value={est.id}>{est.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5 ml-1">Amount Saved (₱)</label>
                    <input type="number" step="0.01" min="0" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                      className="w-full px-4 py-3 rounded-lg border-none focus:ring-2" style={{ background: '#fff', outlineColor: '#1A7A6E' }} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5 ml-1">Date of Visit</label>
                    <input type="date" required value={visitDate} onChange={e => setVisitDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border-none focus:ring-2" style={{ background: '#fff', outlineColor: '#1A7A6E' }} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1.5 ml-1">Number of People</label>
                  <input type="number" min="1" value={numPeople} onChange={e => setNumPeople(e.target.value)} placeholder="1"
                    className="w-full px-4 py-3 rounded-lg border-none focus:ring-2" style={{ background: '#fff', outlineColor: '#1A7A6E' }} />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1.5 ml-1">Receipt Photo</label>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden"
                    onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />

                  {receiptPreview ? (
                    <div className="relative rounded-lg overflow-hidden border-2 border-dashed" style={{ borderColor: '#1A7A6E' }}>
                      <img src={receiptPreview} alt="Receipt preview" className="w-full h-40 object-cover" />
                      <button type="button"
                        onClick={() => { setReceiptFile(null); setReceiptPreview(null); setUploadError(''); }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center text-sm font-bold hover:bg-black/80">
                        ×
                      </button>
                    </div>
                  ) : (
                    <button type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); handleFileChange(e.dataTransfer.files?.[0] ?? null); }}
                      className="w-full border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer hover:bg-white/50"
                      style={{ borderColor: '#bdc9c5' }}>
                      <span className="block text-2xl mb-1" style={{ color: '#6e7976' }}>📷</span>
                      <p className="text-xs" style={{ color: '#6e7976' }}>Tap to upload or drag a photo</p>
                    </button>
                  )}
                  {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                </div>

                <button type="submit" disabled={isSubmitting}
                  className="w-full py-4 rounded-full font-bold text-lg text-white shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: '#1A7A6E' }}>
                  {isSubmitting ? (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Submitting...
                    </>
                  ) : (
                    'Log My Saving'
                  )}
                </button>

                {submitMutation.isError && (
                  <p className="text-sm text-center text-red-600">{submitMutation.error.message}</p>
                )}
              </form>
            )}
          </div>
        </section>

        {/* ---- Divider ---- */}
        <div className="flex items-center justify-center gap-6 py-6 opacity-25 max-w-xs mx-auto">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
          <img src={pawPrint} alt="" className="w-7 h-7 opacity-60 grayscale" />
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #1A7A6E, transparent)' }} />
        </div>

        {/* ---- Dashboard ---- */}
        <section ref={dashRef} id="dashboard" className="px-6 py-12" style={{ background: 'rgba(246,237,221,0.4)' }}>
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-4xl font-bold" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1f1b12' }}>Your Impact</h2>
                <p style={{ color: '#3e4946' }}>Real-time stats of your contributions</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* My Total Savings */}
              <div className="bg-white p-8 rounded-2xl shadow-lg flex flex-col justify-between">
                <div>
                  <img src={discountCard} alt="" className="w-8 h-8 mb-2" />
                  <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#3e4946' }}>My Total Savings</h4>
                </div>
                <p className="text-4xl font-black mt-2" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1A7A6E' }}>
                  {customer ? formatCurrency(totalSaved) : '---'}
                </p>
                {customer && (
                  <p className="mt-3 text-sm" style={{ color: '#3e4946' }}>
                    {lifetime?.totalVisits ?? 0} visit{(lifetime?.totalVisits ?? 0) !== 1 ? 's' : ''} logged
                  </p>
                )}
              </div>

              {/* Matched Donation */}
              <div className="p-8 rounded-2xl shadow-lg flex flex-col justify-between text-white relative overflow-hidden" style={{ background: '#1A7A6E' }}>
                <div className="relative z-10">
                  <img src={pawPrint} alt="" className="w-8 h-8 mb-2 brightness-0 invert" />
                  <h4 className="text-xs font-bold uppercase tracking-wider opacity-80">Lola's Matched Donation</h4>
                </div>
                <div className="relative z-10">
                  <p className="text-4xl font-black mt-2 mb-1" style={{ fontFamily: 'Epilogue, sans-serif' }}>
                    {customer ? formatCurrency(totalSaved) : '---'}
                  </p>
                  <p className="text-xs opacity-70">
                    Every peso you save, Lola's donates the same to Be Pawsitive NGO.
                  </p>
                </div>
                <img src={lolaFace} alt="" className="absolute -bottom-4 -right-4 w-28 h-28 opacity-15 pointer-events-none z-0" />
              </div>

              {/* Community Total */}
              <div className="p-8 rounded-2xl shadow-lg md:row-span-2 flex flex-col" style={{ background: '#F5B731', color: '#271900' }}>
                <div className="mb-auto">
                  <img src={handOnHeart} alt="" className="w-8 h-8 mb-2" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Community Total</h4>
                  <p className="text-4xl font-black mt-2" style={{ fontFamily: 'Epilogue, sans-serif' }}>
                    {formatCurrency(impact?.totalDiscountGiven ?? 0)}
                  </p>
                </div>
                <div className="mt-8 pt-6 border-t" style={{ borderColor: 'rgba(39,25,0,0.1)' }}>
                  <p className="text-lg font-medium leading-snug">
                    <span className="font-black text-2xl">{impact?.uniqueCustomers ?? 0}</span> customers contributing across{' '}
                    <span className="font-black text-2xl">{impact?.totalEntries ?? 0}</span> visits
                  </p>
                </div>
              </div>

              {/* Leaderboard */}
              <div className="bg-white p-8 rounded-2xl shadow-lg md:col-span-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                  <h4 className="text-2xl font-bold" style={{ fontFamily: 'Epilogue, sans-serif' }}>Top Savers</h4>
                </div>

                {/* Current user's position (if outside top 10) */}
                {leaderboard?.myPosition && leaderboard.myPosition.rank > 10 && (
                  <div className="flex items-center justify-between p-3 rounded-lg mb-4 border-l-4" style={{ background: 'rgba(26,122,110,0.05)', borderColor: '#1A7A6E' }}>
                    <div className="flex items-center gap-4">
                      <span className="font-bold w-5 text-right" style={{ color: '#1A7A6E' }}>{leaderboard.myPosition.rank}</span>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: '#1A7A6E' }}>
                        {customer?.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span className="font-bold text-sm">You ({leaderboard.myPosition.name})</span>
                    </div>
                    <span className="font-bold text-sm">{formatCurrency(leaderboard.myPosition.totalSaved)}</span>
                  </div>
                )}

                {/* Top 10 */}
                <div className="space-y-2">
                  {(leaderboard?.top ?? []).map(entry => {
                    const isMe = entry.isCurrentUser;
                    return (
                      <div key={entry.rank}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors"
                        style={isMe ? { background: 'rgba(26,122,110,0.05)', borderLeft: '4px solid #1A7A6E' } : {}}>
                        <div className="flex items-center gap-4">
                          <span className="font-bold w-5 text-right text-sm" style={{ color: isMe ? '#1A7A6E' : '#3e4946' }}>
                            {entry.rank}
                          </span>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                            style={isMe
                              ? { background: 'rgba(26,122,110,0.2)', color: '#1A7A6E' }
                              : entry.rank <= 3
                                ? { background: '#F5B731', color: '#271900' }
                                : { background: '#eae1d2', color: '#3e4946' }}>
                            {entry.name[0]}
                          </div>
                          <span className={`text-sm ${isMe ? 'font-bold' : ''}`}>
                            {isMe ? `You (${entry.name})` : entry.name}
                          </span>
                        </div>
                        <span className="font-medium text-sm" style={{ color: isMe ? '#1A7A6E' : '#3e4946' }}>
                          {formatCurrency(entry.totalSaved)}
                        </span>
                      </div>
                    );
                  })}
                  {(leaderboard?.top ?? []).length === 0 && (
                    <p className="text-center text-sm py-6" style={{ color: '#6e7976' }}>No entries yet. Be the first!</p>
                  )}
                </div>

                {/* Current user's position (if within top 10, show summary) */}
                {leaderboard?.myPosition && leaderboard.myPosition.rank <= 10 && (
                  <p className="text-center text-xs mt-4 font-medium" style={{ color: '#1A7A6E' }}>
                    You're ranked #{leaderboard.myPosition.rank} — keep going!
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ---- Mobile Bottom Nav ---- */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-end px-4 pb-4 pt-3 shadow-lg rounded-t-3xl" style={{ background: '#FAF6F0' }}>
        <a href="#hero" className="flex flex-col items-center gap-0.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(61,61,61,0.6)' }}>
          <span className="text-lg">🏠</span>Home
        </a>
        <a href="#log-saving" className="flex flex-col items-center gap-0.5 text-xs font-bold uppercase tracking-wider relative" style={{ color: '#1f1b12' }}>
          <span className="text-lg">➕</span>Log Saving
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full" style={{ background: '#F5B731' }} />
        </a>
        <a href="#dashboard" className="flex flex-col items-center gap-0.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(61,61,61,0.6)' }}>
          <span className="text-lg">📊</span>Stats
        </a>
      </nav>

      {/* ---- Footer ---- */}
      <footer className="w-full py-8 px-8 flex flex-col items-center gap-4 text-center relative z-10 pb-24 md:pb-10" style={{ background: '#E8DFD0' }}>
        <div className="flex items-center gap-2">
          <img src={pawPrint} alt="" className="w-5 h-5" />
          <img src={logo} alt="Lola's Rentals" className="h-6 w-auto" />
        </div>
        <p className="text-xs" style={{ color: 'rgba(61,61,61,0.6)' }}>
          &copy; {new Date().getFullYear()} Lola's Rentals x BePawsitive NGO
        </p>
      </footer>
    </div>
  );
}
