import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isBackOfficePath } from './useFavicon.js';

const WIDGET_SRC =
  'https://lolodesk.lolasrentals.com/widget/web-chat.js?key=6ed3fffaf88bb33b3bfe9dfb303928300b984543653543b9';
const SCRIPT_ID = 'lolodesk-web-chat-script';
const WIDGET_ROOT_ID = 'lolodesk-web-chat';
const HIDE_STYLE_ID = 'lolodesk-web-chat-hidden';

/**
 * Loads the Lolo chat widget on customer-facing pages only. The widget can't be
 * unloaded once injected, so moving to a back-office or partner page hides it.
 */
export function useLoloChatWidget(): boolean {
  const { pathname } = useLocation();
  const showChat = !isBackOfficePath(pathname);

  useEffect(() => {
    if (showChat && !document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = WIDGET_SRC;
      script.async = true;
      document.body.appendChild(script);
    }

    const hideStyle = document.getElementById(HIDE_STYLE_ID);
    if (showChat) {
      hideStyle?.remove();
    } else if (!hideStyle) {
      const style = document.createElement('style');
      style.id = HIDE_STYLE_ID;
      style.textContent = `#${WIDGET_ROOT_ID} { display: none !important; }`;
      document.head.appendChild(style);
    }
  }, [showChat]);

  return showChat;
}
