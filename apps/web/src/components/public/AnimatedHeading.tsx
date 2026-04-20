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

  const words = text.split(' ');
  // Pre-calculate global char index for consistent animation timing across words
  let globalCharIndex = 0;

  return (
    <Tag ref={ref as React.Ref<HTMLElement>} className={className} style={style} aria-label={text}>
      {words.map((word, wi) => {
        const wordSpans = word.split('').map((char) => {
          const idx = globalCharIndex++;
          return (
            <span
              key={idx}
              aria-hidden="true"
              style={{
                display: 'inline-block',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(18px)',
                transition: visible
                  ? `opacity 0.35s ease ${idx * delay}ms, transform 0.35s ease ${idx * delay}ms`
                  : 'none',
              }}
            >
              {char}
            </span>
          );
        });
        // Space between words (not after the last word)
        const spaceIdx = globalCharIndex++;
        return (
          <span key={wi} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {wordSpans}
            {wi < words.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  whiteSpace: 'pre',
                  opacity: visible ? 1 : 0,
                  transition: visible ? `opacity 0.35s ease ${spaceIdx * delay}ms` : 'none',
                }}
              >
                {' '}
              </span>
            )}
          </span>
        );
      })}
    </Tag>
  );
}
