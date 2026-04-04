import { useRef, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import gsap from 'gsap';
import './PillNav.css';

interface DropdownItem {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  isDropdown?: boolean;
  dropdownItems?: DropdownItem[];
}

interface PillNavProps {
  logo: string;
  logoAlt?: string;
  items: NavItem[];
  activeHref?: string;
  className?: string;
  ease?: string;
  baseColor?: string;
  navBgColor?: string;
  pillColor?: string;
  pillActiveColor?: string;
  pillActiveTextColor?: string;
  hoveredPillTextColor?: string;
  pillTextColor?: string;
  theme?: 'light' | 'dark';
  initialLoadAnimation?: boolean;
  rightSlot?: ReactNode;
}

export default function PillNav({
  logo,
  logoAlt = "Logo",
  items,
  ease = 'power2.out',
  baseColor = '#f1e6d6',
  navBgColor,
  pillColor = '#00577C',
  pillActiveColor,
  pillActiveTextColor = '#FAF6F0',
  hoveredPillTextColor = '#FAF6F0',
  pillTextColor = '#363737',
  theme = 'light',
  initialLoadAnimation = false,
  className = '',
  rightSlot,
}: PillNavProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const pillRefs = useRef<(HTMLDivElement | null)[]>([]);
  const timelines = useRef<(gsap.core.Timeline | null)[]>([]);
  const dropdownWrapRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const easeRef = useRef(ease);
  const initialLoadRef = useRef(initialLoadAnimation);

  // Keep ease ref current without triggering re-effect
  easeRef.current = ease;

  // Close mobile menu and dropdowns on route change
  useEffect(() => {
    setMenuOpen(false);
    setOpenDropdown(null);
  }, [pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return;
    function handleClick(e: MouseEvent) {
      const ref = dropdownWrapRefs.current[openDropdown!];
      if (ref && !ref.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openDropdown]);

  // Set up GSAP timelines once on mount
  useEffect(() => {
    timelines.current = pillRefs.current.map((pillEl) => {
      if (!pillEl) return null;

      const circle = pillEl.querySelector<HTMLElement>('.pill-hover-circle');
      const labelEl = pillEl.querySelector<HTMLElement>('.pill-label');
      const hoverLabelEl = pillEl.querySelector<HTMLElement>('.pill-hover-label');

      if (!circle || !labelEl || !hoverLabelEl) return null;

      const tl = gsap.timeline({ paused: true });
      tl.to(circle, {
        width: '200%',
        height: '400%',
        duration: 0.35,
        ease: easeRef.current,
      })
        .to(labelEl, { y: '-110%', duration: 0.3, ease: easeRef.current }, '<')
        .to(hoverLabelEl, { y: '0%', opacity: 1, duration: 0.3, ease: easeRef.current }, '<');

      return tl;
    });

    if (initialLoadRef.current) {
      const pills = pillRefs.current.filter(Boolean);
      gsap.from(pills, {
        opacity: 0,
        y: -8,
        stagger: 0.06,
        duration: 0.4,
        ease: 'power2.out',
        delay: 0.1,
      });
    }

    return () => {
      timelines.current.forEach((tl) => tl?.kill());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = (href: string) =>
    href === '/book' ? pathname === '/book' : pathname.startsWith(href);

  const cssVars = {
    '--base': baseColor,
    '--nav-bg': navBgColor ?? baseColor,
    '--pill-hover-bg': pillColor,
    '--pill-active-bg': pillActiveColor ?? pillColor,
    '--pill-active-text': pillActiveTextColor,
    '--pill-text': pillTextColor,
    '--hover-text': hoveredPillTextColor,
  } as React.CSSProperties;

  return (
    <>
      <header
        className={`pill-nav ${className}`}
        style={cssVars}
        data-theme={theme}
      >
        {/* Logo */}
        <Link
          to="/book"
          className="pill-nav-logo-link"
          onClick={() => setMenuOpen(false)}
        >
          <img
            src={logo}
            alt={logoAlt}
            style={{
              height: 44,
              width: 'auto',
              display: 'block',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
            }}
          />
        </Link>

        {/* Desktop nav items */}
        <ul className="pill-nav-items">
          {items.map((item, i) => {
            const active = isActive(item.href);

            if (item.isDropdown) {
              return (
                <li key={item.href} style={{ position: 'relative' }}>
                  <div
                    className="pill-dropdown-wrap"
                    ref={(el) => { dropdownWrapRefs.current[item.href] = el; }}
                  >
                    <div
                      ref={(el) => { pillRefs.current[i] = el; }}
                      className={`pill${active ? ' is-active' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setOpenDropdown((prev) =>
                          prev === item.href ? null : item.href
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpenDropdown((prev) =>
                            prev === item.href ? null : item.href
                          );
                        }
                      }}
                      onMouseEnter={() => {
                        if (!active) timelines.current[i]?.play();
                      }}
                      onMouseLeave={() => {
                        if (!active) timelines.current[i]?.reverse();
                      }}
                    >
                      <span className="pill-hover-circle" />
                      <span className="pill-label-wrap">
                        <span className="pill-label">{item.label} ▾</span>
                        <span className="pill-hover-label">{item.label} ▾</span>
                      </span>
                    </div>

                    {openDropdown === item.href && item.dropdownItems && (
                      <div className="pill-dropdown">
                        {item.dropdownItems.map((d) => (
                          <Link
                            key={d.href}
                            to={d.href}
                            className={`pill-dropdown-item${isActive(d.href) ? ' is-active' : ''}`}
                            onClick={() => setOpenDropdown(null)}
                          >
                            {d.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link to={item.href} style={{ textDecoration: 'none' }}>
                  <div
                    ref={(el) => { pillRefs.current[i] = el; }}
                    className={`pill${active ? ' is-active' : ''}`}
                    onMouseEnter={() => {
                      if (!active) timelines.current[i]?.play();
                    }}
                    onMouseLeave={() => {
                      if (!active) timelines.current[i]?.reverse();
                    }}
                  >
                    <span className="pill-hover-circle" />
                    <span className="pill-label-wrap">
                      <span className="pill-label">{item.label}</span>
                      <span className="pill-hover-label">{item.label}</span>
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Right slot (basket icon etc.) + hamburger on mobile */}
        <div className="pill-nav-right">
          {rightSlot}
          <button
            type="button"
            className="pill-nav-hamburger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile popover menu */}
      {menuOpen && (
        <div className="pill-nav-mobile-menu" style={cssVars}>
          {items.map((item) => {
            const active = isActive(item.href);

            if (item.isDropdown) {
              return (
                <div key={item.href}>
                  <span
                    className={`pill-nav-mobile-group-label${active ? ' is-active' : ''}`}
                  >
                    {item.label}
                  </span>
                  {item.dropdownItems?.map((d) => (
                    <Link
                      key={d.href}
                      to={d.href}
                      className={`pill-nav-mobile-sub${isActive(d.href) ? ' is-active' : ''}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      {d.label}
                    </Link>
                  ))}
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                to={item.href}
                className={`pill-nav-mobile-link${active ? ' is-active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
