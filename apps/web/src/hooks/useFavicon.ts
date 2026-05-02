import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const CLOUDINARY_BASE = 'https://res.cloudinary.com/dk3c78pro/image/upload';
const CUSTOMER_IMAGE_PATH = 'v1777723254/Lola_s_Style_Guide_Creative_7_slfvlj.png';
const BACKOFFICE_IMAGE_PATH = 'v1777724927/Lola_s_Style_Guide_Creative_8_j1sv1c.png';

const CUSTOMER_PATH_PREFIXES = [
  '/book',
  '/waiver',
  '/refund-policy',
  '/peace-of-mind',
  '/unsubscribe',
  '/paw-card',
];

function isBackOfficePath(pathname: string): boolean {
  if (pathname === '/') return false;
  return !CUSTOMER_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const FAVICON_LINKS: Array<{ rel: string; size: number }> = [
  { rel: 'icon', size: 32 },
  { rel: 'icon', size: 16 },
  { rel: 'apple-touch-icon', size: 180 },
  { rel: 'icon', size: 192 },
  { rel: 'icon', size: 512 },
];

function injectPngFavicons(head: HTMLHeadElement, imagePath: string) {
  FAVICON_LINKS.forEach(({ rel, size }) => {
    const link = document.createElement('link');
    link.rel = rel;
    link.type = 'image/png';
    link.setAttribute('sizes', `${size}x${size}`);
    link.href = `${CLOUDINARY_BASE}/c_fill,w_${size},h_${size}/${imagePath}`;
    head.appendChild(link);
  });
}

function setFaviconLinks(isBackOffice: boolean) {
  const head = document.head;

  const existing = head.querySelectorAll(
    'link[rel="icon"], link[rel="apple-touch-icon"]',
  );
  existing.forEach((el) => el.remove());

  injectPngFavicons(
    head,
    isBackOffice ? BACKOFFICE_IMAGE_PATH : CUSTOMER_IMAGE_PATH,
  );
}

/**
 * Swaps the favicon between the customer-facing logo and the back-office LRM
 * tile depending on the route. Back-office = anything that isn't
 * a /book, /waiver, or other public customer path.
 */
export function useFavicon() {
  const { pathname } = useLocation();

  useEffect(() => {
    setFaviconLinks(isBackOfficePath(pathname));
  }, [pathname]);
}
