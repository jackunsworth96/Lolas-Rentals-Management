type Color = 'gray' | 'blue' | 'green' | 'yellow' | 'amber' | 'red' | 'purple';

const COLOR_CLASSES: Record<Color, string> = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
};

interface BadgeProps {
  children: React.ReactNode;
  color?: Color;
  className?: string;
}

export function Badge({ children, color = 'gray', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COLOR_CLASSES[color]} ${className}`}>
      {children}
    </span>
  );
}
