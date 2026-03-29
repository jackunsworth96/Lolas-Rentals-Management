import { useState, useCallback, useRef, useEffect } from 'react';

export interface Toast {
  msg: string;
  type: 'success' | 'error';
  id: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const pushToast = useCallback((msg: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { msg, type, id }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(timer);
    }, 3500);
    timers.current.add(timer);
  }, []);

  return { toasts, pushToast } as const;
}
