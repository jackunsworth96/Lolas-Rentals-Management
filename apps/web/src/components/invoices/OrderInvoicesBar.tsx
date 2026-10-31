import { useState } from 'react';
import { useOrderInvoices } from '../../api/invoices.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { formatCurrency } from '../../utils/currency.js';
import { InvoiceBuilderModal } from './InvoiceBuilderModal.js';

interface OrderInvoicesBarProps {
  /** Booking reference (`orders_raw.order_reference` / `orders.booking_token`), or the record id when there is none. */
  orderReference: string | null | undefined;
}

/** Invoice shortcuts for an order modal: existing invoices for the booking plus "Create invoice". */
export function OrderInvoicesBar({ orderReference }: OrderInvoicesBarProps) {
  const canManage = useAuthStore((s) => s.hasPermission('can_manage_invoices'));
  const { data: invoices = [] } = useOrderInvoices(orderReference, canManage);
  const [builder, setBuilder] = useState<{ invoiceId: string | null } | null>(null);

  if (!canManage || !orderReference) return null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
        <span className="font-semibold text-gray-600">Invoices</span>
        {invoices.length === 0 && <span className="text-gray-400">None yet</span>}
        {invoices.map((inv) => (
          <button
            key={inv.id}
            type="button"
            onClick={() => setBuilder({ invoiceId: inv.id })}
            className={`rounded-full border px-2.5 py-0.5 font-medium transition hover:bg-white ${inv.status === 'void' ? 'border-gray-300 text-gray-400 line-through' : 'border-teal-300 text-teal-700'}`}
            title={`${inv.billToCompany ?? inv.billToName} · balance ${formatCurrency(inv.balanceDue)}`}
          >
            {inv.invoiceNumber}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setBuilder({ invoiceId: null })}
          className="ml-auto rounded-lg border border-teal-brand bg-white px-3 py-1 font-semibold text-teal-brand transition hover:bg-teal-50"
        >
          Create invoice
        </button>
      </div>

      {builder && (
        <InvoiceBuilderModal
          open
          onClose={() => setBuilder(null)}
          invoiceId={builder.invoiceId}
          initialOrderReferences={[orderReference]}
        />
      )}
    </>
  );
}
