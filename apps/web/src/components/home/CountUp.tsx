import { useEffect, useRef, useCallback } from 'react';
import { useInView, useMotionValue, useSpring } from 'framer-motion';

interface CountUpProps {
  to: number;
  from?: number;
  direction?: 'up' | 'down';
  delay?: number;
  duration?: number;
  className?: string;
  startWhen?: boolean;
  separator?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

function getDecimalPlaces(num: number): number {
  const str = String(num);
  const dot = str.indexOf('.');
  return dot === -1 ? 0 : str.length - dot - 1;
}

export default function CountUp({
  to,
  from = 0,
  direction = 'up',
  delay = 0,
  duration = 2,
  className,
  startWhen = true,
  separator = '',
  onStart,
  onEnd,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  const motionValue = useMotionValue(direction === 'down' ? to : from);

  const springConfig = {
    damping: 60,
    stiffness: 100,
    duration: duration * 1000,
  };

  const spring = useSpring(motionValue, springConfig);

  const decimalPlaces = getDecimalPlaces(to);

  const formatValue = useCallback(
    (value: number): string => {
      const rounded = parseFloat(value.toFixed(decimalPlaces));
      const parts = rounded.toString().split('.');
      if (separator) {
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
      }
      return parts.join('.');
    },
    [decimalPlaces, separator],
  );

  // Update span text on every spring tick
  useEffect(() => {
    const unsubscribe = spring.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = formatValue(latest);
      }
    });
    return unsubscribe;
  }, [spring, formatValue]);

  // Trigger animation when in view and startWhen is true
  useEffect(() => {
    if (!isInView || !startWhen) return;

    let timeout: ReturnType<typeof setTimeout>;

    timeout = setTimeout(() => {
      onStart?.();
      motionValue.set(direction === 'down' ? from : to);

      // Fire onEnd after the spring settles
      const endTimeout = setTimeout(() => {
        onEnd?.();
      }, duration * 1000 + 100);

      return () => clearTimeout(endTimeout);
    }, delay * 1000);

    return () => clearTimeout(timeout);
  }, [isInView, startWhen, motionValue, direction, from, to, delay, duration, onStart, onEnd]);

  // Set initial text to avoid a blank flash
  const initialValue = direction === 'down' ? to : from;

  return (
    <span ref={ref} className={className}>
      {formatValue(initialValue)}
    </span>
  );
}
