import pawPrint from '../../assets/Paw Divider.svg';

interface PawDividerProps {
  opacity?: number;
  size?: 'sm' | 'md';
  /** Replaces default `py-8` when set (e.g. `py-[1.6rem]` for tighter sections). */
  className?: string;
}

export function PawDivider({ opacity = 0.2, size = 'md', className }: PawDividerProps) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-12 w-12';
  return (
    <div className={`flex justify-center ${className ?? 'py-8'}`}>
      <img src={pawPrint} alt="" className={`${dim} bg-transparent`} style={{ opacity }} />
    </div>
  );
}
