import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { api, ApiError } from '../../api/client.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { useToast } from '../../hooks/useToast.js';

const STAR_RATINGS = ['1', '2', '3', '4', '5', 'Unrated / N/A'];
const GUEST_PROFILES = [
  'Solo travellers',
  'Couples',
  'Families',
  'Surf groups',
  'Mix of guest types',
];
const STAY_LENGTHS = [
  '1–2 nights',
  '3–5 nights',
  '6–10 nights',
  '11+ nights',
  'Mix',
];
const RENTAL_PREFS = [
  'Airport transfers only',
  'Daily rentals',
  'Multi-day rentals',
  'Mix of all',
];

interface DetailsForm {
  property_type: string;
  room_count: string;
  star_rating: string;
  guest_profile: string;
  avg_length_of_stay: string;
  monthly_occupancy_pct: string;
  existing_vehicle_provider: string;
  estimated_vehicles_per_month: string;
  peak_seasons: string;
  rental_type_preference: string;
  has_concierge: boolean;
  wants_printed_materials: boolean;
  notes: string;
}

const EMPTY_FORM: DetailsForm = {
  property_type: '',
  room_count: '',
  star_rating: '',
  guest_profile: '',
  avg_length_of_stay: '',
  monthly_occupancy_pct: '',
  existing_vehicle_provider: '',
  estimated_vehicles_per_month: '',
  peak_seasons: '',
  rental_type_preference: '',
  has_concierge: false,
  wants_printed_materials: false,
  notes: '',
};

const inputClass =
  'w-full rounded-xl border border-[#d1c4b0] bg-white px-4 py-2.5 text-sm font-medium text-charcoal-brand shadow-sm transition-all duration-200 focus:border-[#00577C] focus:outline-none focus:ring-2 focus:ring-[#00577C]/25';

