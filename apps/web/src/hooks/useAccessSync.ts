import { useEffect } from 'react';
import { refreshAccess } from '../api/client.js';

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Keeps the signed-in user's permissions current while the app is open:
 * on load, when the tab regains focus, and every few minutes. Any API
 * response also triggers a refresh when the server reports a new version.
 */
export function useAccessSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void refreshAccess();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshAccess();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAccess();
    }, REFRESH_MS);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [enabled]);
}
