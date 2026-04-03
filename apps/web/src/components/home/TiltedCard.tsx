import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface TiltedCardProps {
  icon: string;
  title: string;
  body: string;
  rotateAmplitude?: number;
  scaleOnHover?: number;
}

const springValues = { damping: 30, stiffness: 100, mass: 2 };

export default function TiltedCard({
  icon,
  title,
  body,
  rotateAmplitude = 12,
  scaleOnHover = 1.04,
}: TiltedCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);
  const [, setLastY] = useState(0);

  function handleMouse(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -rotateAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * rotateAmplitude);
    setLastY(offsetY);
  }

  function handleMouseEnter() {
    scale.set(scaleOnHover);
  }

  function handleMouseLeave() {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: '800px' }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          scale,
          borderRadius: '14px',
          backgroundColor: '#FFFFFF',
          boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
          padding: '40px',
          transformStyle: 'preserve-3d',
        }}
      >
        <img
          src={icon}
          alt=""
          style={{
            width: 64,
            height: 64,
            marginBottom: 20,
            display: 'block',
          }}
        />
        <h3
          className="font-headline font-bold"
          style={{
            fontSize: 22,
            color: '#00577C',
            marginBottom: 12,
            lineHeight: 1.3,
          }}
        >
          {title}
        </h3>
        <p
          className="font-lato"
          style={{
            fontSize: 16,
            color: '#363737',
            lineHeight: 1.65,
          }}
        >
          {body}
        </p>
      </motion.div>
    </div>
  );
}
