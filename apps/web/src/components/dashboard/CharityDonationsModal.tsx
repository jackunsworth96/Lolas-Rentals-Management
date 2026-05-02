import { Modal } from '../common/Modal.js';
import { useCharityDonations, type CharityDonationRow } from '../../api/dashboard.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Manila',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function CharityDonationsModal({ open, onClose }: Props) {
  const { data: rows, isLoading, isError } = useCharityDonations(open);

  return (
    <Modal open={open} onClose={onClose} title="🐾 Charity Donations from Bookings" size="xl">
      {isLoading && (
        <p className="py-8 text-center text-sm text-gray-400">Loading transactions…</p>
      )}
      {isError && (
        <p className="py-8 text-center text-sm text-red-500">Failed to load transactions.</p>
      )}
      {rows && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">No charity donations recorded yet.</p>
      )}
      {rows && rows.length > 0 && (
        <>
          <p className="mb-4 text-xs text-gray-500">
            {rows.length} booking{rows.length !== 1 ? 's' : ''} with a charity donation · most recent first
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Order Ref</th>
                  <th className="px-4 py-3 text-right">Donation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row: CharityDonationRow) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {row.customerName ?? <span className="italic text-gray-400">Unknown</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {row.orderReference ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-teal-700">
                      {formatCurrency(row.charityDonation)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Total from bookings
                  </td>
                  <td className="px-4 py-3 text-right text-base font-bold text-teal-700">
                    {formatCurrency(rows.reduce((s, r) => s + r.charityDonation, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
