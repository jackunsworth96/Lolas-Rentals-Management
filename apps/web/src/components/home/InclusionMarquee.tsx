import { useReducedMotion } from 'framer-motion';

interface MarqueeItem {
  icon: string;
  label: string;
  isUpgrade?: boolean;
}

interface InclusionMarqueeProps {
  items: MarqueeItem[];
  speed?: number; // seconds for one full loop
  /** Icon size in px (default 72) */
  iconSize?: number;
  /** Edge-fade gradient colour (default #f1e6d6) */
  fadeColor?: string;
  /**
   * When true (default), icons use `mix-blend-multiply` so white “matte” baked into many
   * exported SVG/PNGs blends into sand-tone section backgrounds. Set false for full-colour
   * logos where multiply would muddy colours (e.g. partner strip on Paw Card).
   */
  knockOutIconWhiteMatte?: boolean;
  /** When both are set, a small tick/peso badge is shown centered under each item’s title. */
  includedBadgeSrc?: string;
  optionalBadgeSrc?: string;
}

export default function InclusionMarquee({
  items,
  speed = 40,
  iconSize = 72,
  fadeColor = '#f1e6d6',
  knockOutIconWhiteMatte = true,
  includedBadgeSrc,
  optionalBadgeSrc,
}: InclusionMarqueeProps) {
  const shouldReduce = useReducedMotion();

  const doubled = [...items, ...items];
  const showKeyBadges = Boolean(includedBadgeSrc && optionalBadgeSrc);
  const badgeSize = Math.round(iconSize * 0.22);

  return (
    <div
      style={{
        overflow: 'hidden',
        width: '100%',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 120,
          background: `linear-gradient(to right, ${fadeColor}, transparent)`,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 120,
          background: `linear-gradient(to left, ${fadeColor}, transparent)`,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          display: 'flex',
          width: 'max-content',
          animation: shouldReduce
            ? 'none'
            : `marqueeScroll ${speed}s linear infinite`,
        }}
      >
        {doubled.map((item, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              padding: `16px ${iconSize * 0.4}px`,
              minWidth: iconSize * 1.4,
            }}
          >
            <div className="shrink-0" style={{ width: iconSize, height: iconSize }}>
              <img
                src={item.icon}
                alt={item.label}
                className={knockOutIconWhiteMatte ? 'mix-blend-multiply' : undefined}
                style={{
                  width: iconSize,
                  height: iconSize,
                  objectFit: 'contain',
                  opacity: item.isUpgrade ? 0.78 : 1,
                }}
              />
            </div>
            {item.label || showKeyBadges ? (
              <div
                className="flex flex-col items-center"
                style={{ gap: item.label && showKeyBadges ? 6 : 0 }}
              >
                {item.label ? (
                  <span
                    className="font-lato"
                    style={{
                      fontSize: 12,
                      fontWeight: item.isUpgrade ? 400 : 600,
                      color: item.isUpgrade ? '#363737' : '#00577C',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      opacity: item.isUpgrade ? 0.6 : 1,
                    }}
                  >
                    {item.label}
                  </span>
                ) : null}
                {showKeyBadges ? (
                  <img
                    src={item.isUpgrade ? optionalBadgeSrc! : includedBadgeSrc!}
                    alt=""
                    width={badgeSize}
                    height={badgeSize}
                    className="object-contain drop-shadow-sm"
                    style={{ width: badgeSize, height: badgeSize }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
