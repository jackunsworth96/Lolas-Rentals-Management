import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

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

interface TopNavProps {
  logo: string;
  logoAlt?: string;
  items: NavItem[];
  rightSlot?: ReactNode;
}

export default function TopNav({ logo, logoAlt = 'Logo', items, rightSlot }: TopNavProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/book' ? pathname === '/book' : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 w-full items-center border-b border-charcoal-brand/10 bg-sand-brand px-4 shadow-sm md:px-8">
        {/* Logo — left third */}
        <div className="flex flex-1 items-center">
          <Link to="/book" className="flex flex-shrink-0 items-center" onClick={() => setMenuOpen(false)}>
            <img src={logo} alt={logoAlt} className="h-10 w-auto" />
          </Link>
        </div>

        {/* Desktop nav — true center */}
        <nav className="hidden items-center gap-1 md:flex">
          {items.map((item) => {
            const active = isActive(item.href);

            if (item.isDropdown) {
              return (
                <div key={item.href} className="group/dropdown relative">
                  <button
                    type="button"
                    className={`flex items-center gap-1 px-3 py-2 font-lato text-sm font-semibold transition-colors duration-200 ${
                      active
                        ? 'border-b-2 border-teal-brand pb-1.5 text-teal-brand'
                        : 'text-charcoal-brand/70 hover:text-teal-brand'
                    }`}
                  >
                    {item.label}
                    <ChevronDown size={14} className="mt-px transition-transform duration-200 group-hover/dropdown:rotate-180" />
                  </button>

                  {/* Dropdown panel — shown on hover via group */}
                  <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden min-w-[200px] rounded-xl border border-charcoal-brand/10 bg-cream-brand py-2 shadow-lg group-hover/dropdown:pointer-events-auto group-hover/dropdown:block">
                    {item.dropdownItems?.map((d) => (
                      <Link
                        key={d.href}
                        to={d.href}
                        className={`block w-full px-4 py-2.5 font-lato text-sm transition-colors duration-150 ${
                          isActive(d.href)
                            ? 'text-teal-brand'
                            : 'text-charcoal-brand/70 hover:bg-sand-brand/50 hover:text-teal-brand'
                        }`}
                      >
                        {d.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                to={item.href}
                className={`px-3 py-2 font-lato text-sm font-semibold transition-colors duration-200 ${
                  active
                    ? 'border-b-2 border-teal-brand pb-1.5 text-teal-brand'
                    : 'text-charcoal-brand/70 hover:text-teal-brand'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right slot + hamburger — right third */}
        <div className="flex flex-1 items-center justify-end gap-3">
          {rightSlot && <div className="hidden md:block">{rightSlot}</div>}
          <button
            type="button"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center text-2xl text-charcoal-brand md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile full-screen overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-sand-brand"
          >
            {/* Close button */}
            <button
              type="button"
              className="fixed right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center text-2xl text-charcoal-brand"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              ✕
            </button>

            {items.map((item) => {
              const active = isActive(item.href);

              if (item.isDropdown) {
                return (
                  <div key={item.href} className="flex flex-col items-center gap-3">
                    <span
                      className={`font-headline text-2xl font-bold ${active ? 'text-teal-brand' : 'text-charcoal-brand/50'}`}
                    >
                      {item.label}
                    </span>
                    {item.dropdownItems?.map((d) => (
                      <Link
                        key={d.href}
                        to={d.href}
                        className={`font-lato text-lg font-semibold transition-colors duration-200 ${
                          isActive(d.href) ? 'text-teal-brand' : 'text-charcoal-brand/70 hover:text-teal-brand'
                        }`}
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
                  className={`py-3 text-center font-headline text-2xl font-bold transition-colors duration-200 ${
                    active ? 'text-teal-brand' : 'text-charcoal-brand hover:text-teal-brand'
                  }`}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}

            {rightSlot && <div className="pt-4">{rightSlot}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
