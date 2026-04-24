import { useState } from 'react';
import { api } from '../../api/client.js';

interface Props {
  orderReference: string;
  customerName?: string;
  vehicleModelName?: string;
}

export function BookingFeedbackForm({ orderReference, customerName, vehicleModelName }: Props) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      await api.post('/public/booking/feedback', {
        orderReference,
        rating,
        comment: comment.trim() || undefined,
        customerName,
        vehicleModelName,
      });
      setSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
        <span className="text-3xl">🙏</span>
        <p className="mt-3 font-headline text-lg font-black text-charcoal-brand">Thanks! We really appreciate it.</p>
        <p className="mt-1 font-lato text-sm text-charcoal-brand/60">Your feedback helps us make the website better.</p>
      </div>
    );
  }

  const activeRating = hovered || rating;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="mb-0.5 font-headline text-lg font-black text-charcoal-brand">How was booking with us?</p>
      <p className="mb-5 font-lato text-sm text-charcoal-brand/60">
        We're still polishing this site — your feedback (especially any issues you spotted) helps us improve.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Star rating */}
        <div className="mb-5 flex justify-center gap-2" role="group" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} star${star !== 1 ? 's' : ''}`}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className="transition-transform active:scale-90 hover:scale-110"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-10 w-10"
                fill={star <= activeRating ? '#FCBC5A' : 'none'}
                stroke={star <= activeRating ? '#FCBC5A' : '#d1d5db'}
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5z"
                />
              </svg>
            </button>
          ))}
        </div>

        {/* Comment box — only shown after a star is selected */}
        {rating > 0 && (
          <div className="mb-4">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Any issues, confusing steps, or suggestions? We read every response."
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-lato text-sm text-charcoal-brand placeholder-charcoal-brand/40 outline-none transition-colors focus:border-teal-brand focus:bg-white"
            />
            <p className="mt-1 text-right font-lato text-xs text-charcoal-brand/30">{comment.length}/1000</p>
          </div>
        )}

        {error && (
          <p className="mb-3 font-lato text-sm text-red-600">Something went wrong — please try again.</p>
        )}

        <div className="flex items-center justify-between gap-4">
          <button
            type="submit"
            disabled={rating === 0 || submitting}
            className="rounded-xl bg-teal-brand px-6 py-2.5 font-lato text-sm font-black text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending…' : 'Send feedback'}
          </button>
          <p className="font-lato text-xs text-charcoal-brand/40">Optional — takes 10 seconds</p>
        </div>
      </form>
    </div>
  );
}
