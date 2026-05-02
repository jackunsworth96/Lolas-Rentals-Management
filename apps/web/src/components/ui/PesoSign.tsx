import type { CSSProperties } from 'react';

interface PesoSignProps {
  className?: string;
  style?: CSSProperties;
}

/**
 * Inline peso (₱) SVG that uses currentColor so it inherits the surrounding
 * text colour.  Default sizing is 0.82em tall so it sits naturally alongside
 * body and headline text at any size.
 */
export function PesoSign({ className, style }: PesoSignProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="22 118 1457 1310"
      aria-hidden="true"
      focusable="false"
      style={{
        display: 'inline-block',
        height: '0.82em',
        width: 'auto',
        verticalAlign: '-0.08em',
        flexShrink: 0,
        ...style,
      }}
      className={className}
    >
      <g transform="translate(-26.966445, 1425.663506)" fill="currentColor">
        <path d="M 1495.953125 -757.015625 L 1506.28125 -738.9375 L 1498.53125 -599.40625 L 1227.25 -599.40625 C 1179.019531 -528.789062 1112.273438 -473.671875 1027.015625 -434.046875 C 941.753906 -394.429688 843.140625 -373.765625 731.171875 -372.046875 L 604.578125 -372.046875 L 614.90625 0 L 289.375 0 L 302.296875 -387.546875 L 299.703125 -599.40625 L 62.015625 -599.40625 L 49.09375 -617.5 L 62.015625 -757.015625 L 297.125 -757.015625 L 294.53125 -904.28125 L 62.015625 -904.28125 L 49.09375 -922.375 L 62.015625 -1061.890625 L 291.953125 -1061.890625 L 289.375 -1304.75 L 852.609375 -1307.34375 C 962.847656 -1307.34375 1054.566406 -1286.671875 1127.765625 -1245.328125 C 1200.972656 -1203.992188 1252.21875 -1142.847656 1281.5 -1061.890625 L 1495.953125 -1061.890625 L 1506.28125 -1043.796875 L 1498.53125 -904.28125 L 1312.5 -904.28125 L 1312.5 -881.03125 C 1312.5 -841.414062 1308.195312 -800.078125 1299.59375 -757.015625 Z M 785.4375 -602 C 909.445312 -645.0625 971.453125 -728.597656 971.453125 -852.609375 C 971.453125 -997.296875 896.53125 -1073.082031 746.6875 -1079.96875 L 614.90625 -1072.21875 L 607.15625 -609.75 Z" />
      </g>
    </svg>
  );
}
