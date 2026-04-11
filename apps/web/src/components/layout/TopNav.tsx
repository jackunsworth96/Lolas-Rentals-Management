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
      <header className="fixed top-0 left-0 right-0 z-50 h-16 w-full overflow-visible border-b border-charcoal-brand/10 bg-sand-brand shadow-sm">

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

        {rightSlot && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {rightSlot}
          </div>
        )}
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
