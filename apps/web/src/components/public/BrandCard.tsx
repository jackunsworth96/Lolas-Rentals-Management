import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import BorderGlow from '../home/BorderGlow.js';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice.js';

const springCfg = { damping: 30, stiffness: 100, mass: 2 };
const ROTATE_AMP = 8;
const SCALE_HOVER = 1.03;

interface BrandCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  disableTilt?: boolean;
}

export function BrandCard({
  children,
  className,
  glowColor = '252 188 90',
  disableTilt = false,
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
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ height: '100%', animation: 'borderPulse 2.4s ease-in-out infinite' }}
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
