import { useEffect, useState } from 'react';
import { AlertTriangle, MessageCircle, Pencil, Phone } from 'lucide-react';
import {
  formatWhatsAppNumber,
  isValidWhatsAppE164,
  suggestWhatsAppFix,
  whatsAppLinkDigits,
} from '@lolas/shared';
import { Modal } from './Modal.js';
import { WhatsAppNumberInput, whatsAppNumberError } from './WhatsAppNumberInput.js';

interface Props {
  value: string | null;
  /** Persists a valid E.164 number. Omit to render read-only. */
  onSave?: (next: string) => Promise<void>;
  needsReview?: boolean;
  /** Also flag a missing number (e.g. inbox bookings, where reminders need one). */
  flagMissing?: boolean;
  /**
   * `modal` opens the editor in a dialog — use inside tables or scroll
   * containers, where an anchored popover would be clipped.
   */
  editorMode?: 'popover' | 'modal';
  editorTitle?: string;
  helperText?: string;
  /** Shorter warning chip for dense lists. */
  compact?: boolean;
}

/**
 * WhatsApp number with an inline fix flow: formatted when valid, a warning chip
 * when automations can't use it, a one-click suggested repair, and an editor.
 */
export function WhatsAppNumberEditor({
  value,
  onSave,
  needsReview = false,
  flagMissing = false,
  editorMode = 'popover',
  editorTitle = 'Customer WhatsApp number',
  helperText,
  compact = false,
}: Props) {
  const [current, setCurrent] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCurrent(value);
  }, [value]);

  const valid = isValidWhatsAppE164(current);
  const flagged = current ? !valid || needsReview : flagMissing;
  const suggestion = current ? suggestWhatsAppFix(current) : null;
  const waDigits = whatsAppLinkDigits(current);
  const canEdit = Boolean(onSave);

  async function save(next: string) {
    if (!onSave) return;
    const message = whatsAppNumberError(next, true);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(next);
      setCurrent(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the number');
    } finally {
      setSaving(false);
    }
  }

  function openEditor() {
    setDraft(valid ? current ?? '' : suggestion ?? current ?? '');
    setError(null);
    setEditing(true);
  }

  const warningLabel = !current
    ? compact ? 'No WhatsApp number' : 'No WhatsApp number — reminders won\u2019t send'
    : compact ? 'Invalid — reminders won\u2019t send' : 'Invalid WhatsApp number — reminders won\u2019t send';

  const editorBody = (
    <>
      <WhatsAppNumberInput
        autoFocus
        value={draft}
        onChange={(next) => setDraft(next)}
        className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
        helperText={helperText}
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
          disabled={saving || !isValidWhatsAppE164(draft)}
          className="rounded-lg bg-teal-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  );

  return (
    <span className="relative inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {current ? (
        <a href={`tel:${current}`} className="flex items-center gap-1 text-xs text-charcoal-brand/60 hover:text-teal-brand">
          <Phone className="h-3 w-3 shrink-0" aria-hidden />
          {valid ? formatWhatsAppNumber(current) : current}
        </a>
      ) : (
        !flagged && <span className="text-xs text-charcoal-brand/40">No WhatsApp number</span>
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
      {canEdit && (
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
          {warningLabel}
        </span>
      )}
      {flagged && suggestion && canEdit && !editing && (
        <button
          type="button"
          onClick={() => void save(suggestion)}
          disabled={saving}
          className="rounded-full border border-teal-300 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
        >
          Use {formatWhatsAppNumber(suggestion)}?
        </button>
      )}
      {error && !editing && <span className="text-[11px] text-red-600">{error}</span>}

      {editing && editorMode === 'popover' && (
        <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-gray-700">{editorTitle}</p>
          {editorBody}
        </div>
      )}
      {editorMode === 'modal' && (
        <Modal open={editing} onClose={() => setEditing(false)} title={editorTitle} size="md">
          {editing && editorBody}
        </Modal>
      )}
    </span>
  );
}
