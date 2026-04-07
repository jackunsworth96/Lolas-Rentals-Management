import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { AnimatePresence, motion, useInView } from 'framer-motion';

import menuPaw from '../../assets/Menu_Paw_Clean.png';
import './AnimatedList.css';

// ── AnimatedItem — adapted from react-bits AnimatedList ──────────────────────

interface AnimatedItemProps {
  children: ReactNode;
  delay?: number;
  index: number;
  onMouseEnter: () => void;
  onClick: () => void;
}

function AnimatedItem({
  children,
  delay = 0,
  index,
  onMouseEnter,
  onClick,
}: AnimatedItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });

  return (
    <motion.div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={inView ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0 }}
      transition={{ duration: 0.2, delay }}
      style={{ marginBottom: '0.2rem', cursor: 'pointer', width: '100%' }}
    >
      {children}
    </motion.div>
  );
}

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

interface OverlayItem {
  label: string;
  href: string;
  isSub: boolean;
}

interface TopNavProps {
  /** Kept for PageLayout API compatibility — not rendered (paw replaces logo). */
  logo: string;
  logoAlt?: string;
  items: NavItem[];
  rightSlot?: ReactNode;
}

// ── TopNav ────────────────────────────────────────────────────────────────────

export default function TopNav({ items, rightSlot }: TopNavProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [keyboardNav, setKeyboardNav] = useState(false);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

  const listRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    href === '/book' ? pathname === '/book' : pathname.startsWith(href);

  // Flatten nav items: dropdown parents keep their href, children appear below
  // as sub-items. Gives us a single scrollable list for AnimatedList.
  const overlayItems = useMemo<OverlayItem[]>(
    () =>
      items.flatMap((item) => {
        if (item.isDropdown) {
          return [
            { label: item.label, href: item.href, isSub: false },
            ...(item.dropdownItems ?? []).map((d) => ({
              label: d.label,
              href: d.href,
              isSub: true,
            })),
          ];
        }
        return [{ label: item.label, href: item.href, isSub: false }];
      }),
    [items],
  );

  const handleItemSelect = useCallback(
    (item: OverlayItem) => {
      navigate(item.href);
      setMenuOpen(false);
      setSelectedIndex(-1);
    },
    [navigate],
  );

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(
      scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1),
    );
  }, []);

  // Keyboard navigation — active only while overlay is open
  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.min(prev + 1, overlayItems.length - 1));
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        handleItemSelect(overlayItems[selectedIndex]);
      } else if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen, overlayItems, selectedIndex, handleItemSelect]);

  // Auto-scroll to keyboard-selected item
  useEffect(() => {
    if (!keyboardNav || selectedIndex < 0 || !listRef.current) return;
    const container = listRef.current;
    const selectedEl = container.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`,
    );
    if (selectedEl) {
      const margin = 50;
      const { scrollTop, clientHeight } = container;
      const top = selectedEl.offsetTop;
      const bottom = top + selectedEl.offsetHeight;
      if (top < scrollTop + margin) {
        container.scrollTo({ top: top - margin, behavior: 'smooth' });
      } else if (bottom > scrollTop + clientHeight - margin) {
        container.scrollTo({
          top: bottom - clientHeight + margin,
          behavior: 'smooth',
        });
      }
    }
    setKeyboardNav(false);
  }, [selectedIndex, keyboardNav]);

  // Reset selection on close
  useEffect(() => {
    if (!menuOpen) setSelectedIndex(-1);
  }, [menuOpen]);

  return (
    <>
      {/*
       * overflow-visible lets the paw spill above the nav top edge.
       * PageLayout's overflowX:'hidden' forces overflow-y:'auto' (CSS spec),
       * which may clip the above-nav sliver when the header sticks.
       * Fix: remove overflowX from PageLayout's root <div> if needed.
       */}
      <header className="relative sticky top-0 z-50 h-16 w-full overflow-visible border-b border-charcoal-brand/10 bg-sand-brand shadow-sm">

        {/* ── Paw — the only nav element; toggles the overlay ── */}
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

      {/* ── Full-screen nav overlay (starts below nav bar) ── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="nav-overlay"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col items-center justify-center bg-sand-brand"
          >
            {/* Close (X) */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="absolute right-5 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center text-charcoal-brand"
            >
              <X size={24} />
            </button>

            {/* AnimatedList */}
            <div className="scroll-list-container">
              <div
                ref={listRef}
                className="scroll-list no-scrollbar"
                onScroll={handleScroll}
              >
                {overlayItems.map((item, index) => (
                  <AnimatedItem
                    key={`${item.href}-${item.label}`}
                    delay={index * 0.05}
                    index={index}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => handleItemSelect(item)}
                  >
                    <div
                      className={[
                        'item',
                        selectedIndex === index || isActive(item.href) ? 'selected' : '',
                        item.isSub ? 'sub-item' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <p className="item-text">{item.label}</p>
                    </div>
                  </AnimatedItem>
                ))}
              </div>
              <div className="top-gradient" style={{ opacity: topGradientOpacity }} />
              <div className="bottom-gradient" style={{ opacity: bottomGradientOpacity }} />
            </div>

            {rightSlot && <div className="mt-8">{rightSlot}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
