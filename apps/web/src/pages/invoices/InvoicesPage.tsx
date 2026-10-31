import { useState } from 'react';
import { Table } from '../../components/common/Table.js';
import { Button } from '../../components/common/Button.js';
import { Badge } from '../../components/common/Badge.js';
import { InvoiceBuilderModal } from '../../components/invoices/InvoiceBuilderModal.js';
import { useInvoices, fetchInvoiceSettings, type Invoice } from '../../api/invoices.js';
import { formatCurrency } from '../../utils/currency.js';
import { generateInvoicePdf } from '../../utils/invoicePdf.js';

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InvoicesPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'issued' | 'void'>('');
  const { data: invoices = [], isLoading, error } = useInvoices({ q, status: status || undefined });
  const [builder, setBuilder] = useState<{ invoiceId: string | null } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function download(inv: Invoice) {
    setDownloadingId(inv.id);
    try {
      await generateInvoicePdf(inv, await fetchInvoiceSettings());
    } finally {
      setDownloadingId(null);
    }
  }

  const columns = [
    { key: 'invoiceNumber', header: 'Invoice', render: (r: Invoice) => <span className="font-medium">{r.invoiceNumber}</span> },
    { key: 'issueDate', header: 'Issued', render: (r: Invoice) => fmtDate(r.issueDate) },
    {
      key: 'billTo',
      header: 'Bill to',
      cellClassName: 'whitespace-normal',
      render: (r: Invoice) => (
        <div>
          <p>{r.billToCompany ?? r.billToName}</p>
          {r.billToCompany && <p className="text-xs text-gray-500">{r.billToName}</p>}
        </div>
      ),
    },
    {
      key: 'orders',
      header: 'Bookings',
      cellClassName: 'whitespace-normal text-xs text-gray-600',
      render: (r: Invoice) => r.orderReferences.join(', '),
    },
    { key: 'subtotal', header: 'Total', className: 'text-right', render: (r: Invoice) => formatCurrency(r.subtotal) },
    { key: 'balanceDue', header: 'Balance', className: 'text-right', render: (r: Invoice) => formatCurrency(r.balanceDue) },
    {
      key: 'status',
      header: 'Status',
      render: (r: Invoice) => r.status === 'void'
        ? <Badge color="red">Void</Badge>
        : r.balanceDue <= 0 ? <Badge color="green">Paid</Badge> : <Badge color="amber">Balance due</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (r: Invoice) => (
        <Button
          size="sm"
          variant="secondary"
          loading={downloadingId === r.id}
          onClick={(e) => { e.stopPropagation(); void download(r); }}
        >
          PDF
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500">Group one or more bookings into an invoice and download it as a PDF.</p>
        </div>
        <Button onClick={() => setBuilder({ invoiceId: null })}>New invoice</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          placeholder="Search invoice no., bill to or booking ref…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | 'issued' | 'void')}
        >
          <option value="">All statuses</option>
          <option value="issued">Issued</option>
          <option value="void">Void</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-gray-500">Loading invoices…</p>
      ) : (
        <Table
          columns={columns}
          data={invoices}
          keyFn={(r) => r.id}
          onRowClick={(r) => setBuilder({ invoiceId: r.id })}
          getRowClassName={(r) => (r.status === 'void' ? 'text-gray-400 hover:bg-gray-50' : '')}
          emptyMessage="No invoices yet"
        />
      )}

      {builder && (
        <InvoiceBuilderModal open onClose={() => setBuilder(null)} invoiceId={builder.invoiceId} />
      )}
    </div>
  );
}
