import { useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'cookie_notice_dismissed';

export function CookieNotice() {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      return false;
    }
  });

  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore — private browsing may block writes
    }
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed bottom-0 left-0 right-0 z-[200] flex items-center gap-3 bg-[#363737] px-4 py-3 text-white/90 md:px-6"
    >
      <p className="flex-1 text-xs leading-relaxed text-white/80">
        We use Google Analytics to understand how visitors use our site. By continuing to browse
        you accept this.{' '}
        <Link
          to="/book/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-white"
        >
          Learn more in our Privacy Policy
        </Link>
        .
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss cookie notice"
        className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M1 1l12 12M13 1L1 13" />
        </svg>
      </button>
    </div>
  );
}
