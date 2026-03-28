import { useEffect, useRef, useState, type ReactNode } from 'react';

export function FadeUpSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${className} ${visible ? 'animate-fade-up' : 'translate-y-5 opacity-0'}`}
    >
      {children}
    </div>
  );
}
