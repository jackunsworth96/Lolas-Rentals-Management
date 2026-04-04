import { forwardRef, useMemo, useRef, useEffect } from 'react';
import './VariableProximity.css';

interface VariableProximityProps {
  label: string;
  fromFontVariationSettings: string;
  toFontVariationSettings: string;
  containerRef: React.RefObject<HTMLElement | null>;
  radius?: number;
  falloff?: 'linear' | 'exponential' | 'gaussian';
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

function useMousePositionRef(
  containerRef: React.RefObject<HTMLElement | null>
) {
  const positionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    const handleMouseMove = (ev: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        positionRef.current = {
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
        };
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [containerRef]);
  return positionRef;
}

const VariableProximity = forwardRef<HTMLSpanElement, VariableProximityProps>(
  (props, ref) => {
    const {
      label,
      fromFontVariationSettings,
      toFontVariationSettings,
      containerRef,
      radius = 120,
      falloff = 'linear',
      className = '',
      onClick,
      style,
    } = props;

    const letterRefs = useRef<(HTMLElement | null)[]>([]);
    const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const mousePositionRef = useMousePositionRef(containerRef);

    const parsedSettings = useMemo(() => {
      const parse = (str: string) =>
        new Map(
          str.split(',').map((s) => {
            const parts = s.trim().split(' ');
            return [
              parts[0].replace(/['"]/g, ''),
              parseFloat(parts[1]),
            ] as [string, number];
          })
        );
      const from = parse(fromFontVariationSettings);
      const to = parse(toFontVariationSettings);
      return Array.from(from.entries()).map(([axis, fromValue]) => ({
        axis,
        fromValue,
        toValue: to.get(axis) ?? fromValue,
      }));
    }, [fromFontVariationSettings, toFontVariationSettings]);

    const getFalloff = useMemo(
      () =>
        (distance: number): number => {
          const norm = Math.min(Math.max(1 - distance / radius, 0), 1);
          switch (falloff) {
            case 'exponential':
              return norm ** 2;
            case 'gaussian':
              return Math.exp(-((distance / (radius / 2)) ** 2) / 2);
            default:
              return norm;
          }
        },
      [radius, falloff]
    );

    useEffect(() => {
      let frameId: number;

      const loop = () => {
        const { x, y } = mousePositionRef.current;

        if (lastPos.current.x === x && lastPos.current.y === y) {
          frameId = requestAnimationFrame(loop);
          return;
        }
        lastPos.current = { x, y };

        if (!containerRef.current) {
          frameId = requestAnimationFrame(loop);
          return;
        }
        const containerRect = containerRef.current.getBoundingClientRect();

        letterRefs.current.forEach((el) => {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const lx = rect.left + rect.width / 2 - containerRect.left;
          const ly = rect.top + rect.height / 2 - containerRect.top;
          const dist = Math.sqrt((x - lx) ** 2 + (y - ly) ** 2);
          const t = getFalloff(dist);
          const settings = parsedSettings
            .map(
              ({ axis, fromValue, toValue }) =>
                `'${axis}' ${fromValue + (toValue - fromValue) * t}`
            )
            .join(', ');
          el.style.fontVariationSettings = settings;
        });

        frameId = requestAnimationFrame(loop);
      };

      frameId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frameId);
    }, [containerRef, parsedSettings, mousePositionRef, getFalloff]);

    const words = label.split(' ');
    let letterIndex = 0;

    return (
      <span
        ref={ref}
        className={`variable-proximity ${className}`}
        onClick={onClick}
        style={{ display: 'inline', ...style }}
      >
        {words.map((word, wi) => (
          <span
            key={wi}
            style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
          >
            {word.split('').map((letter) => {
              const idx = letterIndex++;
              return (
                <span
                  key={idx}
                  ref={(el) => {
                    letterRefs.current[idx] = el;
                  }}
                  style={{
                    display: 'inline-block',
                    fontVariationSettings: fromFontVariationSettings,
                  }}
                  aria-hidden="true"
                >
                  {letter}
                </span>
              );
            })}
            {wi < words.length - 1 && (
              <span style={{ display: 'inline-block' }}>&nbsp;</span>
            )}
          </span>
        ))}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
);

VariableProximity.displayName = 'VariableProximity';
export default VariableProximity;
