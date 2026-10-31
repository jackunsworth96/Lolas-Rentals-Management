import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { Badge } from '../common/Badge.js';
import {
  useCreateInvoice,
  useInvoice,
  useInvoiceOrderSearch,
  useInvoicePreview,
  useRefreshInvoice,
  useUpdateInvoice,
  useVoidInvoice,
  fetchInvoiceSettings,
  type Invoice,
  type InvoiceLine,
  type InvoiceOrderStage,
} from '../../api/invoices.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import { generateInvoicePdf } from '../../utils/invoicePdf.js';

interface InvoiceBuilderModalProps {
  open: boolean;
  onClose: () => void;
  /** Opens an existing invoice; omit to create a new one. */
  invoiceId?: string | null;
  /** Bookings to pre-fill a new invoice with. */
  initialOrderReferences?: string[];
  onSaved?: (invoice: Invoice) => void;
}

const STAGE_BADGE: Record<InvoiceOrderStage, { label: string; color: 'blue' | 'green' | 'gray' | 'red' }> = {
  inbox: { label: 'Inbox', color: 'blue' },
  active: { label: 'Active', color: 'green' },
  completed: { label: 'Completed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

function StageBadge({ stage }: { stage: InvoiceOrderStage }) {
  const s = STAGE_BADGE[stage];
  return <Badge color={s.color}>{s.label}</Badge>;
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short' });
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-gray-50';

interface BillToState {
  billToName: string;
  billToCompany: string;
  billToAddress: string;
  billToEmail: string;
  billToTin: string;
}

const EMPTY_BILL_TO: BillToState = { billToName: '', billToCompany: '', billToAddress: '', billToEmail: '', billToTin: '' };

export function InvoiceBuilderModal({ open, onClose, invoiceId, initialOrderReferences, onSaved }: InvoiceBuilderModalProps) {
  const [currentId, setCurrentId] = useState<string | null>(invoiceId ?? null);
  const { data: invoice, isLoading: invoiceLoading } = useInvoice(currentId);

  const [refs, setRefs] = useState<string[]>(() => [...new Set(initialOrderReferences ?? [])]);
  const [billTo, setBillTo] = useState<BillToState>(EMPTY_BILL_TO);
  const [issueDate, setIssueDate] = useState(manilaToday());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [billToTouched, setBillToTouched] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!invoice || hydratedId === invoice.id) return;
    setRefs(invoice.orderReferences);
    setBillTo({
      billToName: invoice.billToName,
      billToCompany: invoice.billToCompany ?? '',
      billToAddress: invoice.billToAddress ?? '',
      billToEmail: invoice.billToEmail ?? '',
      billToTin: invoice.billToTin ?? '',
    });
    setIssueDate(invoice.issueDate);
    setDueDate(invoice.dueDate ?? '');
    setNotes(invoice.notes ?? '');
    setBillToTouched(true);
    setHydratedId(invoice.id);
  }, [invoice, hydratedId]);

  const isExisting = !!currentId;
  const isVoid = invoice?.status === 'void';
  const refsChanged = !invoice || refs.join('|') !== invoice.orderReferences.join('|');

  const { data: preview, isFetching: previewLoading, error: previewError } = useInvoicePreview(refs, open && (!isExisting || !!invoice));
  const debouncedSearch = useDebounced(search);
  const { data: searchResults, isFetching: searching } = useInvoiceOrderSearch(debouncedSearch);

  // Pre-fill "Bill to" from the first booking until staff edit it.
  useEffect(() => {
    if (billToTouched || !preview?.orders.length) return;
    const first = preview.orders[0];
    setBillTo((b) => ({
      ...b,
      billToName: first.customerName ?? '',
      billToCompany: first.customerCompany ?? '',
      billToEmail: first.customerEmail ?? '',
    }));
  }, [preview, billToTouched]);

  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const refreshInvoice = useRefreshInvoice();
  const voidInvoice = useVoidInvoice();
  const saving = createInvoice.isPending || updateInvoice.isPending;

  const summaries = useMemo(() => new Map((preview?.orders ?? []).map((o) => [o.orderReference, o])), [preview]);

  // Saved invoices show their stored snapshot until the set of bookings changes.
  const shownLines: InvoiceLine[] = invoice && !refsChanged ? invoice.lines : (preview?.orders ?? []).flatMap((o) => o.lines);
  const totals = invoice && !refsChanged
    ? invoice
    : preview ?? { subtotal: 0, amountPaid: 0, balanceDue: 0, depositHeld: 0 };

  function setField<K extends keyof BillToState>(key: K, value: string) {
    setBillToTouched(true);
    setBillTo((b) => ({ ...b, [key]: value }));
  }

  function addRef(ref: string) {
    setRefs((r) => (r.includes(ref) ? r : [...r, ref]));
    setSearch('');
  }

  function removeRef(ref: string) {
    setRefs((r) => r.filter((x) => x !== ref));
  }

  async function download(inv: Invoice) {
    setDownloading(true);
    try {
      const settings = await fetchInvoiceSettings();
      await generateInvoicePdf(inv, settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PDF');
    } finally {
      setDownloading(false);
    }
  }

  async function save(andDownload: boolean) {
    setError('');
    if (refs.length === 0) { setError('Add at least one booking'); return; }
    if (!billTo.billToName.trim()) { setError('Enter who the invoice is billed to'); return; }
    if (preview?.missing.length) { setError(`Booking not found: ${preview.missing.join(', ')}`); return; }
    const body = {
      billToName: billTo.billToName.trim(),
      billToCompany: billTo.billToCompany || null,
      billToAddress: billTo.billToAddress || null,
      billToEmail: billTo.billToEmail || null,
      billToTin: billTo.billToTin || null,
      issueDate,
      dueDate: dueDate || null,
      notes: notes || null,
    };
    try {
      const saved = currentId
        ? await updateInvoice.mutateAsync({ id: currentId, ...body, ...(refsChanged ? { orderReferences: refs } : {}) })
        : await createInvoice.mutateAsync({ ...body, orderReferences: refs });
      setCurrentId(saved.id);
      setHydratedId(saved.id);
      onSaved?.(saved);
      if (andDownload) await download(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the invoice');
    }
  }

  async function refresh() {
    if (!currentId) return;
    setError('');
    try {
      await refreshInvoice.mutateAsync(currentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh the invoice');
    }
  }

  async function markVoid() {
    if (!currentId || !window.confirm('Void this invoice? It will stay on record but can no longer be edited.')) return;
    setError('');
    try {
      await voidInvoice.mutateAsync(currentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not void the invoice');
    }
  }

  const title = invoice ? `Invoice ${invoice.invoiceNumber}${isVoid ? ' (void)' : ''}` : 'Create invoice';
  const resultList = (searchResults ?? []).filter((r) => !refs.includes(r.orderReference));

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {isExisting && invoiceLoading ? (
        <p className="py-10 text-center text-sm text-gray-500">Loading invoice…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Bookings ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Bookings on this invoice</h3>
            {!isVoid && (
              <div className="relative">
                <input
                  className={inputCls}
                  placeholder="Search by name, email, mobile or order ref…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {searching && resultList.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">Searching…</p>}
                    {!searching && resultList.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">No matching bookings</p>}
                    {resultList.map((r) => (
                      <button
                        key={`${r.stage}-${r.orderReference}`}
                        type="button"
                        onClick={() => addRef(r.orderReference)}
                        className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-0 hover:bg-teal-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900">{r.customerName ?? '—'}</span>
                          <span className="block truncate text-xs text-gray-500">
                            {r.orderReference}
                            {r.pickupDatetime ? ` · ${shortDate(r.pickupDatetime)} – ${shortDate(r.dropoffDatetime)}` : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {r.total != null && <span className="text-xs text-gray-600">{formatCurrency(r.total)}</span>}
                          <StageBadge stage={r.stage} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {refs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500">
                Search above to add bookings from the inbox, active or completed orders.
              </p>
            ) : (
              <ul className="space-y-2">
                {refs.map((ref) => {
                  const s = summaries.get(ref);
                  const missing = preview?.missing.includes(ref);
                  return (
                    <li key={ref} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${missing ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{s?.customerName ?? ref}</p>
                        <p className="truncate text-xs text-gray-500">
                          {ref}
                          {s?.pickupDatetime ? ` · ${shortDate(s.pickupDatetime)} – ${shortDate(s.dropoffDatetime)}` : ''}
                          {missing ? ' · not found' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {s && <span className="text-xs text-gray-600">{formatCurrency(s.charges)}</span>}
                        {s && <StageBadge stage={s.stage} />}
                        {!isVoid && (
                          <button type="button" onClick={() => removeRef(ref)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600" aria-label={`Remove ${ref}`}>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <h3 className="pt-2 text-sm font-semibold text-gray-900">Bill to</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={inputCls} placeholder="Name *" value={billTo.billToName} disabled={isVoid} onChange={(e) => setField('billToName', e.target.value)} />
              <input className={inputCls} placeholder="Company (optional)" value={billTo.billToCompany} disabled={isVoid} onChange={(e) => setField('billToCompany', e.target.value)} />
              <input className={inputCls} placeholder="Email" value={billTo.billToEmail} disabled={isVoid} onChange={(e) => setField('billToEmail', e.target.value)} />
              <input className={inputCls} placeholder="TIN (optional)" value={billTo.billToTin} disabled={isVoid} onChange={(e) => setField('billToTin', e.target.value)} />
              <textarea className={`${inputCls} sm:col-span-2`} rows={2} placeholder="Billing address (optional)" value={billTo.billToAddress} disabled={isVoid} onChange={(e) => setField('billToAddress', e.target.value)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-gray-600">
                Issue date
                <input type="date" className={`${inputCls} mt-1`} value={issueDate} disabled={isVoid} onChange={(e) => setIssueDate(e.target.value)} />
              </label>
              <label className="text-xs text-gray-600">
                Due date (optional)
                <input type="date" className={`${inputCls} mt-1`} value={dueDate} disabled={isVoid} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            </div>
            <textarea className={inputCls} rows={2} placeholder="Notes shown on the invoice (optional)" value={notes} disabled={isVoid} onChange={(e) => setNotes(e.target.value)} />
          </section>

          {/* ── Preview ────────────────────────────────────────────── */}
          <section className="flex flex-col rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Preview</h3>
              {previewLoading && <span className="text-xs text-gray-400">Updating…</span>}
            </div>
            {invoice && !refsChanged && (
              <p className="mb-2 text-xs text-gray-500">
                Saved figures as of {new Date(invoice.lastRefreshedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}.
                {!isVoid && ' Use “Refresh from orders” to pick up new payments or changes.'}
              </p>
            )}
            {previewError && <p className="mb-2 text-xs text-red-600">{(previewError as Error).message}</p>}
            <div className="max-h-[420px] flex-1 space-y-3 overflow-y-auto">
              {refs.map((ref) => {
                const lines = shownLines.filter((l) => l.orderReference === ref);
                if (lines.length === 0) return null;
                return (
                  <div key={ref}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Booking {ref}</p>
                    <table className="w-full text-sm">
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={i} className={l.lineType === 'payment' ? 'text-teal-700' : 'text-gray-700'}>
                            <td className="py-0.5 pr-2">{l.description}</td>
                            <td className="whitespace-nowrap py-0.5 text-right">{formatCurrency(l.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {refs.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Lines appear here once you add a booking.</p>}
            </div>
            <dl className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-sm">
              <div className="flex justify-between text-gray-600"><dt>Subtotal</dt><dd>{formatCurrency(totals.subtotal)}</dd></div>
              <div className="flex justify-between text-gray-600"><dt>Amount paid</dt><dd>-{formatCurrency(totals.amountPaid)}</dd></div>
              <div className="flex justify-between text-base font-semibold text-gray-900">
                <dt>{totals.balanceDue < 0 ? 'Credit' : 'Balance due'}</dt>
                <dd>{formatCurrency(Math.abs(totals.balanceDue))}</dd>
              </div>
              {totals.depositHeld > 0 && (
                <p className="text-xs italic text-gray-500">Refundable deposit held: {formatCurrency(totals.depositHeld)} (not included above)</p>
              )}
            </dl>
          </section>
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4">
        <div className="flex gap-2">
          {invoice && !isVoid && (
            <>
              <Button variant="secondary" size="sm" onClick={refresh} loading={refreshInvoice.isPending}>Refresh from orders</Button>
              <Button variant="ghost" size="sm" onClick={markVoid} loading={voidInvoice.isPending} className="text-red-600">Void</Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {invoice && (isVoid || (!refsChanged && hydratedId === invoice.id)) && (
            <Button variant="secondary" onClick={() => download(invoice)} loading={downloading}>Download PDF</Button>
          )}
          {!isVoid && (
            <>
              <Button variant="secondary" onClick={() => save(false)} loading={saving && !downloading}>Save</Button>
              <Button onClick={() => save(true)} loading={saving || downloading}>Save &amp; download PDF</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
