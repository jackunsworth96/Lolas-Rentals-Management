import { useEffect, useState } from 'react';

const TOOLTIP_TEXT = "Need help? Chat with Lolo";
const TYPE_MS = 38;
const SHOW_DELAY_MS = 900;
const DISMISS_MS = 8000;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function ChatLauncherTooltip() {
  const [visible, setVisible] = useState(false);
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const showTimer = window.setTimeout(() => {
      setVisible(true);
      if (reduceMotion) {
        setDisplayed(TOOLTIP_TEXT);
        return;
      }

      let index = 0;
      const typeTimer = window.setInterval(() => {
        index += 1;
        setDisplayed(TOOLTIP_TEXT.slice(0, index));
        if (index >= TOOLTIP_TEXT.length) window.clearInterval(typeTimer);
      }, TYPE_MS);
    }, SHOW_DELAY_MS);

    const dismissTimer = window.setTimeout(() => {
      setVisible(false);
    }, SHOW_DELAY_MS + DISMISS_MS);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(dismissTimer);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none fixed bottom-[92px] right-4 z-[100001] md:bottom-[104px] md:right-6',
        'transition-all duration-500 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      ].join(' ')}
    >
      <div className="relative max-w-[220px] rounded-2xl rounded-br-md bg-white px-4 py-2.5 shadow-xl ring-1 ring-charcoal-brand/10">
        <p className="font-lato whitespace-nowrap text-sm font-bold leading-none text-charcoal-brand">
          {displayed}
          {visible && displayed.length < TOOLTIP_TEXT.length && (
            <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-teal-brand align-middle" />
          )}
        </p>
        <span
          className="absolute -bottom-2 right-5 h-0 w-0"
          style={{
            borderLeft: '8px solid transparent',
            borderRight: '0 solid transparent',
            borderTop: '8px solid white',
            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.06))',
          }}
        />
      </div>
    </div>
  );
}
