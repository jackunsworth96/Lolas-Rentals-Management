import {
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import menuPaw from '../../assets/Menu_Paw_Clean.png';
import navHome from '../../assets/nav-buttons/Nav Home.svg';
import navReserve from '../../assets/nav-buttons/Nav Reserve.svg';
import navTransfers from '../../assets/nav-buttons/Nav Transfers.svg';
import navRepairs from '../../assets/nav-buttons/Nav Repairs.svg';
import navAbout from '../../assets/nav-buttons/Nav About.svg';
import navPawCard from '../../assets/nav-buttons/Nav Paw Card.svg';
import navExtend from '../../assets/nav-buttons/Nav Extend.svg';
import navPartners from '../../assets/nav-buttons/Nav Partners.svg';
import lolaLogo from '../../assets/Hero/logo-lola-rentals-1.svg';
import { instaIcon, phoneIcon, locationIcon } from '../public/customerContactIcons.js';
import { GOOGLE_MAPS_PLACE_URL } from '../../config/maps.js';
import './BubbleMenu.css';

// ── Types ─────────────────────────────────────────────────────────────────────

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

/** Kept for PageLayout API compatibility — logo prop is no longer rendered. */
interface TopNavProps {
  logo: string;
  logoAlt?: string;
  items: NavItem[];
  rightSlot?: ReactNode;
}

interface NavBubbleItem {
  label: string;
  iconSrc?: string;
  href: string;
  isSub: boolean;
}

// ── Per-route SVG (full graphic is the control; no separate pill chrome) ─────

const NAV_SVG_BY_HREF: Record<string, string> = {
  '/book': navHome,
  '/book/reserve': navReserve,
  '/book/transfers': navTransfers,
  '/book/repairs': navRepairs,
  '/book/about': navAbout,
  '/book/paw-card': navPawCard,
  '/paw-card/partners': navPartners,
  '/book/extend': navExtend,
};

function buildNavBubbleItems(items: NavItem[]): NavBubbleItem[] {
  const out: NavBubbleItem[] = [];
  for (const item of items) {
    if (item.isDropdown) {
      for (const sub of item.dropdownItems ?? []) {
        out.push({
          label: sub.label,
          href: sub.href,
          isSub: true,
          iconSrc: NAV_SVG_BY_HREF[sub.href],
        });
      }
    } else {
      out.push({
        label: item.label,
        href: item.href,
        isSub: false,
        iconSrc: NAV_SVG_BY_HREF[item.href],
      });
    }
  }
  return out;
}

// ── Framer Motion variants ────────────────────────────────────────────────────

const listVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
  exit: {
    transition: { staggerChildren: 0.04, staggerDirection: -1 as const },
  },
};

const itemVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 280, damping: 16 },
  },
  exit: {
    scale: 0,
    opacity: 0,
    transition: { duration: 0.15, ease: 'easeIn' as const },
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TopNav({ items, rightSlot }: TopNavProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/book' ? pathname === '/book' : pathname.startsWith(href);

  const navItems = useMemo(() => buildNavBubbleItems(items), [items]);

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 h-16 w-full overflow-visible border-b border-charcoal-brand/10 shadow-sm"
        style={{ backgroundColor: '#f1e6d6' }}
      >

        {/* Logo — far left */}
        <Link
          to="/book"
          aria-label="Lola's Rentals home"
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 md:left-5"
        >
          <img
            src={lolaLogo}
            alt="Lola's Rentals"
            className="h-9 w-auto object-contain md:h-10"
            draggable={false}
          />
        </Link>

        {/* Menu paw — centred */}
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
          className="absolute left-1/2 z-10 -translate-x-1/2 cursor-pointer focus:outline-none"
          style={{ top: -20 }}
        >
          <motion.img
            src={menuPaw}
            alt=""
            className="h-auto w-[7.2rem] max-w-none drop-shadow-md"
            whileHover={{ y: menuOpen ? 0 : 12 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          />
        </button>

        {/* Location + Phone + Language — far right */}
        <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 md:right-5 md:gap-2">
          <a
            href={GOOGLE_MAPS_PLACE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Find us on Google Maps"
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-charcoal-brand/10"
          >
            <img src={locationIcon} alt="" className="h-5 w-5 object-contain" aria-hidden />
          </a>
          <a
            href="tel:09694443413"
            aria-label="Call Lola's Rentals"
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-charcoal-brand/10"
          >
            <img src={phoneIcon} alt="" className="h-5 w-5 object-contain" aria-hidden />
          </a>
          <a
            href="https://instagram.com/lolasrentals"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Lola's Rentals on Instagram"
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-charcoal-brand/10"
          >
            <img src={instaIcon} alt="" className="h-5 w-5 object-contain" aria-hidden />
          </a>
          {rightSlot && <div>{rightSlot}</div>}
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="bubble-menu-overlay"
            className="bubble-menu-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="absolute right-5 top-2 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center text-charcoal-brand transition-colors hover:text-teal-brand"
            >
              <X size={24} />
            </button>

            <motion.ul
              className="pill-list"
              role="menu"
              aria-label="Site navigation"
              variants={listVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {navItems.map((entry) => (
                <motion.li
                  key={entry.href}
                  className={`pill-col${entry.isSub ? ' pill-col--sub' : ''}`}
                  role="none"
                  variants={itemVariants}
                >
                  <Link
                    to={entry.href}
                    role="menuitem"
                    aria-label={entry.label}
                    className={`nav-svg-link${isActive(entry.href) ? ' nav-svg-link--active' : ''}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    {entry.iconSrc ? (
                      <img
                        src={entry.iconSrc}
                        alt=""
                        className="nav-svg-link__img"
                        width={280}
                        height={120}
                        draggable={false}
                      />
                    ) : (
                      <span className="nav-svg-link__fallback">{entry.label}</span>
                    )}
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
