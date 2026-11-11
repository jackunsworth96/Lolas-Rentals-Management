import { useState } from 'react';
import { useAddOrderNote, type OrderNote } from '../../../api/orders.js';
import { formatDateTime } from '../../../utils/date.js';

interface StaffNotesProps {
  orderId: string;
  notes: OrderNote[];
  /** Free-text note captured with the original web booking. */
  bookingNote?: string | null;
  canEdit: boolean;
}

export function StaffNotes({ orderId, notes, bookingNote, canEdit }: StaffNotesProps) {
  const [body, setBody] = useState('');
  const [focused, setFocused] = useState(false);
  const addNote = useAddOrderNote();

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    addNote.mutate({ id: orderId, body: trimmed }, { onSuccess: () => { setBody(''); setFocused(false); } });
  };

  return (
    <section className="rounded-lg border border-gray-200 p-3">
      <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-charcoal-brand/50">Notes</h4>
      {canEdit && (
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => { if (!body.trim()) setFocused(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            placeholder="Add a note, e.g. customer asked on WhatsApp for collection at 10:30"
            maxLength={2000}
            rows={focused ? 3 : 1}
            className="flex-1 resize-none rounded border border-gray-300 px-2 py-1 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
          />
          <button
            type="button"
            disabled={addNote.isPending || !body.trim()}
            onClick={submit}
            className="self-start rounded bg-teal-brand px-3 py-1 text-sm text-white hover:bg-teal-brand/90 disabled:opacity-50"
          >
            {addNote.isPending ? 'Saving…' : 'Add'}
          </button>
        </div>
      )}
      {addNote.error && <p className="mt-1 text-xs text-red-600">{(addNote.error as Error).message}</p>}
      {(bookingNote || notes.length > 0) && (
        <ul className="mt-2 space-y-1.5">
          {bookingNote && (
            <li className="rounded bg-sand-brand p-2 text-sm">
              <p className="whitespace-pre-wrap">{bookingNote}</p>
              <p className="mt-0.5 text-xs text-charcoal-brand/50">From booking</p>
            </li>
          )}
          {notes.map((n) => (
            <li
              key={n.id}
              className={`rounded p-2 text-sm ${n.kind === 'return_change' ? 'border border-teal-200 bg-teal-50' : 'bg-sand-brand'}`}
            >
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-0.5 text-xs text-charcoal-brand/50">
                {n.kind === 'return_change' ? 'Return time change · ' : ''}
                {n.employeeName ?? 'Staff'} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {!canEdit && !bookingNote && notes.length === 0 && (
        <p className="text-sm italic text-charcoal-brand/40">No notes</p>
      )}
    </section>
  );
}
