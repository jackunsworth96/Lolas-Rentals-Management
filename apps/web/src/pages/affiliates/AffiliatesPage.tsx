import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../../api/client.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { useToast } from '../../hooks/useToast.js';

const PROPERTY_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'resort', label: 'Resort' },
  { value: 'bnb', label: 'B&B' },
  { value: 'apartment', label: 'Apartment / Serviced Residence' },
  { value: 'other', label: 'Other' },
];

interface EnrolForm {
  propertyName: string;
  propertyType: string;
  location: string;
  roomCount: string;
  contactName: string;
  email: string;
  phone: string;
  telegramUsername: string;
  dealChoice: 'commission' | 'discount' | '';
  preferredRate: string;
}

const EMPTY_FORM: EnrolForm = {
  propertyName: '',
  propertyType: '',
  location: '',
  roomCount: '',
  contactName: '',
  email: '',
  phone: '',
  telegramUsername: '',
  dealChoice: '',
  preferredRate: '',
};

const inputClass =
  'w-full rounded-xl border border-[#d1c4b0] bg-white px-4 py-2.5 text-sm font-medium text-charcoal-brand shadow-sm transition-all duration-200 focus:border-[#00577C] focus:outline-none focus:ring-2 focus:ring-[#00577C]/25';

interface DealCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  icon: React.ReactNode;
}

