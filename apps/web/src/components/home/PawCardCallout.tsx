import { Link } from 'react-router-dom';
import lolaFace from '../../assets/Lola Face Cartoon.svg';

export function PawCardCallout() {
  return (
    <div
      style={{
        backgroundColor: '#00577C',
        borderRadius: 20,
        padding: '48px 40px 40px',
        position: 'relative',
        overflow: 'visible',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 400,
      }}
    >
      {/* Lola image — top right, partially overlapping */}
      <img
        src={lolaFace}
        alt="Lola — our mascot"
        style={{
          position: 'absolute',
          top: -40,
          right: -20,
          width: 140,
          height: 140,
          objectFit: 'contain',
          zIndex: 2,
        }}
      />

      {/* Content */}
      <div>
        <h3
          className="font-headline font-black"
          style={{
            fontSize: 'clamp(32px, 4vw, 48px)',
            lineHeight: 1.15,
            color: '#FFFFFF',
            marginBottom: 20,
            paddingRight: 100,
          }}
        >
          Every Peso
          <br />
          <span style={{ fontStyle: 'italic', color: '#FCBC5A' }}>
            Wags a Tail
          </span>
        </h3>
        <p
          className="font-lato"
          style={{
            fontSize: 16,
            color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.7,
            marginBottom: 32,
          }}
        >
          Join the Paw Card program. Log your savings at 70+ partner businesses
          and we match every peso as a donation to BePawsitive — Siargao&apos;s
          local animal welfare NGO.
        </p>
      </div>

      <Link
        to="/book/paw-card"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 18,
          fontWeight: 700,
          color: '#FCBC5A',
          textDecoration: 'none',
          fontFamily: 'Lato, sans-serif',
          transition: 'opacity 0.2s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.opacity = '0.8';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.opacity = '1';
        }}
      >
        Get Your Paw Card
        <span style={{ transition: 'transform 0.2s ease' }}>🐾</span>
      </Link>
    </div>
  );
}
