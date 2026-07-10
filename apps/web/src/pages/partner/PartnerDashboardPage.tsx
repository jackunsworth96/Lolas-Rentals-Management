import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { usePartnerAvailability, usePartnerMe, usePartnerReport } from '../../api/partner-portal.js';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? window.location.origin;
const PARTNER_ROOT_DOMAIN = (import.meta.env.VITE_PARTNER_ROOT_DOMAIN as string | undefined) ?? 'lolasrentals.com';

const BOOKING_TIMES = [
  '09:15', '09:45', '10:15', '10:45',
  '11:15', '11:45', '12:15', '12:45',
  '13:15', '13:45', '14:15', '14:45',
  '15:15', '15:45', '16:15', '16:45',
];

function manilaDate(offsetHours: number) {
  const d = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toManilaIso(date: string, time: string) {
  return date && time ? `${date}T${time}:00+08:00` : '';
}

function currentMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
}

function money(value: number) {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function partnerRefBookingLink(slug: string) {
  return `${SITE_URL.replace(/\/+$/, '')}/book?ref=${encodeURIComponent(slug)}`;
}

function partnerSubdomainBookingLink(subdomain: string) {
  const origin = SITE_URL.replace(/\/+$/, '');
  const url = new URL(origin);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (isLocal) return '';
  url.hostname = `${subdomain}.${PARTNER_ROOT_DOMAIN}`;
  url.pathname = '/book';
  url.search = '';
  return url.toString();
}

export default function PartnerDashboardPage() {
  const { data: me } = usePartnerMe();
  const [copied, setCopied] = useState<'booking' | 'ref' | 'link' | null>(null);
  const [pickupDate, setPickupDate] = useState(() => manilaDate(24));
  const [pickupTime, setPickupTime] = useState('09:15');
  const [dropoffDate, setDropoffDate] = useState(() => manilaDate(72));
  const [dropoffTime, setDropoffTime] = useState('16:45');
  const availability = usePartnerAvailability(toManilaIso(pickupDate, pickupTime), toManilaIso(dropoffDate, dropoffTime));
  const report = usePartnerReport(currentMonth());
  const availableModels = useMemo(() => (availability.data ?? []).filter((m) => m.availableCount > 0), [availability.data]);
  const partnerSlug = me?.partner.slug ?? '';
  const refBookingLink = partnerSlug ? partnerRefBookingLink(partnerSlug) : '';
  const subdomainBookingLink = me?.partner.portal_subdomain ? partnerSubdomainBookingLink(me.partner.portal_subdomain) : '';
  const guestBookingLink = subdomainBookingLink || refBookingLink;
  const partnerLoginLink = partnerSlug
    ? `${window.location.origin}/partner/login?partner=${encodeURIComponent(partnerSlug)}`
    : '';

  async function copyText(value: string, key: 'booking' | 'ref' | 'link') {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Hi {me?.user.name ?? 'there'}</h1>
        <p className="mt-1 text-sm text-gray-500">Check availability quickly or book for a guest at reception.</p>
        {partnerSlug && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500">Guest booking link</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <code className="min-w-0 truncate text-sm font-bold text-gray-900">{guestBookingLink}</code>
                <button
                  type="button"
                  onClick={() => copyText(guestBookingLink, 'booking')}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-white"
                  aria-label="Copy guest booking link"
                >
                  {copied === 'booking' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              {subdomainBookingLink && refBookingLink && subdomainBookingLink !== refBookingLink && (
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-gray-200 pt-2">
                  <code className="min-w-0 truncate text-xs font-medium text-gray-500">{refBookingLink}</code>
                  <button
                    type="button"
                    onClick={() => copyText(refBookingLink, 'ref')}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-white"
                    aria-label="Copy ref booking link"
                  >
                    {copied === 'ref' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500">Portal login link</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <code className="min-w-0 truncate text-sm font-bold text-gray-900">{partnerLoginLink}</code>
                <button
                  type="button"
                  onClick={() => copyText(partnerLoginLink, 'link')}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-white"
                  aria-label="Copy portal login link"
                >
                  {copied === 'link' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Pickup</label>
            <div className="flex gap-2">
              <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <select value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {BOOKING_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Return</label>
            <div className="flex gap-2">
              <input type="date" value={dropoffDate} onChange={(e) => setDropoffDate(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <select value={dropoffTime} onChange={(e) => setDropoffTime(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {BOOKING_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {availability.isLoading ? <p className="text-sm text-gray-500">Checking...</p> : availableModels.map((m) => (
            <div key={m.modelId} className="rounded-lg border border-gray-200 p-3">
              <p className="font-semibold text-gray-900">{m.modelName}</p>
              <p className="mt-1 text-sm text-teal-700">{m.availableCount} available</p>
            </div>
          ))}
          {!availability.isLoading && availableModels.length === 0 && <p className="text-sm text-gray-500">No vehicles available for this window.</p>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500">Bookings this month</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{report.data?.totalBookings ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500">Commissionable</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{report.data?.commissionableBookings ?? 0}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500">Commission due</p>
          <p className="mt-1 text-2xl font-bold text-teal-700">{money(report.data?.totalCommission ?? 0)}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500">Avg vehicles per day</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{(report.data?.averageVehiclesPerDay ?? 0).toFixed(2)}</p>
        </div>
      </section>
    </div>
  );
}