function DealCard({ selected, onSelect, title, body, icon }: DealCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all sm:p-5 ${
        selected
          ? 'border-teal-brand bg-teal-50/60 shadow-md'
          : 'border-charcoal-brand/15 bg-white hover:border-teal-brand/40'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          selected ? 'bg-teal-brand text-white' : 'bg-sand-brand text-charcoal-brand'
        }`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-headline block text-base font-bold text-charcoal-brand">{title}</span>
        <span className="font-lato mt-1 block text-[13px] leading-relaxed text-charcoal-brand/70">{body}</span>
      </span>
      <span
        aria-hidden
        className={`mt-1.5 h-4 w-4 shrink-0 rounded-full border-2 ${
          selected ? 'border-teal-brand bg-teal-brand' : 'border-charcoal-brand/30 bg-white'
        }`}
      >
        {selected && <span className="block h-full w-full scale-50 rounded-full bg-white" />}
      </span>
    </button>
  );
}

export default function AffiliatesPage() {
  const navigate = useNavigate();
  const { toasts, pushToast } = useToast();

  const [form, setForm] = useState<EnrolForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [submittedPartnerId, setSubmittedPartnerId] = useState<string | null>(null);

  function setField<K extends keyof EnrolForm>(key: K, value: EnrolForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.propertyName.trim()) { pushToast('Property name is required', 'error'); return; }
    if (!form.contactName.trim()) { pushToast('Contact name is required', 'error'); return; }
    if (!form.email.trim() || !form.email.includes('@')) { pushToast('Valid email is required', 'error'); return; }
    if (!form.dealChoice) { pushToast('Please choose a deal type', 'error'); return; }

    setSubmitting(true);
    try {
      const result = await api.post<{ id: string; slug: string; deal_type: string; status: string }>(
        '/partners/enroll',
        {
          propertyName: form.propertyName.trim(),
          propertyType: form.propertyType || null,
          location: form.location.trim() || null,
          roomCount: form.roomCount.trim() === '' ? null : Number(form.roomCount),
          contactName: form.contactName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          telegramUsername: form.telegramUsername.trim() || null,
          dealChoice: form.dealChoice,
          preferredRate: form.preferredRate.trim() === '' ? null : Number(form.preferredRate),
        },
      );
      setSubmittedPartnerId(result.id);
      pushToast('Application received — thank you!', 'success');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      pushToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (submittedPartnerId) {
    return (
      <>
        <SEO
          title="Application received — Lola's Rentals Affiliates"
          description="Thanks for applying to partner with Lola's Rentals. We'll review your application within 1–2 working days."
          canonical="/affiliates"
          noIndex
        />
        <PageLayout title="Application received | Lola's Rentals">
          <div className="relative mx-auto max-w-2xl px-4 pt-12">
            <div className="rounded-3xl border border-teal-brand/20 bg-white p-8 shadow-sm">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-50">
                <CheckCircle2 className="h-7 w-7 text-teal-brand" aria-hidden />
              </div>
              <h1 className="font-headline text-3xl font-extrabold text-charcoal-brand sm:text-4xl">
                Thanks — your application is in!
              </h1>
              <p className="font-lato mt-3 text-[15px] leading-relaxed text-charcoal-brand/70">
                We'll review your details within 1–2 working days and reach out by email to confirm
                terms and share your trackable booking link.
              </p>

              <div className="mt-6 rounded-2xl border border-teal-brand/20 bg-teal-50 p-5">
                <p className="font-headline text-base font-bold text-charcoal-brand">
                  Want to help us prepare?
                </p>
                <p className="font-lato mt-1.5 text-[13px] leading-relaxed text-charcoal-brand/70">
                  Answer a few more questions about your property — totally optional, but it helps us
                  fast-track your approval.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/affiliates/details/${submittedPartnerId}`)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#00496a]"
                >
                  Continue to Step 2 (optional)
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => navigate('/book')}
                  className="font-lato text-sm font-semibold text-teal-brand underline underline-offset-2 hover:text-[#00496a]"
                >
                  Or go to the homepage →
                </button>
              </div>
            </div>
          </div>

          <div className="fixed bottom-8 right-8 z-[60] flex flex-col-reverse items-end gap-2">
            {toasts.map((tt) => (
              <div
                key={tt.id}
                className={`rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${
                  tt.type === 'success' ? 'bg-teal-600 text-white' : 'bg-red-600 text-white'
                }`}
              >
                {tt.msg}
              </div>
            ))}
          </div>
        </PageLayout>
      </>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <>
      <SEO
        title="Affiliates — Partner with Lola's Rentals Siargao"
        description="Run a hotel or resort in Siargao? Earn commissions or give your guests a discounted rate on scooter rentals from Lola's Rentals."
        canonical="/affiliates"
      />
      <PageLayout title="Become a Lola's Affiliate">
        <div className="relative mx-auto max-w-3xl px-4 pt-6 pb-16">
          {/* Hero */}
          <div className="mb-6 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-brand/30 bg-teal-50 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-teal-brand">
              <Link2 className="h-3.5 w-3.5" /> Hotels &amp; Resorts in Siargao
            </div>
            <h1
              className="font-headline font-extrabold text-charcoal-brand"
              style={{ fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.1 }}
            >
              Partner with Lola's Rentals
            </h1>
            <p className="font-lato mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-charcoal-brand/70">
              Send your guests our way and earn a commission on every booking — or pass the value
              straight to them with a partner-only discount. Tell us a little about your property
              and we'll handle the rest.
            </p>
          </div>

          {/* Form card */}
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-charcoal-brand/10 bg-white p-5 shadow-sm sm:p-7"
          >
            {/* About your property */}
            <fieldset className="mb-6">
              <legend className="font-headline mb-3 text-base font-bold text-charcoal-brand">
                About your property
              </legend>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                    Property name *
                  </label>
                  <input
                    required
                    value={form.propertyName}
                    onChange={(e) => setField('propertyName', e.target.value)}
                    placeholder="e.g. Harana Surf Resort"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                    Property type
                  </label>
                  <select
                    value={form.propertyType}
                    onChange={(e) => setField('propertyType', e.target.value)}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="">Select type…</option>
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                    Number of rooms
                  </label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form.roomCount}
                    onChange={(e) => setField('roomCount', e.target.value)}
                    placeholder="e.g. 24"
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                    Location / area in Siargao
                  </label>
                  <input
                    value={form.location}
                    onChange={(e) => setField('location', e.target.value)}
                    placeholder="e.g. General Luna, Cloud 9, Pacifico"
                    className={inputClass}
                  />
                </div>
              </div>
            </fieldset>

            {/* Contact */}
            <fieldset className="mb-6 border-t border-charcoal-brand/10 pt-5">
              <legend className="font-headline mb-3 text-base font-bold text-charcoal-brand">
                Contact
              </legend>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                    Your name *
                  </label>
                  <input
                    required
                    value={form.contactName}
                    onChange={(e) => setField('contactName', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                    Email *
                  </label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                    Phone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    placeholder="+63 9XX XXX XXXX"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                    Telegram username
                  </label>
                  <input
                    value={form.telegramUsername}
                    onChange={(e) => setField('telegramUsername', e.target.value)}
                    placeholder="@yourhandle"
                    className={inputClass}
                  />
                  <p className="ml-1 text-[11px] text-charcoal-brand/45">
                    For automated reporting — optional.
                  </p>
                </div>
              </div>
            </fieldset>

            {/* Deal choice */}
            <fieldset className="mb-6 border-t border-charcoal-brand/10 pt-5">
              <legend className="font-headline mb-3 text-base font-bold text-charcoal-brand">
                How would you like to partner? *
              </legend>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DealCard
                  selected={form.dealChoice === 'discount'}
                  onSelect={() => setField('dealChoice', 'discount')}
                  title="Give guests a better rate"
                  body="Your guests book at a discount through your link. You keep the goodwill."
                  icon={<Link2 className="h-5 w-5" />}
                />
                <DealCard
                  selected={form.dealChoice === 'commission'}
                  onSelect={() => setField('dealChoice', 'commission')}
                  title="Earn commission"
                  body="We'll pay you a percentage of every booking made by your guests through your link."
                  icon={<Sparkles className="h-5 w-5" />}
                />
              </div>

              <div className="mt-4 space-y-1.5">
                <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">
                  Preferred rate
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={form.preferredRate}
                  onChange={(e) => setField('preferredRate', e.target.value)}
                  placeholder={form.dealChoice === 'discount' ? 'e.g. 5 (% off for guests)' : 'e.g. 5 (% commission)'}
                  className={inputClass}
                />
                <p className="ml-1 text-[11px] text-charcoal-brand/45">
                  Your preferred % or fixed amount — many partnerships start around 5%; we'll confirm when we review
                  your application.
                </p>
              </div>
            </fieldset>

            <div className="border-t border-charcoal-brand/10 pt-5 space-y-3">
              <p className="font-lato text-[12px] leading-relaxed text-charcoal-brand/50">
                We review every application personally and partner with properties that share our
                values — genuine hospitality, care for the island, and guests who deserve the full
                Siargao experience.
              </p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-lato text-[12px] text-charcoal-brand/40">
                  We'll be in touch within 1–2 working days.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-brand px-6 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-[#00496a] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Sending…' : <>Submit application <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="fixed bottom-8 right-8 z-[60] flex flex-col-reverse items-end gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${
                t.type === 'success' ? 'bg-teal-600 text-white' : 'bg-red-600 text-white'
              }`}
            >
              {t.msg}
            </div>
          ))}
        </div>
      </PageLayout>
    </>
  );
}
