import { useEffect, useRef, useState } from 'react';

interface AnimatedHeadingProps {
  text: string;
  className?: string;
  tag?: 'h1' | 'h2' | 'h3' | 'span';
  delay?: number; // ms between each character
  style?: React.CSSProperties;
}

export function AnimatedHeading({
  text,
  className = '',
  tag: Tag = 'h1',
  delay = 20,
  style,
}: AnimatedHeadingProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const chars = text.split('');

  return (
    <Tag ref={ref as React.Ref<HTMLElement>} className={className} style={style} aria-label={text}>
      {chars.map((char, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            display: 'inline-block',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(18px)',
            transition: visible
              ? `opacity 0.35s ease ${i * delay}ms, transform 0.35s ease ${i * delay}ms`
              : 'none',
            whiteSpace: char === ' ' ? 'pre' : 'normal',
          }}
        >
          {char}
        </span>
      ))}
    </Tag>
  );
}
