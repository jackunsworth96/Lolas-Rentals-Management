import { useRef } from 'react';
import './SpotlightCard.css';

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  style?: React.CSSProperties;
}

const SpotlightCard = ({
  children,
  className = '',
  spotlightColor = 'rgba(252, 188, 90, 0.15)',
  style,
}: SpotlightCardProps) => {
  const divRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    divRef.current.style.setProperty('--mouse-x', `${x}px`);
    divRef.current.style.setProperty('--mouse-y', `${y}px`);
    divRef.current.style.setProperty('--spotlight-color', spotlightColor);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      className={`card-spotlight ${className}`}
      style={style}
    >
      {children}
    </div>
  );
};

export default SpotlightCard;
