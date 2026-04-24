import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
] as const;

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find((l) => i18n.language.startsWith(l.code)) ?? LANGUAGES[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function selectLanguage(code: string) {
    void i18n.changeLanguage(code);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Language: ${currentLang.label}`}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-charcoal-brand/10"
      >
        <GlobeIcon />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 min-w-[130px] overflow-hidden rounded-xl border border-charcoal-brand/10 bg-white shadow-lg"
          role="menu"
        >
          {LANGUAGES.map((lang) => {
            const active = i18n.language.startsWith(lang.code);
            return (
              <button
                key={lang.code}
                type="button"
                role="menuitem"
                onClick={() => selectLanguage(lang.code)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-sand-brand ${
                  active
                    ? 'font-black text-teal-brand'
                    : 'font-medium text-charcoal-brand'
                }`}
              >
                {active && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-brand" aria-hidden />
                )}
                {!active && <span className="h-1.5 w-1.5 shrink-0" aria-hidden />}
                {lang.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-charcoal-brand/70"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
