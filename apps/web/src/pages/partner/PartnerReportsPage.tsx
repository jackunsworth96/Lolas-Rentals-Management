import { useState } from 'react';
import { usePartnerReport, usePartnerMe } from '../../api/partner-portal.js';
import { generatePartnerReportPdf } from '../../utils/partnerReportPdf.js';

function currentMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
}

function money(value: number) {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function statusLabel(status: string) {
  if (status.toLowerCase() === 'cancelled') return 'Cancelled';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(status: string) {
  if (status.toLowerCase() === 'cancelled') {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  if (status.toLowerCase() === 'unprocessed') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-gray-200 bg-gray-50 text-gray-600';
}

export default function PartnerReportsPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isLoading } = usePartnerReport(month);
  const { data: meData } = usePartnerMe();
  const partnerName = meData?.partner?.name ?? "Partner";

  function handleDownloadPdf() {
    if (!data) return;
    generatePartnerReportPdf(partnerName, month, data);
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Your attributed bookings and commission summary.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <button
            onClick={handleDownloadPdf}
            disabled={!data || isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Download PDF
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-3"><p className="text-xs text-gray-500">Total</p><p className="text-xl font-bold">{data?.totalBookings ?? 0}</p></div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3"><p className="text-xs text-green-700">Commissionable</p><p className="text-xl font-bold text-green-700">{data?.commissionableBookings ?? 0}</p></div>
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
          <p className="text-xs text-teal-700">Commission due</p>
          <p className="text-xl font-bold text-teal-700">{money(data?.totalCommission ?? 0)}</p>
          {(data?.totalPendingCommission ?? 0) > 0 && (
            <p className="mt-0.5 text-xs font-medium text-amber-600">+ {money(data?.totalPendingCommission ?? 0)} pending</p>
          )}
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><p className="text-xs text-blue-700">Avg vehicles/day</p><p className="text-xl font-bold text-blue-700">{(data?.averageVehiclesPerDay ?? 0).toFixed(2)}</p></div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr><th className="px-3 py-2 text-left">Ref</th><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Dates</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Commission</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
            {!isLoading && (data?.bookings ?? []).map((b) => {
              const isCancelled = b.status.toLowerCase() === 'cancelled';
              const returnDate = b.isExtended && b.extendedDropoffDatetime ? b.extendedDropoffDatetime : b.dropoffDatetime;
              return (
              <tr key={b.id} className={`border-t border-gray-100 ${isCancelled ? 'bg-red-50/40 text-gray-500' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs">{b.orderReference ?? '-'}</td>
                <td className="px-3 py-2">{b.customerName ?? '-'}</td>
                <td className="px-3 py-2 text-gray-500">
                  <div>{b.pickupDatetime ? new Date(b.pickupDatetime).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) : '-'}</div>
                  {returnDate && (
                    <div className="text-xs text-gray-400">
                      Return: {new Date(returnDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })}
                      {b.isExtended && (
                        <span className="ml-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Extended</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(b.status)}`}>
                    {statusLabel(b.status)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {isCancelled ? (
                    <span className="font-semibold text-red-700">Cancelled</span>
                  ) : b.commissionable ? (
                    <div>
                      <span className="font-semibold text-teal-700">{money(b.commissionAmount)}</span>
                      {b.commissionType === 'percentage' && b.commissionBase !== null && (
                        <p className="text-xs text-gray-400">{b.commissionValue ?? 0}% on {money(b.commissionBase)}</p>
                      )}
                      {b.commissionType === 'fixed' && b.commissionValue !== null && (
                        <p className="text-xs text-gray-400">{money(b.commissionValue)} fixed</p>
                      )}
                      {b.pendingCommissionAmount > 0 && (
                        <p className="mt-0.5 text-xs font-medium text-amber-600">+ {money(b.pendingCommissionAmount)} pending</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">Not eligible</span>
                  )}
                </td>
              </tr>
              );
            })}
            {!isLoading && (data?.bookings ?? []).length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No bookings for this month.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
