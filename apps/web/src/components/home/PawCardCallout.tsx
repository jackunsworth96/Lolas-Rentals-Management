import { Link } from 'react-router-dom';
import pawPrint from '../../assets/Paw Print.svg';

export function PawCardCallout() {
  return (
    <div
      style={{
        backgroundColor: '#00577C',
        borderRadius: 20,
        padding: '48px 40px 40px',
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 400,
      }}
    >
      {/* Raster inside SVG: tint via mask so fill is brand gold, rest transparent */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          width: 90,
          height: 90,
          pointerEvents: 'none',
          zIndex: 2,
          backgroundColor: 'rgba(252, 188, 90, 0.25)',
          WebkitMaskImage: `url(${pawPrint})`,
          maskImage: `url(${pawPrint})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
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
            paddingRight: 0,
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
          The Siargao Paw Card is a community discount and donation scheme. Customers who rent with
          Lola&apos;s Rentals receive a card that gives them exclusive discounts at partner establishments across
          the island. Every time a customer logs a saving, Lola&apos;s Rentals matches it peso-for-peso as a
          charitable donation to Be Pawsitive — the local NGO running spay, neuter and vaccination programmes for
          Siargao&apos;s street animals.
        </p>
      </div>

      <Link
        to="/book/paw-card"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
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
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            lineHeight: 1.25,
            textAlign: 'left',
          }}
        >
          <span>Existing customer?</span>
          <span style={{ fontStyle: 'italic' }}>Log in to your Paw Card.</span>
        </span>
      </Link>
    </div>
  );
}
