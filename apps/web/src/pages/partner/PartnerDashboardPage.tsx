import { useMemo, useState } from 'react';
import { usePartnerAvailability, usePartnerMe, usePartnerReport } from '../../api/partner-portal.js';

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

export default function PartnerDashboardPage() {
  const { data: me } = usePartnerMe();
  const [pickupDate, setPickupDate] = useState(() => manilaDate(24));
  const [pickupTime, setPickupTime] = useState('09:15');
  const [dropoffDate, setDropoffDate] = useState(() => manilaDate(72));
  const [dropoffTime, setDropoffTime] = useState('16:45');
  const availability = usePartnerAvailability(toManilaIso(pickupDate, pickupTime), toManilaIso(dropoffDate, dropoffTime));
  const report = usePartnerReport(currentMonth());
  const availableModels = useMemo(() => (availability.data ?? []).filter((m) => m.availableCount > 0), [availability.data]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Hi {me?.user.name ?? 'there'}</h1>
        <p className="mt-1 text-sm text-gray-500">Check availability quickly or book for a guest at reception.</p>
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

      <section className="grid gap-3 sm:grid-cols-3">
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
      </section>
    </div>
  );
}
