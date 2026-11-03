import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MessageCircle, Pencil, Phone } from 'lucide-react';
import {
  formatWhatsAppNumber,
  isValidWhatsAppE164,
  suggestWhatsAppFix,
  whatsAppLinkDigits,
} from '@lolas/shared';
import { useUpdateCustomer } from '../../api/customers.js';
import { WhatsAppNumberInput, whatsAppNumberError } from '../common/WhatsAppNumberInput.js';

interface Props {
  customerId: string | null;
  mobile: string | null;
  needsReview?: boolean;
}

/**
 * Customer WhatsApp number on the order screen: shows it formatted, flags
 * numbers automations can't use, and lets staff correct it in place.
 */
export function CustomerWhatsAppNumber({ customerId, mobile, needsReview = false }: Props) {
  const queryClient = useQueryClient();
  const updateCustomer = useUpdateCustomer();
  const [current, setCurrent] = useState(mobile);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mobile ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(mobile);
  }, [mobile]);

  const valid = isValidWhatsAppE164(current);
  const flagged = Boolean(current) && (!valid || needsReview);
  const suggestion = current ? suggestWhatsAppFix(current) : null;
  const waDigits = whatsAppLinkDigits(current);

  async function save(next: string) {
    if (!customerId) return;
    const message = whatsAppNumberError(next, true);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    try {
      await updateCustomer.mutateAsync({ id: customerId, mobile: next });
      setCurrent(next);
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the number');
    }
  }

  function openEditor() {
    setDraft(valid ? current ?? '' : suggestion ?? current ?? '');
    setError(null);
    setEditing(true);
  }

  return (
    <span className="relative inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {current ? (
        <a href={`tel:${current}`} className="flex items-center gap-1 text-xs text-charcoal-brand/60 hover:text-teal-brand">
          <Phone className="h-3 w-3 shrink-0" aria-hidden />
          {valid ? formatWhatsAppNumber(current) : current}
        </a>
      ) : (
        <span className="text-xs text-charcoal-brand/40">No WhatsApp number</span>
      )}
      {waDigits && !flagged && (
        <a
          href={`https://wa.me/${waDigits}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800"
          title="Open in WhatsApp"
        >
          <MessageCircle className="h-3 w-3 shrink-0" aria-hidden />
          WA
        </a>
      )}
      {customerId && (
        <button
          type="button"
          onClick={openEditor}
          className="flex items-center gap-1 text-xs text-charcoal-brand/50 hover:text-teal-brand"
          title={current ? 'Edit WhatsApp number' : 'Add WhatsApp number'}
        >
          <Pencil className="h-3 w-3" aria-hidden />
          {current ? 'Edit' : 'Add'}
        </button>
      )}
      {flagged && (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Invalid WhatsApp number — reminders won&apos;t send
        </span>
      )}
      {flagged && suggestion && customerId && !editing && (
        <button
          type="button"
          onClick={() => void save(suggestion)}
          disabled={updateCustomer.isPending}
          className="rounded-full border border-teal-300 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
        >
          Use {formatWhatsAppNumber(suggestion)}?
        </button>
      )}
      {error && !editing && <span className="text-[11px] text-red-600">{error}</span>}

      {editing && (
        <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-gray-700">Customer WhatsApp number</p>
          <WhatsAppNumberInput
            autoFocus
            value={draft}
            onChange={(value) => setDraft(value)}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
            helperText="Updates the customer and their linked bookings so reminders reach them."
          />
          {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save(draft)}
              disabled={updateCustomer.isPending || !isValidWhatsAppE164(draft)}
              className="rounded-lg bg-teal-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {updateCustomer.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
