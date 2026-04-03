interface InclusionIconProps {
  icon: string;
  label: string;
  muted?: boolean;
}

export default function InclusionIcon({
  icon,
  label,
  muted = false,
}: InclusionIconProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '16px 8px',
        opacity: muted ? 0.75 : 1,
      }}
    >
      <img
        src={icon}
        alt={label}
        style={{ width: 60, height: 60, objectFit: 'contain' }}
      />
      <span
        className="font-lato"
        style={{
          fontSize: 13,
          color: '#363737',
          textAlign: 'center',
          fontWeight: muted ? 400 : 600,
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>
    </div>
  );
}
