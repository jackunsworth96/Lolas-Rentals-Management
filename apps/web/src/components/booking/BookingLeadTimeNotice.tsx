import { useEffect, useState } from 'react';
import { earliestBookableLabel } from '@lolas/shared';
import { WHATSAPP_URL } from '../../config/contact.js';

/** Re-renders while a booking form is open so a selected slot can become too soon. */
export function useBookingLeadClock(intervalMs = 15_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

export function BookingLeadTimeNotice({ nowMs = Date.now() }: { nowMs?: number }) {
  const earliest = earliestBookableLabel(nowMs);
  return (
    <p className="text-xs font-semibold leading-relaxed text-amber-800">
      We need at least 15 minutes&apos; notice, but it&apos;s likely we can get to you sooner than that
      {' '}— go ahead and book for {earliest} or later and we&apos;ll aim to be there by then.
      Need us there ASAP?{' '}
      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="underline">
        Send us a message
      </a>{' '}
      so we can make you a priority.
    </p>
  );
}
