import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import BorderGlow from '../home/BorderGlow.js';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice.js';

const springCfg = { damping: 30, stiffness: 100, mass: 2 };
const ROTATE_AMP = 8;
const SCALE_HOVER = 1.03;

/** Scale hover when tilt is off: soft ease, no bounce — reads as a light accent */
const HOVER_GROW_TRANSITION = {
  type: 'tween' as const,
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

interface BrandCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  disableTilt?: boolean;
  /** When tilt is disabled, optional scale on hover (non-touch pointers only). Ignored without `disableTilt`. */
  hoverScale?: number;
}

export function BrandCard({
  children,
  className,
  glowColor = '252 188 90',
  disableTilt = false,
  hoverScale,
}: BrandCardProps) {
  const isTouch = useIsTouchDevice();
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), springCfg);
  const rotateY = useSpring(useMotionValue(0), springCfg);
  const scale = useSpring(1, springCfg);

  function handleMouse(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -ROTATE_AMP);
    rotateY.set((offsetX / (rect.width / 2)) * ROTATE_AMP);
  }

  const inner = (
    <BorderGlow
      glowColor={glowColor}
      backgroundColor="#FAF6F0"
      borderRadius={24}
      glowIntensity={0.8}
      coneSpread={30}
      colors={['#FCBC5A', '#F5A623', '#f1e6d6']}
      className={className}
      style={{ height: '100%' }}
    >
      {children}
    </BorderGlow>
  );

  if (isTouch || disableTilt) {
    const showHoverGrow = disableTilt && !isTouch && hoverScale != null && hoverScale > 1;
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ height: '100%' }}
        whileHover={showHoverGrow ? { scale: hoverScale } : undefined}
        transition={{
          opacity: { duration: 0.4, ease: 'easeOut' },
          y: { duration: 0.4, ease: 'easeOut' },
          scale: HOVER_GROW_TRANSITION,
        }}
      >
        {inner}
      </motion.div>
    );
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseEnter={() => scale.set(SCALE_HOVER)}
      onMouseLeave={() => {
        scale.set(1);
        rotateX.set(0);
        rotateY.set(0);
      }}
      style={{ perspective: '800px', height: '100%' }}
    >
      <motion.div
        style={{ rotateX, rotateY, scale, transformStyle: 'preserve-3d', height: '100%' }}
      >
        {inner}
      </motion.div>
    </div>
  );
}
