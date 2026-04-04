import { useRef, useEffect, useCallback } from 'react';

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  extraScale?: number;
}

function easeFunc(t: number, easing: ClickSparkProps['easing']): number {
  switch (easing) {
    case 'ease-in': return t * t;
    case 'ease-out': return t * (2 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t;
  }
}

export default function ClickSpark({
  sparkColor = '#FCBC5A',
  sparkSize = 10,
  sparkRadius = 14,
  sparkCount = 8,
  duration = 400,
  easing = 'ease-out',
  extraScale = 1.0,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();

    sparksRef.current = sparksRef.current.filter((spark) => {
      const elapsed = now - spark.startTime;
      if (elapsed >= duration) return false;

      const t = easeFunc(elapsed / duration, easing);
      const distance = t * sparkRadius * extraScale;
      const alpha = 1 - t;
      const currentSize = sparkSize * (1 - t * 0.5);

      const x = spark.x + Math.cos(spark.angle) * distance;
      const y = spark.y + Math.sin(spark.angle) * distance;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = sparkColor;
      ctx.beginPath();
      ctx.arc(x, y, currentSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      return true;
    });

    rafRef.current = requestAnimationFrame(draw);
  }, [sparkColor, sparkSize, sparkRadius, duration, easing, extraScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const handleClick = (e: MouseEvent) => {
      const now = performance.now();
      const newSparks: Spark[] = Array.from(
        { length: sparkCount },
        (_, i) => ({
          x: e.clientX,
          y: e.clientY,
          angle: (2 * Math.PI * i) / sparkCount,
          startTime: now,
        })
      );
      sparksRef.current.push(...newSparks);
    };

    window.addEventListener('click', handleClick);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', handleClick);
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw, sparkCount]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
}
