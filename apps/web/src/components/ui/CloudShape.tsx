import type { CSSProperties } from 'react';

export interface CloudShapeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: CSSProperties;
}

export function CloudShape({ size = 'md', className = '', style }: CloudShapeProps) {
  const dims = {
    sm: { base: 'w-20 h-8', b1: 'w-10 h-10 -top-3 left-3', b2: 'w-8 h-8 -top-2 left-10' },
    md: { base: 'w-36 h-12', b1: 'w-16 h-16 -top-5 left-6', b2: 'w-12 h-12 -top-3 left-16' },
    lg: { base: 'w-56 h-16', b1: 'w-24 h-24 -top-8 left-8', b2: 'w-20 h-20 -top-5 left-24' },
  }[size];

  return (
    <div className={`relative pointer-events-none ${dims.base} ${className}`} style={style}>
      <div className="absolute inset-0 rounded-full bg-[#EDE8DF]" />
      <div className={`absolute rounded-full bg-[#EDE8DF] ${dims.b1}`} />
      <div className={`absolute rounded-full bg-[#EDE8DF] ${dims.b2}`} />
    </div>
  );
}
