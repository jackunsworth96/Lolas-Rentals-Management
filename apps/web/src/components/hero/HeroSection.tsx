import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import flowerLeft   from '../../assets/Original Assests/flower-left.svg';
import flowerRight  from '../../assets/Original Assests/flower-right.svg';
import bookNow      from '../../assets/Original Assests/book-now.svg';
import cloud1       from '../../assets/Original Assests/cloud-left-to-right-1.svg';
import cloud2       from '../../assets/Original Assests/cloud-left-to-right-2.svg';
import cloud3       from '../../assets/Original Assests/cloud-left-to-right-3.svg';
import lolaScooter  from '../../assets/scene/lola-scooter.svg';

// Cloud definitions — px/py are parallax multipliers, higher = more movement
const CLOUDS = [
  { src: cloud1, width: 180, top: '18%', left: '18%', px: -0.10, py: -0.05 },
  { src: cloud2, width: 120, top: '23%', left: '36%', px:  0.13, py: -0.06 },
  { src: cloud3, width: 165, top: '15%', left: '54%', px: -0.11, py:  0.06 },
  { src: cloud1, width: 135, top: '28%', left: '70%', px:  0.08, py: -0.04 },
  { src: cloud2, width:  85, top: '20%', left: '78%', px: -0.14, py:  0.07 },
];

// How quickly clouds catch up to mouse target (lower = more inertia)
const LERP   = 0.055;
// Max movement range in px (tighter on mobile so parallax does not drift too far)
const RANGE  = typeof window !== 'undefined' && window.innerWidth < 768 ? 400 : 700;

const FLORAL_PX = 0.025;
const FLORAL_PY = 0.015;

export function HeroSection() {
  const navigate   = useNavigate();
  const heroRef    = useRef<HTMLDivElement>(null);
  const targetRef  = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef     = useRef<number>(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = heroRef.current?.getBoundingClientRect();
      if (!rect || !rect.width) return;
      targetRef.current = {
        x: (e.clientX - rect.left  - rect.width  / 2) / rect.width,
        y: (e.clientY - rect.top   - rect.height / 2) / rect.height,
      };
    };
    window.addEventListener('mousemove', onMove);

    const tick = () => {
      const t  = targetRef.current;
      const c  = currentRef.current;
      const nx = c.x + (t.x - c.x) * LERP;
      const ny = c.y + (t.y - c.y) * LERP;
      currentRef.current = { x: nx, y: ny };
      setPos({ x: nx, y: ny });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <section ref={heroRef} className="hero-section">

      {/* Florals — clipped by hero overflow:hidden */}
      <img
        src={flowerLeft}
        alt=""
        aria-hidden="true"
        className="hero-floral hero-floral--left"
        style={{
          transform: `translate(${pos.x * FLORAL_PX * RANGE}px, ${pos.y * FLORAL_PY * RANGE}px)`,
        }}
      />
      <img
        src={flowerRight}
        alt=""
        aria-hidden="true"
        className="hero-floral hero-floral--right"
        style={{
          transform: `translate(${pos.x * -FLORAL_PX * RANGE}px, ${pos.y * FLORAL_PY * RANGE}px)`,
        }}
      />

      {/* Clouds — parallax with inertia */}
      {CLOUDS.map((c, i) => (
        <img
          key={i}
          src={c.src}
          alt=""
          aria-hidden="true"
          className="hero-cloud-parallax"
          style={{
            width: c.width,
            maxWidth: '30vw',
            top:  c.top,
            left: c.left,
            transform: `translate(
              ${pos.x * c.px * RANGE}px,
              ${pos.y * c.py * RANGE}px
            )`,
          }}
        />
      ))}

      {/* Text content — scales up gently when mouse is over hero */}
      <div
        className="hero-content"
        style={{
          transform: `scale(${1 + Math.sqrt(pos.x * pos.x + pos.y * pos.y) * 0.04})`,
          transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <h1 className="hero-title">
          Rated by Many,<br />Rooted in Community
        </h1>
        <p className="hero-subtitle">Your Socially Responsible Rental Service</p>
        <button
          type="button"
          onClick={() => navigate('/book/reserve')}
          className="group hero-cta-btn"
          aria-label="Book Now"
        >
          <img
            src={bookNow}
            alt="Book Now"
            className="transition-transform duration-150 group-hover:scale-105 group-active:scale-95"
            style={{ width: '180px' }}
          />
        </button>
      </div>

      {/* Road strip — CSS dashed line with Lola */}
      <div className="hero-road-strip" aria-hidden="true">
        <div className="hero-road-dashes" />
        <img src={lolaScooter} alt="" className="hero-lola" />
      </div>

    </section>
  );
}
