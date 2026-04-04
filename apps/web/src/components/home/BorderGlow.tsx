import { useRef, useCallback, useEffect } from 'react';
import './BorderGlow.css';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice.js';

interface BorderGlowProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  animated?: boolean;
  colors?: string[];
  fillOpacity?: number;
}

interface AnimateValueParams {
  start?: number;
  end?: number;
  duration?: number;
  delay?: number;
  ease?: (x: number) => number;
  onUpdate: (v: number) => void;
  onEnd?: () => void;
}

function getCenterOfElement(el: HTMLElement): [number, number] {
  const rect = el.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

function getEdgeProximity(el: HTMLElement, x: number, y: number): number {
  const rect = el.getBoundingClientRect();
  const threshold = el.clientWidth * 0.35;
  const distLeft = x - rect.left;
  const distRight = rect.right - x;
  const distTop = y - rect.top;
  const distBottom = rect.bottom - y;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);
  if (minDist >= threshold) return 0;
  return Math.round((1 - minDist / threshold) * 100);
}

function getCursorAngle(el: HTMLElement, x: number, y: number): number {
  const [cx, cy] = getCenterOfElement(el);
  const raw = Math.atan2(y - cy, x - cx) * (180 / Math.PI) + 90;
  return ((raw % 360) + 360) % 360;
}

function parseHSL(hslStr: string): { h: number; s: number; l: number } {
  const parts = hslStr.trim().split(/[\s,]+/).map(Number);
  return { h: parts[0] ?? 0, s: parts[1] ?? 80, l: parts[2] ?? 80 };
}

function buildGlowVars(glowColor: string, intensity: number): Record<string, string> {
  const { h, s, l } = parseHSL(glowColor);
  const cap = (v: number) => Math.min(Math.round(v), 100);
  return {
    '--glow-color':    `hsl(${h}deg ${s}% ${l}% / ${cap(100 * intensity)}%)`,
    '--glow-color-60': `hsl(${h}deg ${s}% ${l}% / ${cap(60  * intensity)}%)`,
    '--glow-color-50': `hsl(${h}deg ${s}% ${l}% / ${cap(50  * intensity)}%)`,
    '--glow-color-40': `hsl(${h}deg ${s}% ${l}% / ${cap(40  * intensity)}%)`,
    '--glow-color-30': `hsl(${h}deg ${s}% ${l}% / ${cap(30  * intensity)}%)`,
    '--glow-color-20': `hsl(${h}deg ${s}% ${l}% / ${cap(20  * intensity)}%)`,
    '--glow-color-10': `hsl(${h}deg ${s}% ${l}% / ${cap(10  * intensity)}%)`,
  };
}

function buildGradientVars(colors: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  colors.forEach((color, i) => { vars[`--gradient-color-${i}`] = color; });
  return vars;
}

function animateValue({
  start = 0,
  end = 1,
  duration = 300,
  delay = 0,
  ease = (x: number) => x,
  onUpdate,
  onEnd,
}: AnimateValueParams): () => void {
  let rafId: number;
  const startTime = performance.now() + delay;
  function tick(now: number) {
    if (now < startTime) { rafId = requestAnimationFrame(tick); return; }
    const t = Math.min((now - startTime) / duration, 1);
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) { rafId = requestAnimationFrame(tick); } else { onEnd?.(); }
  }
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}

const BorderGlow = ({
  children,
  className = '',
  style,
  glowColor = '40 80 80',
  backgroundColor = '#060010',
  borderRadius = 28,
  glowIntensity = 1,
  coneSpread = 25,
  animated = false,
  colors = [],
}: BorderGlowProps) => {
  const isTouch = useIsTouchDevice();
  const cardRef = useRef<HTMLDivElement>(null);

  const glowVars = buildGlowVars(glowColor, glowIntensity);
  const gradientVars = colors.length > 0 ? buildGradientVars(colors) : {};

  const cssVars: React.CSSProperties = {
    ['--card-bg' as string]: backgroundColor,
    ['--border-radius' as string]: `${borderRadius}px`,
    ['--cone-spread' as string]: `${coneSpread}`,
    ...glowVars,
    ...gradientVars,
    ...style,
  };

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const el = cardRef.current;
    el.style.setProperty('--edge-proximity', String(getEdgeProximity(el, e.clientX, e.clientY)));
    el.style.setProperty('--cursor-angle', `${getCursorAngle(el, e.clientX, e.clientY)}deg`);
  }, []);

  const handlePointerLeave = useCallback(() => {
    cardRef.current?.style.setProperty('--edge-proximity', '0');
  }, []);

  useEffect(() => {
    if (!animated || !cardRef.current) return;
    const el = cardRef.current;
    el.classList.add('sweep-active');
    const cancelAngle = animateValue({
      start: 0, end: 360, duration: 1500,
      onUpdate: (v) => el.style.setProperty('--cursor-angle', `${v}deg`),
      onEnd: () => {
        el.classList.remove('sweep-active');
        el.style.setProperty('--edge-proximity', '0');
      },
    });
    const cancelProx = animateValue({
      start: 0, end: 80, duration: 400,
      onUpdate: (v) => el.style.setProperty('--edge-proximity', String(v)),
    });
    return () => { cancelAngle(); cancelProx(); };
  }, [animated]);

  if (isTouch) {
    return (
      <div
        style={{
          borderRadius: `${borderRadius}px`,
          background: backgroundColor,
          padding: '1.5px',
          animation: 'borderPulse 3s ease-in-out infinite',
          height: '100%',
          ...style,
        }}
      >
        <div
          style={{
            borderRadius: `${borderRadius - 2}px`,
            background: backgroundColor,
            height: '100%',
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`border-glow-card ${className}`}
      style={cssVars}
    >
      <div className="edge-light" />
      <div className="border-glow-inner">
        {children}
      </div>
    </div>
  );
};

export default BorderGlow;
