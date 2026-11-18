import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'input', 'scroll'] as const;

/** Calls onIdle once nobody has touched the page for timeoutMs. Any tap, key or scroll restarts the clock. */
export function useIdleReset(active: boolean, timeoutMs: number, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(() => onIdleRef.current(), timeoutMs);
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onIdleRef.current(), timeoutMs);
    };
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, restart, true);
    return () => {
      window.clearTimeout(timer);
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, restart, true);
    };
  }, [active, timeoutMs]);
}
