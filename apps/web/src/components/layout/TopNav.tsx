import {
  useState,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import menuPaw from '../../assets/Menu_Paw_Clean.png';
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

interface PillItem {
  label: string;
  icon: string;
  href: string;
  rotation: number;
  hoverBg: string;
  hoverColor: string;
  isSub: boolean;
}

// ── Per-route visual config ───────────────────────────────────────────────────

const PILL_VISUALS: Record<
  string,
  { icon: string; rotation: number; hoverBg: string; hoverColor: string }
> = {
  '/book':           { icon: '🏡', rotation: -6, hoverBg: '#00577C', hoverColor: '#ffffff' },
  '/book/reserve':   { icon: '🛵', rotation:  5, hoverBg: '#FCBC5A', hoverColor: '#363737' },
  '/book/transfers': { icon: '🚐', rotation: -4, hoverBg: '#00577C', hoverColor: '#ffffff' },
  '/book/repairs':   { icon: '🔧', rotation:  6, hoverBg: '#363737', hoverColor: '#FCBC5A' },
  '/book/about':     { icon: '🐾', rotation: -5, hoverBg: '#FCBC5A', hoverColor: '#363737' },
  '/book/paw-card':  { icon: '🪪', rotation:  3, hoverBg: '#1A7A6E', hoverColor: '#ffffff' },
  '/book/extend':    { icon: '📅', rotation: -3, hoverBg: '#1A7A6E', hoverColor: '#ffffff' },
};

function buildPills(items: NavItem[]): PillItem[] {
  const pills: PillItem[] = [];
  for (const item of items) {
    if (item.isDropdown) {
      // Expand dropdown children directly into the pill list as sub-items
      for (const sub of item.dropdownItems ?? []) {
        const v = PILL_VISUALS[sub.href] ?? {
          icon: '•', rotation: 0, hoverBg: '#00577C', hoverColor: '#fff',
        };
        pills.push({ label: sub.label, href: sub.href, isSub: true, ...v });
      }
    } else {
      const v = PILL_VISUALS[item.href] ?? {
        icon: '•', rotation: 0, hoverBg: '#00577C', hoverColor: '#fff',
      };
      pills.push({ label: item.label, href: item.href, isSub: false, ...v });
    }
  }
  return pills;
}

// ── Framer Motion variants ────────────────────────────────────────────────────

// Orchestrates stagger across all pill children
const listVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
  exit: {
    transition: { staggerChildren: 0.04, staggerDirection: -1 as const },
  },
};

// Pill: scale-bounce pop (mimics back.out(1.5) via spring)
const pillVariants = {
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

// Label: slides up into view after the pill has scaled in
const labelVariants = {
  hidden: { y: 22, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.28, ease: 'easeOut' as const },
  },
  exit: {
    y: 16,
    opacity: 0,
    transition: { duration: 0.12, ease: 'easeIn' as const },
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TopNav({ items, rightSlot }: TopNavProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/book' ? pathname === '/book' : pathname.startsWith(href);

  const pills = useMemo(() => buildPills(items), [items]);

  return (
    <>
      {/*
       * overflow-visible lets the paw spill 14px above the nav top edge.
       * If the paw top is clipped when the nav sticks, it is caused by
       * PageLayout's overflowX:'hidden' (CSS forces overflow-y:auto).
       * Fix: remove overflowX from PageLayout's root div.
       */}
      <header className="relative sticky top-0 z-50 h-16 w-full overflow-visible border-b border-charcoal-brand/10 bg-sand-brand shadow-sm">

        {/* Paw — menu trigger */}
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
          className="absolute left-1/2 z-10 -translate-x-1/2 cursor-pointer focus:outline-none"
          style={{ top: -14 }}
        >
          <motion.img
            src={menuPaw}
            alt=""
            className="w-20 drop-shadow-md"
            whileHover={{ y: menuOpen ? 0 : 6 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        </button>

        {/* Basket / rightSlot */}
        {rightSlot && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {rightSlot}
          </div>
        )}
      </header>

      {/* ── BubbleMenu overlay — anchored below the nav bar ── */}
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
            {/* Close button */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="absolute right-5 top-4 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center text-charcoal-brand transition-colors hover:text-teal-brand"
            >
              <X size={24} />
            </button>

            {/* Staggered pill grid */}
            <motion.ul
              className="pill-list"
              role="menu"
              aria-label="Site navigation"
              variants={listVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {pills.map((pill) => (
                <motion.li
                  key={pill.href}
                  className={`pill-col${pill.isSub ? ' pill-col--sub' : ''}`}
                  role="none"
                  variants={pillVariants}
                >
                  <Link
                    to={pill.href}
                    role="menuitem"
                    className={`pill-link${isActive(pill.href) ? ' pill-link--active' : ''}`}
                    style={{
                      '--item-rot': `${pill.rotation}deg`,
                      '--hover-bg': pill.hoverBg,
                      '--hover-color': pill.hoverColor,
                    } as CSSProperties}
                    onClick={() => setMenuOpen(false)}
                  >
                    <motion.span className="pill-label" variants={labelVariants}>
                      <span className="pill-icon" aria-hidden="true">{pill.icon}</span>
                      {pill.label}
                    </motion.span>
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
