import { useEffect, useRef, useState } from 'react';
import roadImg from '../../assets/Road Bold (flat bend).svg';
import scooterImg from '../../assets/Lola Scooter 2.svg';

/**
 * Road strip with a scooter following the road's S-curve via CSS offset-path.
 * The path is computed dynamically from the container's pixel dimensions
 * so it scales correctly at all viewport widths.
 *
 * Road centre Y positions (from SVG analysis of "Road Bold (flat bend)"):
 *   Left      (x = 0%):   72% of container height
 *   Quarter   (x = 25%):  40% of container height
 *   Middle    (x = 50%):  52% of container height
 *   Three-qtr (x = 75%):  38% of container height
 *   Right     (x = 100%): 48% of container height
 */
export function ScooterRoad() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState('');

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const y0 = h * 0.72;
      const y1 = h * 0.40;
      const y2 = h * 0.52;
      const y3 = h * 0.38;
      const y4 = h * 0.48;
      setPath(
        `M -80 ${y0} C ${w * 0.25} ${y1}, ${w * 0.4} ${y2}, ${w * 0.6} ${y2} S ${w * 0.75} ${y3}, ${w + 80} ${y4}`,
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ aspectRatio: '482.25 / 57' }}
    >
      <img
        src={roadImg}
        alt=""
        className="w-full h-auto object-fill"
        style={{ display: 'block', mixBlendMode: 'multiply', opacity: 0.75 }}
      />

      {path && (
        <img
          src={scooterImg}
          alt="Lola's scooter"
          style={
            {
              position: 'absolute',
              top: 0,
              left: 0,
              offsetPath: `path('${path}')`,
              offsetRotate: 'auto',
              animation: 'drive-along-road 18s linear infinite',
              height: '55%',
              width: 'auto',
              mixBlendMode: 'multiply',
            } as React.CSSProperties
          }
        />
      )}
    </div>
  );
}
