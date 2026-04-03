import { useReducedMotion } from 'framer-motion';

interface MarqueeItem {
  icon: string;
  label: string;
  isUpgrade?: boolean;
}

interface InclusionMarqueeProps {
  items: MarqueeItem[];
  speed?: number; // seconds for one full loop
}

export default function InclusionMarquee({
  items,
  speed = 40,
}: InclusionMarqueeProps) {
  const shouldReduce = useReducedMotion();

  // Duplicate for seamless infinite loop
  const doubled = [...items, ...items];

  return (
    <div
      style={{
        overflow: 'hidden',
        width: '100%',
        position: 'relative',
      }}
    >
      {/* Left fade edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 120,
          background: 'linear-gradient(to right, #E8DFD0, transparent)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Right fade edge */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 120,
          background: 'linear-gradient(to left, #E8DFD0, transparent)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Scrolling track */}
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
              gap: 12,
              padding: '24px 32px',
              minWidth: 120,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 14,
                opacity: item.isUpgrade ? 0.7 : 1,
              }}
            >
              <img
                src={item.icon}
                alt={item.label}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
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
          </div>
        ))}
      </div>
    </div>
  );
}
