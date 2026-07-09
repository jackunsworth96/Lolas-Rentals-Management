import { useState } from 'react';
import { usePartnerReport } from '../../api/partner-portal.js';

function currentMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
}

function money(value: number) {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

export default function PartnerReportsPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isLoading } = usePartnerReport(month);

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Your attributed bookings and commission summary.</p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-3"><p className="text-xs text-gray-500">Total</p><p className="text-xl font-bold">{data?.totalBookings ?? 0}</p></div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3"><p className="text-xs text-green-700">Commissionable</p><p className="text-xl font-bold text-green-700">{data?.commissionableBookings ?? 0}</p></div>
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3"><p className="text-xs text-teal-700">Due</p><p className="text-xl font-bold text-teal-700">{money(data?.totalCommission ?? 0)}</p></div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr><th className="px-3 py-2 text-left">Ref</th><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Pickup</th><th className="px-3 py-2 text-right">Commission</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
            {!isLoading && (data?.bookings ?? []).map((b) => (
              <tr key={b.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-mono text-xs">{b.orderReference ?? '-'}</td>
                <td className="px-3 py-2">{b.customerName ?? '-'}</td>
                <td className="px-3 py-2 text-gray-500">{b.pickupDatetime ? new Date(b.pickupDatetime).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) : '-'}</td>
                <td className="px-3 py-2 text-right">{b.commissionable ? money(b.commissionAmount) : <span className="text-gray-400">Not eligible</span>}</td>
              </tr>
            ))}
            {!isLoading && (data?.bookings ?? []).length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">No bookings for this month.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
