import { useEffect, useRef, useState, type ReactNode } from 'react';

type FadeUpSectionProps = {
  children: ReactNode;
  className?: string;
  /** When true, desktop (md+) shows content immediately; scroll fade applies on smaller viewports only. */
  onlyAnimateOnMobile?: boolean;
};

export function FadeUpSection({ children, className = '', onlyAnimateOnMobile = false }: FadeUpSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (onlyAnimateOnMobile && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      setVisible(true);
      return;
    }

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

    let mq: MediaQueryList | null = null;
    const onMq = () => {
      if (onlyAnimateOnMobile && window.matchMedia('(min-width: 768px)').matches) {
        setVisible(true);
        obs.disconnect();
      }
    };

    if (onlyAnimateOnMobile) {
      mq = window.matchMedia('(min-width: 768px)');
      mq.addEventListener('change', onMq);
    }

    return () => {
      obs.disconnect();
      mq?.removeEventListener('change', onMq);
    };
  }, [onlyAnimateOnMobile]);

  return (
    <div
      ref={ref}
      className={`${className} ${visible ? 'animate-fade-up' : 'translate-y-5 opacity-0'}`}
    >
      {children}
    </div>
  );
}
