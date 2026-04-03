import separatorA from '../../assets/Original Assests/separator.svg';
import separatorB from '../../assets/Original Assests/separator-3.svg';

interface SectionDividerProps {
  variant?: 'a' | 'b';
  flip?: boolean;
}

export default function SectionDivider({
  variant = 'a',
  flip = false,
}: SectionDividerProps) {
  const src = variant === 'a' ? separatorA : separatorB;

  return (
    <div
      style={{
        width: '100%',
        overflow: 'hidden',
        lineHeight: 0,
        transform: flip ? 'scaleY(-1)' : 'none',
        marginTop: -2,
        marginBottom: -2,
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          minWidth: 800,
        }}
      />
    </div>
  );
}
