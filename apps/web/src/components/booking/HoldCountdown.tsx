import { useState, useEffect } from 'react';

interface HoldCountdownProps {
  expiresAt: string;
  onExpired?: () => void;
}

export function HoldCountdown({ expiresAt, onExpired }: HoldCountdownProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  });

  useEffect(() => {
    const id = setInterval(() => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      const secs = Math.max(0, Math.floor(diff / 1000));
      setSecondsLeft(secs);
      if (secs <= 0) {
        clearInterval(id);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);

  if (secondsLeft <= 0) {
    return (
      <span className="text-xs font-bold text-red-600">
        Hold expired — please re-add to basket
      </span>
    );
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const display = `${mins}:${String(secs).padStart(2, '0')}`;
  const isWarning = secondsLeft <= 120;

  return (
    <span
      className="text-xs font-bold tabular-nums"
      style={{ color: isWarning ? '#F5B731' : '#1A7A6E' }}
    >
      Held for {display}
    </span>
  );
}
