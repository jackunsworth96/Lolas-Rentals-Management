import { formatCurrency } from '../../utils/currency.js';
import type { OrderHistoryEvent, OrderPayment } from './useOrderDetail.js';

interface OrderDetailExtensionsTabProps {
  history: OrderHistoryEvent[];
  payments: OrderPayment[];
  paymentMethods?: Array<{ id: string; name: string }>;
}

type ExtensionStatus = 'paid' | 'unpaid' | 'absorbed';

type ParsedExtension = {
  timestamp: string;
  transactionDate: string | null;
  amount: number;
  status: ExtensionStatus;
  oldDropoff: string | null;
  newDropoff: string | null;
  method: string | null;
  settlementRef: string | null;
};

function deriveStatus(settlementStatus: string | null | undefined): ExtensionStatus {
  if (settlementStatus === 'pending') return 'unpaid';
  if (settlementStatus === 'absorbed') return 'absorbed';
  return 'paid';
}

function parseDropoffs(settlementRef: string | null | undefined): { old: string | null; next: string | null } {
  if (!settlementRef) return { old: null, next: null };
  const match = settlementRef.match(/Extension:\s*(.+?)\s*→\s*(.+)$/);
  if (!match) return { old: null, next: null };
  return { old: match[1].trim(), next: match[2].trim() };
}

function formatTimestamp(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: ExtensionStatus): string {
  if (status === 'paid') return 'Paid';
  if (status === 'absorbed') return 'Paid via Settlement';
  return 'Unpaid';
}

function statusClass(status: ExtensionStatus): string {
  if (status === 'paid') return 'bg-green-100 text-green-700';
  if (status === 'absorbed') return 'bg-blue-100 text-blue-700';
  return 'bg-gold-brand/20 text-gold-brand';
}

export function OrderDetailExtensionsTab({ history, payments, paymentMethods = [] }: OrderDetailExtensionsTabProps) {
  const methodLookup = new Map(paymentMethods.map((pm) => [pm.id, pm.name]));

  // Drive display from the authoritative payments table. History is used only
  // as a fallback for legacy events without a matching payments row (shouldn't
  // happen in normal flows).
  const extensionPayments = payments.filter((p) => p.paymentType === 'extension');

  const extensions: ParsedExtension[] = extensionPayments.length > 0
    ? extensionPayments
        .map<ParsedExtension>((p) => {
          const dropoffs = parseDropoffs(p.settlementRef ?? null);
          const status = deriveStatus(p.settlementStatus ?? null);
          const methodLabel = (() => {
            if (status === 'unpaid') return null;
            if (!p.paymentMethodId) return null;
            if (p.paymentMethodId === 'pending') return null;
            return methodLookup.get(p.paymentMethodId) ?? p.paymentMethodId;
          })();
          return {
            timestamp: p.transactionDate ?? '',
            transactionDate: p.transactionDate ?? null,
            amount: p.amount ?? 0,
            status,
            oldDropoff: dropoffs.old,
            newDropoff: dropoffs.next,
            method: methodLabel,
            settlementRef: p.settlementRef ?? null,
          };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    : // Fallback — parse from history if no payments prop available.
      history
        .filter((e) => e.type === 'extension')
        .map<ParsedExtension>((evt) => {
          const detail = evt.detail ?? '';
          const status: ExtensionStatus = detail.startsWith('Unpaid')
            ? 'unpaid'
            : detail.startsWith('Paid via settlement')
              ? 'absorbed'
              : 'paid';
          const dropoffs = parseDropoffs(detail.replace(/^.*?Extension:/, 'Extension:'));
          return {
            timestamp: evt.timestamp,
            transactionDate: evt.timestamp,
            amount: evt.amount ?? 0,
            status,
            oldDropoff: dropoffs.old,
            newDropoff: dropoffs.next,
            method: null,
            settlementRef: detail || null,
          };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (extensions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-charcoal-brand/70">No extensions yet</p>
        <p className="mt-1 text-xs text-charcoal-brand/50">
          When the customer extends their rental (via the website or backoffice), it&apos;ll show up here.
        </p>
      </div>
    );
  }

  const totalExtensionCharges = extensions.reduce((sum, e) => sum + e.amount, 0);
  const unpaidTotal = extensions
    .filter((e) => e.status === 'unpaid')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-sand-brand/50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-teal-brand/60">Extensions</p>
          <p className="mt-1 text-lg font-black text-teal-brand">{extensions.length}</p>
        </div>
        <div className="rounded-xl bg-sand-brand/50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-teal-brand/60">Total Charges</p>
          <p className="mt-1 text-lg font-black text-teal-brand">{formatCurrency(totalExtensionCharges)}</p>
        </div>
        <div className="rounded-xl bg-sand-brand/50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-gold-brand/80">Unpaid</p>
          <p className={`mt-1 text-lg font-black ${unpaidTotal > 0 ? 'text-gold-brand' : 'text-charcoal-brand/40'}`}>
            {formatCurrency(unpaidTotal)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
        {extensions.map((ext, idx) => (
          <div key={idx} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-charcoal-brand">
                  {ext.oldDropoff && ext.newDropoff
                    ? `${ext.oldDropoff} → ${ext.newDropoff}`
                    : 'Rental extended'}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass(ext.status)}`}>
                  {statusLabel(ext.status)}
                </span>
                {ext.method && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                    {ext.method}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-charcoal-brand/60">
                {ext.status === 'unpaid' ? 'Logged' : 'Collected'} {formatTimestamp(ext.timestamp)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-black text-teal-brand">{formatCurrency(ext.amount)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
