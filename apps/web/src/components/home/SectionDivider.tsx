import roadDash from '../../assets/Original Assests/road.svg';
import roadSep  from '../../assets/Original Assests/separator-3.svg';

type DividerVariant = 'dash' | 'bold';

interface SectionDividerProps {
  variant?: DividerVariant;
  flip?: boolean;
}

const SRCS: Record<DividerVariant, string> = {
  dash: roadDash,
  bold: roadSep,
};

export default function SectionDivider({ variant = 'dash', flip = false }: SectionDividerProps) {
  return (
    <div
      style={{
        width: '100%',
        overflow: 'hidden',
        lineHeight: 0,
        marginTop: -4,
        marginBottom: -4,
        transform: flip ? 'scaleX(-1)' : 'none',
      }}
    >
      <img
        src={SRCS[variant]}
        alt=""
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          minWidth: 800,
          margin: 0,
          padding: 0,
        }}
      />
    </div>
  );
}
