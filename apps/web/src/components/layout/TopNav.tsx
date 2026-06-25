import {
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import menuPaw from '../../assets/Menu_Paw_Clean.png';
import { CloudinaryImage } from '../ui/CloudinaryImage.js';
import lolaLogo from '../../assets/Hero/logo-lola-rentals-1.svg';
import { instaIcon, phoneIcon, locationIcon } from '../public/customerContactIcons.js';
import { GOOGLE_MAPS_PLACE_URL } from '../../config/maps.js';
import type { PublicPartnerBenefit } from '../../api/partners.js';
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
  partnerBenefit?: PublicPartnerBenefit | null;
}

interface NavBubbleItem {
  label: string;
  iconPublicId?: string;
  href: string;
  isSub: boolean;
}

// ── Per-route Cloudinary public ID (full graphic is the control; no separate pill chrome) ─────

const NAV_CLOUDINARY_BY_HREF: Record<string, string> = {
  '/book': 'Lolas_icons_Home_sheeyj',
  '/book/reserve': 'Lolas_icons_Reserve_oxqtua',
  '/book/extend': 'Lolas_icons_Extend_rental_dpydb4',
  '/paw-card/partners': 'Lolas_icons_Paw_card_mw4zic',
  '/book/transfers': 'Lolas_icons_Transfers_fnkr0d',
  '/book/repairs': 'Lolas_icons_Repairs_nkoe0r',
  '/book/about': 'Lolas_icons_About_xdznnb',
  '/book/bepawsitive': 'Lolas_icons_Community_xbt94y',
  '/book/impact': 'Lolas_icons_Community_xbt94y',
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
          iconPublicId: NAV_CLOUDINARY_BY_HREF[sub.href],
        });
      }
    } else {
      out.push({
        label: item.label,
        href: item.href,
        isSub: false,
        iconPublicId: NAV_CLOUDINARY_BY_HREF[item.href],
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

export default function TopNav({ items, rightSlot, partnerBenefit }: TopNavProps) {
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

        {/* Logo — far left; desktop shows co-brand inline, mobile uses banner below */}
        <div className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2 md:left-5">
          <Link to="/book" aria-label="Lola's Rentals home">
            <img
              src={lolaLogo}
              alt="Lola's Rentals"
              className="h-9 w-auto object-contain md:h-10"
              draggable={false}
            />
          </Link>

          {/* Desktop co-brand — hidden on mobile, only shown when partner has a logo */}
          <AnimatePresence>
            {partnerBenefit?.logoUrl && (
              <motion.div
                key="partner-cobrand"
                className="hidden md:flex items-center gap-2"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <span className="select-none text-sm font-light text-charcoal-brand/40" aria-hidden="true">×</span>
                <img
                  src={partnerBenefit.logoUrl}
                  alt={partnerBenefit.name}
                  className="w-auto object-contain"
                  style={{
                    maxWidth: `${partnerBenefit.logoDisplayWidth ?? 96}px`,
                    maxHeight: `${partnerBenefit.logoDisplayHeight ?? 32}px`,
                  }}
                  draggable={false}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Menu paw — centred */}
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
          className="absolute left-1/2 z-10 -translate-x-1/2 cursor-pointer focus:outline-none max-md:top-[-12px] md:top-[-20px]"
        >
          <motion.img
            src={menuPaw}
            alt=""
            className="h-auto w-[6.1rem] max-w-none drop-shadow-md md:w-[7.2rem]"
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

      {/* Mobile partner banner — sits flush below the fixed nav, only when partner has a logo */}
      <AnimatePresence>
        {partnerBenefit?.logoUrl && (
          <motion.div
            key="mobile-partner-banner"
            className="md:hidden fixed left-0 right-0 z-40 flex items-center justify-center gap-2.5 px-4 py-1.5 border-b border-charcoal-brand/10"
            style={{ top: '88px', backgroundColor: '#f1e6d6' }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-charcoal-brand/40">Booking via</span>
            <img
              src={partnerBenefit.logoUrl}
              alt={partnerBenefit.name}
              className="w-auto object-contain"
              style={{
                maxWidth: `${partnerBenefit.logoDisplayWidth ?? 100}px`,
                maxHeight: `${partnerBenefit.logoDisplayHeight ?? 28}px`,
              }}
              draggable={false}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
                    {entry.iconPublicId ? (
                      <>
                        <CloudinaryImage
                          publicId={entry.iconPublicId}
                          plugins={[]}
                          alt=""
                          className="nav-svg-link__img"
                          width={420}
                          height={420}
                          draggable={false}
                        />
                        <span className="nav-svg-link__label">{entry.label}</span>
                      </>
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
