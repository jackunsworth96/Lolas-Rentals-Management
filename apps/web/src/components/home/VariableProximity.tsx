import { useRef, useCallback } from 'react';
import './VariableProximity.css';

interface VariableProximityProps {
  label: string;
  fromFontVariationSettings: string;
  toFontVariationSettings: string;
  containerRef: React.RefObject<HTMLElement | null>;
  radius?: number;
  falloff?: 'linear' | 'exponential' | 'gaussian';
  className?: string;
  style?: React.CSSProperties;
}

function parseSettings(str: string): Map<string, number> {
  return new Map(
    str.split(',').map((s) => {
      const parts = s.trim().split(' ');
      return [parts[0].replace(/['"]/g, ''), parseFloat(parts[1])];
    })
  );
}

export default function VariableProximity({
  label,
  fromFontVariationSettings,
  toFontVariationSettings,
  containerRef,
  radius = 150,
  falloff = 'gaussian',
  className = '',
  style,
}: VariableProximityProps) {
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const fromSettings = parseSettings(fromFontVariationSettings);
  const toSettings = parseSettings(toFontVariationSettings);

  const getFalloff = useCallback((distance: number): number => {
    const norm = Math.min(Math.max(1 - distance / radius, 0), 1);
    switch (falloff) {
      case 'exponential': return norm * norm;
      case 'gaussian':
        return Math.exp(-((distance / (radius / 3)) ** 2) / 2);
      default: return norm;
    }
  }, [radius, falloff]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    letterRefs.current.forEach((el) => {
      if (!el) return;
      const letterRect = el.getBoundingClientRect();
      const letterX = letterRect.left + letterRect.width / 2 - rect.left;
      const letterY = letterRect.top + letterRect.height / 2 - rect.top;
      const distance = Math.sqrt(
        (mouseX - letterX) ** 2 + (mouseY - letterY) ** 2
      );
      const t = getFalloff(distance);
      const settings = Array.from(fromSettings.entries())
        .map(([axis, from]) => {
          const to = toSettings.get(axis) ?? from;
          const value = from + (to - from) * t;
          return `'${axis}' ${value}`;
        })
        .join(', ');
      el.style.fontVariationSettings = settings;
    });
  }, [containerRef, fromSettings, toSettings, getFalloff]);

  const handleMouseLeave = useCallback(() => {
    letterRefs.current.forEach((el) => {
      if (el) el.style.fontVariationSettings = fromFontVariationSettings;
    });
  }, [fromFontVariationSettings]);

  const words = label.split(' ');
  let letterIndex = 0;

  return (
    <span
      className={`variable-proximity ${className}`}
      style={{ display: 'inline', ...style }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {words.map((word, wordIndex) => (
        <span
          key={wordIndex}
          style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
        >
          {word.split('').map((letter) => {
            const idx = letterIndex++;
            return (
              <span
                key={idx}
                ref={(el) => { letterRefs.current[idx] = el; }}
                style={{
                  display: 'inline-block',
                  fontVariationSettings: fromFontVariationSettings,
                }}
              >
                {letter}
              </span>
            );
          })}
          {wordIndex < words.length - 1 && (
            <span style={{ display: 'inline-block' }}>&nbsp;</span>
          )}
        </span>
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
}
