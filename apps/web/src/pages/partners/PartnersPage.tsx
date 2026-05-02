import { useState, useCallback } from 'react';
import { Link2, Plus, Pencil, BarChart2, ToggleLeft, ToggleRight, Copy, CheckCheck, ExternalLink, Send } from 'lucide-react';
import {
  usePartners,
  useCreatePartner,
  useUpdatePartner,
  useDeletePartner,
  usePartnerStats,
  useSendMonthlyReport,
  type AccommodationPartner,
  type PartnerInput,
} from '../../api/partners.js';
import { useUIStore } from '../../stores/ui-store.js';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import { useToast } from '../../hooks/useToast.js';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? window.location.origin;

function partnerLink(slug: string) {
  return `${SITE_URL}/book?ref=${encodeURIComponent(slug)}`;
}

function formatPhp(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function currentMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
}

function monthLabel(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

// ── Partner form modal ──────────────────────────────────────────────────────

interface PartnerFormModalProps {
  open: boolean;
  onClose: () => void;
  editing: AccommodationPartner | null;
  defaultStoreId: string;
  pushToast: (msg: string, type: 'success' | 'error') => void;
}

const EMPTY_FORM = {
  name: '',
  slug: '',
  contact_name: '',
  contact_email: '',
  contact_whatsapp: '',
  commission_type: 'fixed' as 'fixed' | 'percentage',
  commission_value: 0,
  advance_booking_days: 7,
  commission_includes_extensions: false,
  telegram_chat_id: '',
  notes: '',
};

function PartnerFormModal({ open, onClose, editing, defaultStoreId, pushToast }: PartnerFormModalProps) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();

  const isEdit = !!editing;

  const resetForm = useCallback(() => {
    if (editing) {
      setForm({
        name: editing.name,
        slug: editing.slug,
        contact_name: editing.contact_name ?? '',
        contact_email: editing.contact_email ?? '',
        contact_whatsapp: editing.contact_whatsapp ?? '',
        commission_type: editing.commission_type,
        commission_value: editing.commission_value,
        advance_booking_days: editing.advance_booking_days,
        commission_includes_extensions: editing.commission_includes_extensions ?? false,
        telegram_chat_id: editing.telegram_chat_id ?? '',
        notes: editing.notes ?? '',
      });
      setSlugManuallyEdited(true);
    } else {
      setForm({ ...EMPTY_FORM });
      setSlugManuallyEdited(false);
    }
  }, [editing]);

  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) resetForm();
  }

  function autoSlug(name: string) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, value: typeof EMPTY_FORM[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'name' && !slugManuallyEdited) {
        next.slug = autoSlug(value as string);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: PartnerInput = {
      store_id: editing?.store_id ?? defaultStoreId,
      name: form.name.trim(),
      slug: form.slug.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_whatsapp: form.contact_whatsapp.trim() || null,
      commission_type: form.commission_type,
      commission_value: Number(form.commission_value),
      advance_booking_days: Number(form.advance_booking_days),
      commission_includes_extensions: form.commission_includes_extensions,
      active: editing?.active ?? true,
      notes: form.notes.trim() || null,
      telegram_chat_id: form.telegram_chat_id.trim() || null,
    };
    try {
      if (isEdit && editing) {
        await updatePartner.mutateAsync({ id: editing.id, ...payload });
        pushToast('Partner updated', 'success');
      } else {
        await createPartner.mutateAsync(payload);
        pushToast('Partner added', 'success');
      }
      onClose();
    } catch (err) {
      pushToast((err as Error).message ?? 'Failed to save partner', 'error');
    }
  }

  const saving = createPartner.isPending || updatePartner.isPending;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Partner' : 'Add Accommodation Partner'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Property name *</label>
            <input
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Harana Surf Resort"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Link slug *
              <span className="ml-1 text-xs text-gray-400">(used in tracking URL — lowercase, hyphens only)</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-gray-400">/book?ref=</span>
              <input
                required
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                }}
                placeholder="harana-surf-resort"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact name</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.contact_name}
              onChange={(e) => setField('contact_name', e.target.value)}
              placeholder="Front desk manager"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.contact_whatsapp}
              onChange={(e) => setField('contact_whatsapp', e.target.value)}
              placeholder="+63 9XX XXX XXXX"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.contact_email}
              onChange={(e) => setField('contact_email', e.target.value)}
              placeholder="manager@example.com"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telegram chat ID
              <span className="ml-1 text-xs text-gray-400">(for automated monthly commission reports)</span>
            </label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.telegram_chat_id}
              onChange={(e) => setField('telegram_chat_id', e.target.value)}
              placeholder="e.g. 123456789"
            />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="mb-3 text-sm font-medium text-gray-700">Commission terms</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.commission_type}
                onChange={(e) => setField('commission_type', e.target.value as 'fixed' | 'percentage')}
              >
                <option value="fixed">Fixed (₱)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {form.commission_type === 'percentage' ? 'Rate (%)' : 'Amount (₱)'}
              </label>
              <input
                type="number"
                min="0"
                step={form.commission_type === 'percentage' ? '0.1' : '1'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.commission_value}
                onChange={(e) => setField('commission_value', Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Advance booking (days)</label>
              <input
                type="number"
                min="0"
                max="365"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.advance_booking_days}
                onChange={(e) => setField('advance_booking_days', Number(e.target.value))}
              />
            </div>
          </div>

          {form.commission_type === 'percentage' && (
            <p className="mt-2 text-xs text-gray-400">
              Percentage applies to the rental value only — add-ons, charity donations, card fees, and transfer charges are excluded.
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            Commission only applies when pickup is ≥ {form.advance_booking_days} day{form.advance_booking_days !== 1 ? 's' : ''} after the booking date.
          </p>

          <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              checked={form.commission_includes_extensions}
              onChange={(e) => setField('commission_includes_extensions', e.target.checked)}
            />
            <span className="text-sm text-gray-700">
              Include commission on rental extension value
              <span className="block text-xs text-gray-400 mt-0.5">
                When enabled, the commission base increases to include any rental extension added after the original booking.
              </span>
            </span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="Any agreement details, renewal dates, etc."
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add partner'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Partner detail slide panel ──────────────────────────────────────────────

interface PartnerDetailPanelProps {
  partner: AccommodationPartner;
  onEdit: () => void;
  onClose: () => void;
  pushToast: (msg: string, type: 'success' | 'error') => void;
}

function PartnerDetailPanel({ partner, onEdit, onClose, pushToast }: PartnerDetailPanelProps) {
  const [month, setMonth] = useState(currentMonth());
  const [copied, setCopied] = useState(false);
  const deletePartner = useDeletePartner();
  const updatePartner = useUpdatePartner();
  const sendReport = useSendMonthlyReport();

  const { data: stats, isLoading: statsLoading } = usePartnerStats(partner.id, month);

  const link = partnerLink(partner.slug);

  function handleCopy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleToggleActive() {
    try {
      if (partner.active) {
        await deletePartner.mutateAsync(partner.id);
        pushToast('Partner deactivated', 'success');
      } else {
        await updatePartner.mutateAsync({ id: partner.id, active: true });
        pushToast('Partner activated', 'success');
      }
    } catch (err) {
      pushToast((err as Error).message ?? 'Failed to update partner', 'error');
    }
  }

  async function handleSendReport() {
    try {
      const result = await sendReport.mutateAsync({ id: partner.id, month });
      pushToast(
        `Report sent for ${monthLabel(month)} — ${result.commissionableBookings} commissionable booking(s), ${formatPhp(result.totalCommission)} due`,
        'success',
      );
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('NO_TELEGRAM') || msg.includes('No Telegram')) {
        pushToast('No Telegram chat ID configured for this partner', 'error');
      } else {
        pushToast(msg || 'Failed to send report', 'error');
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{partner.name}</h2>
            <Badge color={partner.active ? 'green' : 'gray'}>{partner.active ? 'Active' : 'Inactive'}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">Added {formatDate(partner.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            onClick={handleToggleActive}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              partner.active
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-green-200 text-green-600 hover:bg-green-50'
            }`}
          >
            {partner.active
              ? <><ToggleRight className="h-3.5 w-3.5" /> Deactivate</>
              : <><ToggleLeft className="h-3.5 w-3.5" /> Activate</>}
          </button>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* Trackable link */}
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-700 flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Trackable booking link
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              className="flex-1 min-w-0 rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs text-gray-700 font-mono"
            />
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700"
            >
              {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-lg border border-teal-200 bg-white p-2 text-teal-600 hover:bg-teal-50"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="mt-2 text-xs text-teal-600">
            Share with {partner.name} — they pass this to incoming guests via email, WhatsApp, or booking confirmation.
          </p>
        </div>

        {/* Commission info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-400 mb-0.5">Commission</p>
            <p className="text-sm font-semibold text-gray-900">
              {partner.commission_type === 'percentage'
                ? `${partner.commission_value}% of rental value`
                : `${formatPhp(partner.commission_value)} per booking`}
            </p>
            {partner.commission_type === 'percentage' && (
              <p className="text-xs text-gray-400 mt-0.5">
                {partner.commission_includes_extensions
                  ? 'Includes extension value'
                  : 'Rental base only (excl. add-ons, fees, charity)'}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-400 mb-0.5">Advance booking rule</p>
            <p className="text-sm font-semibold text-gray-900">
              ≥ {partner.advance_booking_days} day{partner.advance_booking_days !== 1 ? 's' : ''} ahead
            </p>
          </div>
          {partner.contact_name && (
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-400 mb-0.5">Contact</p>
              <p className="text-sm font-medium text-gray-900">{partner.contact_name}</p>
              {partner.contact_whatsapp && (
                <p className="text-xs text-gray-500">{partner.contact_whatsapp}</p>
              )}
            </div>
          )}
          {partner.contact_email && (
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-400 mb-0.5">Email</p>
              <a href={`mailto:${partner.contact_email}`} className="text-sm font-medium text-teal-600 hover:underline break-all">
                {partner.contact_email}
              </a>
            </div>
          )}
        </div>

        {partner.notes && (
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-400 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{partner.notes}</p>
          </div>
        )}

        {/* Stats + monthly report */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <BarChart2 className="h-4 w-4 text-gray-400" /> Attributed bookings
            </p>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleSendReport}
                disabled={sendReport.isPending || !partner.telegram_chat_id}
                title={partner.telegram_chat_id ? 'Send monthly report via Telegram' : 'No Telegram chat ID configured'}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  partner.telegram_chat_id
                    ? 'border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50'
                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Send className="h-3 w-3" />
                {sendReport.isPending ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </div>

          {!partner.telegram_chat_id && (
            <p className="mb-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
              Add a Telegram chat ID in Edit to enable automatic monthly report sending.
            </p>
          )}

          {statsLoading ? (
            <div className="rounded-lg border border-gray-200 p-4 text-center text-sm text-gray-400">Loading…</div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg border border-gray-200 p-3 text-center">
                  <p className="text-xs text-gray-400">Total</p>
                  <p className="text-xl font-bold text-gray-900">{stats.totalBookings}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-xs text-green-600">Commissionable</p>
                  <p className="text-xl font-bold text-green-700">{stats.commissionableBookings}</p>
                </div>
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-center">
                  <p className="text-xs text-teal-600">Commission due</p>
                  <p className="text-xl font-bold text-teal-700">{formatPhp(stats.totalCommission)}</p>
                </div>
              </div>

              {stats.bookings.length > 0 ? (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Ref</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Customer</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Pickup</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-500">Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.bookings.map((b) => (
                        <tr key={b.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-2 font-mono text-gray-600">{b.orderReference ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{b.customerName ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {b.pickupDatetime
                              ? new Date(b.pickupDatetime).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short' })
                              : '—'}
                            {b.advanceDays !== null && (
                              <span className="ml-1 text-gray-400">({b.advanceDays}d ahead)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {b.commissionable ? (
                              <div>
                                <span className="font-semibold text-teal-700">{formatPhp(b.commissionAmount)}</span>
                                {b.commissionBase !== null && partner.commission_type === 'percentage' && (
                                  <p className="text-gray-400">on {formatPhp(b.commissionBase)}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">
                                {b.status === 'cancelled' ? 'Cancelled' : `< ${partner.advance_booking_days}d`}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                  No attributed bookings this month
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function PartnersPage() {
  const selectedStoreId = useUIStore((s) => s.selectedStoreId);
  const storeId = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : 'store-lolas';

  const { data: partners = [], isLoading } = usePartners();
  const { toasts, pushToast } = useToast();

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<AccommodationPartner | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<AccommodationPartner | null>(null);

  const visiblePartners = partners.filter(
    (p) => !selectedStoreId || selectedStoreId === 'all' || p.store_id === selectedStoreId,
  );

  function openAdd() {
    setEditingPartner(null);
    setShowFormModal(true);
  }

  function openEdit(partner: AccommodationPartner) {
    setEditingPartner(partner);
    setShowFormModal(true);
    setSelectedPartner(null);
  }

  function openDetail(partner: AccommodationPartner) {
    setSelectedPartner(partner);
  }

  const livePartner = partners.find((p) => p.id === selectedPartner?.id) ?? selectedPartner;

  return (
    <div className="flex h-full">
      {/* Main panel */}
      <div className={`flex flex-1 flex-col overflow-hidden ${selectedPartner ? 'hidden md:flex' : ''}`}>
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Accommodation Partners</h1>
            <p className="mt-0.5 text-sm text-gray-500">Trackable affiliate links for advance booking referrals</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" /> Add partner
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading…</div>
          ) : visiblePartners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Link2 className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-base font-medium text-gray-500">No accommodation partners yet</p>
              <p className="mt-1 text-sm text-gray-400">Add your first partner to generate a trackable booking link.</p>
              <button
                onClick={openAdd}
                className="mt-4 flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" /> Add partner
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-gray-500">Property</th>
                    <th className="px-4 py-3 font-medium text-gray-500">Slug</th>
                    <th className="px-4 py-3 font-medium text-gray-500">Commission</th>
                    <th className="px-4 py-3 font-medium text-gray-500">Advance rule</th>
                    <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePartners.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedPartner?.id === p.id ? 'bg-teal-50' : ''
                      }`}
                      onClick={() => openDetail(p)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{p.name}</span>
                        {p.contact_name && (
                          <p className="text-xs text-gray-400">{p.contact_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.slug}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {p.commission_type === 'percentage'
                          ? `${p.commission_value}% rental`
                          : formatPhp(p.commission_value)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{p.advance_booking_days}d ahead</td>
                      <td className="px-4 py-3">
                        <Badge color={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {livePartner && (
        <div className="w-full border-l border-gray-200 bg-white md:w-[480px] overflow-hidden flex flex-col">
          <PartnerDetailPanel
            partner={livePartner}
            onEdit={() => openEdit(livePartner)}
            onClose={() => setSelectedPartner(null)}
            pushToast={pushToast}
          />
        </div>
      )}

      {/* Form modal */}
      <PartnerFormModal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        editing={editingPartner}
        defaultStoreId={storeId}
        pushToast={pushToast}
      />

      {/* Toast notifications */}
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
    </div>
  );
}
