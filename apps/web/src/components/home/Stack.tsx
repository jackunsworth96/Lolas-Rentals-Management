import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import './Stack.css';

interface AnimationConfig {
  stiffness: number;
  damping: number;
}

interface StackProps {
  randomRotation?: boolean;
  sensitivity?: number;
  cards?: ReactNode[];
  animationConfig?: AnimationConfig;
  sendToBackOnClick?: boolean;
  autoplay?: boolean;
  autoplayDelay?: number;
  pauseOnHover?: boolean;
  mobileClickOnly?: boolean;
  mobileBreakpoint?: number;
}

interface CardItem {
  id: number;
  content: ReactNode;
}

interface CardRotateProps {
  children: ReactNode;
  onSendToBack: () => void;
  sensitivity: number;
  disableDrag?: boolean;
}

// ── CardRotate ────────────────────────────────────────────────

function CardRotate({
  children,
  onSendToBack,
  sensitivity,
  disableDrag = false,
}: CardRotateProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], [60, -60]);
  const rotateY = useTransform(x, [-100, 100], [-60, 60]);

  function handleDragEnd(
    _: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number; y: number } },
  ) {
    if (
      Math.abs(info.offset.x) > sensitivity ||
      Math.abs(info.offset.y) > sensitivity
    ) {
      onSendToBack();
    } else {
      x.set(0);
      y.set(0);
    }
  }

  if (disableDrag) {
    return (
      <motion.div
        className="card-rotate-disabled"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onClick={onSendToBack}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="card-rotate"
      style={{ x, y, rotateX, rotateY, transformStyle: 'preserve-3d' }}
      drag
      dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
      dragElastic={0.6}
      whileTap={{ cursor: 'grabbing' }}
      onDragEnd={handleDragEnd}
      onClick={onSendToBack}
    >
      {children}
    </motion.div>
  );
}

// ── Stack ─────────────────────────────────────────────────────

export default function Stack({
  randomRotation = false,
  sensitivity = 200,
  cards = [],
  animationConfig = { stiffness: 260, damping: 20 },
  sendToBackOnClick = false,
  autoplay = false,
  autoplayDelay = 3000,
  pauseOnHover = false,
  mobileClickOnly = false,
  mobileBreakpoint = 768,
}: StackProps) {
  const [cardItems, setCardItems] = useState<CardItem[]>(() =>
    cards.map((content, i) => ({ id: i, content })),
  );
  const [hovering, setHovering] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Stable per-card random rotations, generated once on mount
  const rotationsRef = useRef<number[]>(
    cards.map(() => Math.random() * 10 - 5),
  );

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < mobileBreakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [mobileBreakpoint]);

  // Send a card to the back of the stack
  const sendToBack = (id: number) => {
    setCardItems((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const item = prev[idx];
      return [...prev.slice(0, idx), ...prev.slice(idx + 1), item];
    });
  };

  // Autoplay: cycle top card to back on an interval
  useEffect(() => {
    if (!autoplay) return;
    if (pauseOnHover && hovering) return;

    const id = setInterval(() => {
      setCardItems((prev) => {
        if (prev.length <= 1) return prev;
        const [first, ...rest] = prev;
        return [...rest, first];
      });
    }, autoplayDelay);

    return () => clearInterval(id);
  }, [autoplay, autoplayDelay, pauseOnHover, hovering]);

  const disableDrag = mobileClickOnly && isMobile;

  return (
    <div
      className="stack-container"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {cardItems.map((card, index) => {
        const isTop = index === 0;
        const rotation = randomRotation
          ? (rotationsRef.current[card.id] ?? 0)
          : 0;

        return (
          <motion.div
            key={card.id}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              zIndex: cardItems.length - index,
            }}
            animate={{
              scale: 1 - index * 0.06,
              y: index * -10,
              rotate: rotation,
              opacity: index < 4 ? 1 : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: animationConfig.stiffness,
              damping: animationConfig.damping,
            }}
          >
            <CardRotate
              onSendToBack={() => {
                if (isTop || sendToBackOnClick) sendToBack(card.id);
              }}
              sensitivity={sensitivity}
              disableDrag={!isTop || disableDrag}
            >
              <div className="card">{card.content}</div>
            </CardRotate>
          </motion.div>
        );
      })}
    </div>
  );
}