export default function AffiliatesDetailsPage() {
  const { partnerId } = useParams<{ partnerId: string }>();
  const navigate = useNavigate();
  const { toasts, pushToast } = useToast();

  const [form, setForm] = useState<DetailsForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function setField<K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!partnerId) {
      pushToast('Missing partner reference. Please re-submit Step 1.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/partners/enroll/${encodeURIComponent(partnerId)}/details`, {
        property_type: form.property_type || null,
        room_count: form.room_count ? Number(form.room_count) : null,
        star_rating: form.star_rating || null,
        guest_profile: form.guest_profile || null,
        avg_length_of_stay: form.avg_length_of_stay || null,
        monthly_occupancy_pct: form.monthly_occupancy_pct ? Number(form.monthly_occupancy_pct) : null,
        existing_vehicle_provider: form.existing_vehicle_provider.trim() || null,
        estimated_vehicles_per_month: form.estimated_vehicles_per_month ? Number(form.estimated_vehicles_per_month) : null,
        peak_seasons: form.peak_seasons.trim() || null,
        rental_type_preference: form.rental_type_preference || null,
        has_concierge: form.has_concierge,
        wants_printed_materials: form.wants_printed_materials,
        notes: form.notes.trim() || null,
      });
      setDone(true);
      pushToast('Thanks — your details are saved!', 'success');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong.';
      pushToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <SEO title="Details saved | Lola's Rentals Affiliates" canonical="/affiliates" noIndex />
        <PageLayout title="Details saved | Lola's Rentals">
          <div className="relative mx-auto max-w-2xl px-4 pt-12">
            <div className="rounded-3xl border border-teal-brand/20 bg-white p-8 shadow-sm">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-50">
                <CheckCircle2 className="h-7 w-7 text-teal-brand" aria-hidden />
              </div>
              <h1 className="font-headline text-3xl font-extrabold text-charcoal-brand sm:text-4xl">
                All set — thanks for the extra detail!
              </h1>
              <p className="font-lato mt-3 text-[15px] leading-relaxed text-charcoal-brand/70">
                We'll be in touch within 1–2 working days to confirm terms and share your trackable
                booking link.
              </p>
              <button
                type="button"
                onClick={() => navigate('/book')}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-brand px-6 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-[#00496a]"
              >
                Back to homepage
              </button>
            </div>
          </div>
        </PageLayout>
      </>
    );
  }

  return (
    <>
      <SEO
        title="Affiliate details — Lola's Rentals"
        description="Optional Step 2: tell us a bit more about your property to fast-track your Lola's Rentals affiliate application."
        canonical="/affiliates"
        noIndex
      />
      <PageLayout title="Affiliate details (Step 2 — optional)">
        <div className="relative mx-auto max-w-3xl px-4 pt-6 pb-16">
          <button
            type="button"
            onClick={() => navigate('/affiliates')}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-charcoal-brand/15 bg-white px-3 py-1.5 text-xs font-semibold text-charcoal-brand/70 hover:bg-sand-brand/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4">
            <p className="font-headline text-base font-bold text-charcoal-brand">
              Step 2 — totally optional
            </p>
            <p className="font-lato mt-1 text-[13px] leading-relaxed text-charcoal-brand/70">
              Helps us tailor the partnership and prepare materials before our first call. Skip
              anything you'd rather not answer.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-charcoal-brand/10 bg-white p-5 shadow-sm sm:p-7 space-y-6"
          >
            <fieldset>
              <legend className="font-headline mb-3 text-base font-bold text-charcoal-brand">
                Property profile
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Property type</label>
                  <input
                    value={form.property_type}
                    onChange={(e) => setField('property_type', e.target.value)}
                    placeholder="e.g. Boutique surf hotel"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Number of rooms</label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form.room_count}
                    onChange={(e) => setField('room_count', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Star rating</label>
                  <select
                    value={form.star_rating}
                    onChange={(e) => setField('star_rating', e.target.value)}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="">Select…</option>
                    {STAR_RATINGS.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Guest profile</label>
                  <select
                    value={form.guest_profile}
                    onChange={(e) => setField('guest_profile', e.target.value)}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="">Select…</option>
                    {GUEST_PROFILES.map((g) => (<option key={g} value={g}>{g}</option>))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Avg length of stay</label>
                  <select
                    value={form.avg_length_of_stay}
                    onChange={(e) => setField('avg_length_of_stay', e.target.value)}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="">Select…</option>
                    {STAY_LENGTHS.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Monthly occupancy %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="numeric"
                    value={form.monthly_occupancy_pct}
                    onChange={(e) => setField('monthly_occupancy_pct', e.target.value)}
                    placeholder="e.g. 75"
                    className={inputClass}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="border-t border-charcoal-brand/10 pt-5">
              <legend className="font-headline mb-3 text-base font-bold text-charcoal-brand">
                Vehicle programme
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Existing vehicle provider</label>
                  <input
                    value={form.existing_vehicle_provider}
                    onChange={(e) => setField('existing_vehicle_provider', e.target.value)}
                    placeholder="None / Provider name"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Estimated vehicle bookings / month</label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form.estimated_vehicles_per_month}
                    onChange={(e) => setField('estimated_vehicles_per_month', e.target.value)}
                    placeholder="e.g. 25"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Peak seasons / months</label>
                  <input
                    value={form.peak_seasons}
                    onChange={(e) => setField('peak_seasons', e.target.value)}
                    placeholder="e.g. Sep–Nov surf season, Dec holidays"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Rental preference</label>
                  <select
                    value={form.rental_type_preference}
                    onChange={(e) => setField('rental_type_preference', e.target.value)}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="">Select…</option>
                    {RENTAL_PREFS.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </select>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-2.5 rounded-xl border border-charcoal-brand/15 bg-sand-brand/30 p-3 text-sm cursor-pointer hover:bg-sand-brand/50">
                  <input
                    type="checkbox"
                    checked={form.has_concierge}
                    onChange={(e) => setField('has_concierge', e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-charcoal-brand/30 text-teal-brand focus:ring-teal-brand"
                  />
                  <span className="text-charcoal-brand">
                    We have a dedicated concierge / front desk
                    <span className="block text-[12px] text-charcoal-brand/55 mt-0.5">Helps with on-the-spot recommendations to guests.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 rounded-xl border border-charcoal-brand/15 bg-sand-brand/30 p-3 text-sm cursor-pointer hover:bg-sand-brand/50">
                  <input
                    type="checkbox"
                    checked={form.wants_printed_materials}
                    onChange={(e) => setField('wants_printed_materials', e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-charcoal-brand/30 text-teal-brand focus:ring-teal-brand"
                  />
                  <span className="text-charcoal-brand">
                    Send printed materials (cards / posters)
                    <span className="block text-[12px] text-charcoal-brand/55 mt-0.5">We'll mail / drop them at your front desk.</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className="border-t border-charcoal-brand/10 pt-5">
              <legend className="font-headline mb-3 text-base font-bold text-charcoal-brand">
                Anything else?
              </legend>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                className={inputClass}
                placeholder="Anything that'd help our team prepare for our first call…"
              />
            </fieldset>

            <div className="flex flex-col gap-3 border-t border-charcoal-brand/10 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => navigate('/book')}
                className="rounded-xl border border-charcoal-brand/20 bg-white px-5 py-2.5 text-sm font-semibold text-charcoal-brand/70 hover:bg-sand-brand/40"
              >
                Skip for now
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-brand px-6 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-[#00496a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Saving…' : 'Submit details'}
              </button>
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
