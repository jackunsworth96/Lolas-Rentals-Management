import pawPrint from '../../assets/Paw Print.svg';

interface PawDividerProps {
  opacity?: number;
  size?: 'sm' | 'md';
}

export function PawDivider({ opacity = 0.2, size = 'md' }: PawDividerProps) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-12 w-12';
  return (
    <div className="flex justify-center py-8">
      <img src={pawPrint} alt="" className={`${dim} bg-transparent`} style={{ opacity }} />
    </div>
  );
}
